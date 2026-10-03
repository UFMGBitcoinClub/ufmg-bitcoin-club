#!/usr/bin/env node
// Phase 3 (architecture.md §6): fetch NIP-52 calendar events at build time.
//
// kind 31922 = date-based event (all-day, `start`/`end` are YYYY-MM-DD).
// kind 31923 = time-based event (`start`/`end` are unix seconds).
// Both are parameterized replaceable events — only the newest per `d` tag
// is current, so we dedupe on that before normalizing.
//
// Malformed events (missing title/start) are dropped rather than crashing
// the build, per the Phase 3 Definition of Done.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { createPool, queryRelays } from "./lib/pool.mjs";
import { CLUB_PUBKEY } from "../src/config/club.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/calendar.json");

function tagValue(tags, name) {
  const tag = tags.find((t) => t[0] === name);
  return tag ? tag[1] : null;
}

function tagValues(tags, name) {
  return tags.filter((t) => t[0] === name).map((t) => t[1]);
}

function normalizeEvent(evt) {
  const d = tagValue(evt.tags, "d");
  const title = tagValue(evt.tags, "title");
  const startRaw = tagValue(evt.tags, "start");
  const endRaw = tagValue(evt.tags, "end");
  const location = tagValue(evt.tags, "location");
  const image = tagValue(evt.tags, "image");
  const topics = tagValues(evt.tags, "t");

  if (!d || !title || !startRaw) return null;

  const dateOnly = evt.kind === 31922;
  const startMs = dateOnly ? Date.parse(startRaw) : Number(startRaw) * 1000;
  const endMs = endRaw ? (dateOnly ? Date.parse(endRaw) : Number(endRaw) * 1000) : null;

  if (Number.isNaN(startMs)) return null;

  return {
    id: evt.id,
    // d-tag + kind kept so attendance matching can resolve NIP-52 RSVP
    // `a` tags ("31923:<pubkey>:<d>") against this event (additive field).
    kind: evt.kind,
    d,
    title,
    startMs,
    endMs,
    location: location ?? null,
    // NIP-52 `image` tag (banner art) — rendered by EventCard.
    image: image ?? null,
    description: evt.content ?? "",
    tags: topics,
    dateOnly,
  };
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf-8"));
  } catch {
    return null;
  }
}

async function main() {
  if (!CLUB_PUBKEY || CLUB_PUBKEY.startsWith("REPLACE_WITH")) {
    console.warn("[fetch-calendar] CLUB_PUBKEY is not set — skipping fetch.");
    return;
  }

  const existing = await readExisting();
  const existingEvents = [
    ...(existing?.upcoming ?? []),
    ...(existing?.past ?? []),
  ];

  // Map existing normalized events by unique key (d tag, falling back to id)
  const byKey = new Map();
  for (const ev of existingEvents) {
    const key = ev.d || ev.id;
    if (key) byKey.set(key, ev);
  }

  console.log(`[fetch-calendar] Querying kinds 31922/31923 for ${CLUB_PUBKEY}...`);

  const pool = createPool();
  const events = await queryRelays(pool, RELAYS, {
    authors: [CLUB_PUBKEY],
    kinds: [31922, 31923],
  });
  pool.close(RELAYS);

  if (events.length === 0) {
    console.warn(
      "[fetch-calendar] No calendar events returned by relays. Keeping existing events and refreshing upcoming/past partition."
    );
  } else {
    // Parameterized replaceable events: keep newest raw event per d tag
    const freshByD = new Map();
    for (const evt of events) {
      const d = tagValue(evt.tags, "d");
      if (!d) continue;
      const prev = freshByD.get(d);
      if (!prev || evt.created_at > prev.created_at) freshByD.set(d, evt);
    }

    const freshNormalized = [...freshByD.values()].map(normalizeEvent).filter(Boolean);

    // Overlay fresh events onto existing events (additive merge)
    for (const ev of freshNormalized) {
      const key = ev.d || ev.id;
      if (key) byKey.set(key, ev);
    }
  }

  const allMerged = [...byKey.values()];
  if (allMerged.length === 0) {
    console.warn("[fetch-calendar] No calendar events found or previously recorded.");
    return;
  }

  const now = Date.now();
  const upcoming = allMerged
    .filter((e) => e.startMs >= now)
    .sort((a, b) => a.startMs - b.startMs);
  const past = allMerged
    .filter((e) => e.startMs < now)
    .sort((a, b) => b.startMs - a.startMs);

  const calendar = { upcoming, past, fetchedAt: new Date().toISOString() };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(calendar, null, 2) + "\n", "utf-8");
  console.log(
    `[fetch-calendar] Wrote calendar.json (${upcoming.length} upcoming, ${past.length} past, total: ${allMerged.length})`
  );
}

main().catch((err) => {
  console.error("[fetch-calendar] Unexpected error:", err);
});
