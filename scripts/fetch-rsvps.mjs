#!/usr/bin/env node
// NIP-52 RSVP aggregation (read side): fetches event RSVPs (kind 31924 for
// date-based calendar events, kind 31925 for range-based) from ALL Nostr
// users and aggregates them per club calendar event.
//
// RSVPs are parameterized replaceable events: only the newest per
// (pubkey, d) counts. Each RSVP references its calendar event via an
// `a` tag ("31923:<pubkey>:<d>") or an `e` tag (event id); we match both
// against the calendar.json index. The `status` tag carries the response:
// accepted (going), tentative (maybe), declined (can't go).
//
// Non-fatal like every fetch script: on a total relay outage with a
// previously committed healthy rsvps.json, the old snapshot is kept;
// a genuinely empty first run writes an honest empty state.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { createPool, queryRelays } from "./lib/pool.mjs";
import { CLUB_PUBKEY } from "../src/config/club.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/rsvps.json");
const CALENDAR_PATH = path.resolve(__dirname, "../src/data/calendar.json");

const RSVP_KINDS = [31924, 31925];
const RSVP_LIMIT = 1000;

const VALID_STATUSES = new Set(["accepted", "tentative", "declined"]);
const DEFAULT_STATUS = "accepted";

function tagValue(tags, name) {
  const tag = tags.find((t) => t[0] === name);
  return tag ? tag[1] : null;
}

async function readCalendarIndex() {
  try {
    const cal = JSON.parse(await readFile(CALENDAR_PATH, "utf-8"));
    const ids = new Set();
    const addresses = new Set();
    for (const e of [...(cal.upcoming ?? []), ...(cal.past ?? [])]) {
      ids.add(e.id);
      if (e.d) addresses.add(`${e.kind ?? 31923}:${CLUB_PUBKEY.toLowerCase()}:${e.d.toLowerCase()}`);
    }
    return { ids, addresses };
  } catch {
    return { ids: new Set(), addresses: new Set() };
  }
}

/** All event references (e/a tags) an event points at. */
function referencesOf(evt) {
  const ids = new Set();
  const addresses = new Set();
  for (const t of evt.tags ?? []) {
    if (t[0] === "e" && t[1]) ids.add(t[1]);
    if (t[0] === "a" && t[1]) addresses.add(t[1].toLowerCase());
  }
  return { ids, addresses };
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
    console.warn("[fetch-rsvps] CLUB_PUBKEY is not set — skipping fetch.");
    return;
  }

  console.log("[fetch-rsvps] Querying RSVP kinds 31924/31925...");

  const { ids: calendarIds, addresses: calendarAddresses } = await readCalendarIndex();
  if (calendarIds.size === 0 && calendarAddresses.size === 0) {
    console.warn("[fetch-rsvps] calendar.json is empty — nothing to aggregate against.");
  }

  const pool = createPool();
  const rsvpEvents = await queryRelays(pool, RELAYS, { kinds: RSVP_KINDS, limit: RSVP_LIMIT });
  pool.close(RELAYS);

  // NIP-52 replaceable semantics: keep only the newest RSVP per (pubkey, d).
  const latestByKey = new Map();
  for (const evt of rsvpEvents) {
    const d = tagValue(evt.tags, "d");
    const key = `${evt.pubkey}:${d ?? evt.id}`;
    const existing = latestByKey.get(key);
    if (!existing || evt.created_at > existing.created_at) latestByKey.set(key, evt);
  }

  // Aggregate per calendar event (indexed by both id and address).
  const zero = () => ({ going: 0, tentative: 0, declined: 0 });
  const byEvent = new Map();
  const bump = (key, status) => {
    const bucket = byEvent.get(key) ?? zero();
    bucket[status] += 1;
    byEvent.set(key, bucket);
  };

  for (const evt of latestByKey.values()) {
    const refs = referencesOf(evt);
    const matchedIds = [...refs.ids].filter((id) => calendarIds.has(id));
    const matchedAddresses = [...refs.addresses].filter((a) => calendarAddresses.has(a));
    if (matchedIds.length === 0 && matchedAddresses.length === 0) continue;

    const rawStatus = tagValue(evt.tags, "status") ?? DEFAULT_STATUS;
    const status = VALID_STATUSES.has(rawStatus) ? rawStatus : DEFAULT_STATUS;

    for (const id of matchedIds) bump(id, status);
    for (const addr of matchedAddresses) bump(addr, status);
  }

  const payload = {
    byEvent: Object.fromEntries(byEvent),
    fetchedAt: new Date().toISOString(),
  };

  const hasContent = byEvent.size > 0;
  if (!hasContent) {
    const existing = await readExisting();
    if (existing && Object.keys(existing.byEvent ?? {}).length > 0) {
      console.warn(
        "[fetch-rsvps] No RSVP events returned by any relay — keeping previously committed rsvps.json (assuming outage, not empty state)."
      );
      return;
    }
    console.warn("[fetch-rsvps] No RSVPs published yet. Writing honest empty state.");
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(`[fetch-rsvps] Wrote rsvps.json (${byEvent.size} event(s) with RSVPs)`);
}

main().catch((err) => {
  console.error("[fetch-rsvps] Unexpected error:", err);
});
