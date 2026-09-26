#!/usr/bin/env node
// Proof of Work project ledger — fetches the club's custom kind:32268
// events at build time. See architecture.md §7 for the full spec.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { PROOF_OF_WORK_KIND } from "./lib/kinds.mjs";
import { createPool, queryRelays } from "./lib/pool.mjs";
import { CLUB_PUBKEY } from "../src/config/club.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/projects.json");

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
  if (!d || !title) return null; // required fields — drop malformed events

  const contributorPubkeys = tagValues(evt.tags, "p");
  const contributorNames = tagValues(evt.tags, "contributor");

  return {
    id: evt.id,
    d,
    title,
    status: tagValue(evt.tags, "status") || "UNKNOWN",
    type: tagValue(evt.tags, "type") || "project",
    description: evt.content ?? "",
    linkUrl: tagValues(evt.tags, "r")[0] ?? null,
    contributors: [
      ...contributorNames,
      ...contributorPubkeys.map((pk) => `${pk.slice(0, 8)}...${pk.slice(-4)}`),
    ],
    tags: tagValues(evt.tags, "t"),
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
    console.warn("[fetch-projects] CLUB_PUBKEY is not set — skipping fetch.");
    return;
  }

  console.log(`[fetch-projects] Querying kind:${PROOF_OF_WORK_KIND} for ${CLUB_PUBKEY}...`);

  const pool = createPool();
  const events = await queryRelays(pool, RELAYS, {
    authors: [CLUB_PUBKEY],
    kinds: [PROOF_OF_WORK_KIND],
  });
  pool.close(RELAYS);

  const existing = await readExisting();

  if (events.length === 0 && existing && existing.projects.length > 0) {
    console.warn(
      "[fetch-projects] No events returned by any relay — keeping previously committed projects.json (assuming outage, not a genuine empty state)."
    );
    return;
  }

  // Merge with previously committed metadata: union by `d` (newest fresh
  // event wins; committed entries only carried over when the fresh fetch did
  // not return that `d` at all). This makes partial relay failures
  // non-destructive instead of all-or-nothing.
  const byD = new Map();
  for (const evt of events) {
    const d = tagValue(evt.tags, "d");
    if (!d) continue;
    const existingEvt = byD.get(d);
    if (!existingEvt || evt.created_at > existingEvt.created_at) byD.set(d, evt);
  }
  for (const prev of existing?.projects ?? []) {
    if (prev?.d && !byD.has(prev.d)) byD.set(prev.d, prev);
  }

  const projects = [...byD.values()].map(normalizeEvent).filter(Boolean);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ projects, fetchedAt: new Date().toISOString() }, null, 2) + "\n",
    "utf-8"
  );
  console.log(`[fetch-projects] Wrote projects.json (${projects.length} project(s))`);
}

main().catch((err) => {
  console.error("[fetch-projects] Unexpected error:", err);
});