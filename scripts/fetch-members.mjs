#!/usr/bin/env node
// Members page data source. Fetches kind:0 profile metadata for every
// pubkey in src/config/members.mjs and merges it with any local overrides
// (role label, GitHub/LinkedIn links — see members.mjs for why those are
// stored locally rather than parsed from arbitrary profile JSON).
//
// Also aggregates member engagement evidence against our NIP-52 calendar:
//   - RSVPs  (kinds 31924/31925)   — self-attested "planned to attend"
//   - check-in notes (kind 1 with e/a tags referencing a club event) —
//     self-attested "claims attended"
// The strong, third-party tier of attendance proof arrives separately as
// club-signed NIP-58 badge awards (see scripts/fetch-badges.mjs).
//
// `joinedAt` comes from git history: the oldest commit that added the
// pubkey to src/config/members.mjs. Requires a non-shallow checkout
// (the workflow uses fetch-depth: 0); falls back to null otherwise.

import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { createPool, queryRelays } from "./lib/pool.mjs";
import { CLUB_PUBKEY } from "../src/config/club.mjs";
import { MEMBERS } from "../src/config/members.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/members.json");
const CALENDAR_PATH = path.resolve(__dirname, "../src/data/calendar.json");

const RSVP_KINDS = [31924, 31925];
const CHECKIN_LIMIT = 250;

function joinedAtFromGit(pubkey) {
  try {
    const out = execFileSync(
      "git",
      ["log", "--format=%ct", "-S", pubkey, "--", "src/config/members.mjs"],
      { encoding: "utf-8" }
    );
    const stamps = out.split("\n").filter(Boolean).map(Number);
    if (stamps.length === 0) return null;
    return Math.min(...stamps); // oldest commit that touched the pubkey
  } catch {
    return null;
  }
}

/** Calendar event ids + address tags ("31923:<pubkey>:<d>") we track. */
async function loadCalendarIndex() {
  try {
    const cal = JSON.parse(await readFile(CALENDAR_PATH, "utf-8"));
    const ids = new Set();
    const addresses = new Set();
    for (const e of [...(cal.upcoming ?? []), ...(cal.past ?? [])]) {
      ids.add(e.id);
      if (e.d) addresses.add(`${e.kind ?? 31923}:${CLUB_PUBKEY}:${e.d}`);
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
    if (t[0] === "a" && t[1]) addresses.add(t[1]);
  }
  return { ids, addresses };
}

function dedupeById(events) {
  const byId = new Map();
  for (const evt of events) byId.set(evt.id, evt);
  return [...byId.values()].sort((a, b) => b.created_at - a.created_at);
}

async function main() {
  const configured = MEMBERS.filter(
    (m) => m.pubkey && !m.pubkey.startsWith("REPLACE_WITH")
  );

  if (configured.length === 0) {
    console.warn("[fetch-members] No member pubkeys configured — skipping fetch.");
    return;
  }

  const memberKeys = configured.map((m) => m.pubkey);
  console.log(`[fetch-members] Querying data for ${memberKeys.length} member(s)...`);

  const { ids: calendarIds, addresses: calendarAddresses } = await loadCalendarIndex();

  const pool = createPool();
  const [profileEvents, rsvpEvents, noteEvents] = await Promise.all([
    queryRelays(pool, RELAYS, { authors: memberKeys, kinds: [0] }),
    queryRelays(pool, RELAYS, { authors: memberKeys, kinds: RSVP_KINDS, limit: 500 }),
    queryRelays(pool, RELAYS, { authors: memberKeys, kinds: [1], limit: CHECKIN_LIMIT }),
  ]);
  pool.close(RELAYS);

  // Replaceable event semantics: keep only the newest kind:0 per pubkey.
  const latestByPubkey = new Map();
  for (const evt of profileEvents) {
    const existing = latestByPubkey.get(evt.pubkey);
    if (!existing || evt.created_at > existing.created_at) latestByPubkey.set(evt.pubkey, evt);
  }

  // Attendance: per-member Set of referenced calendar event ids.
  const rsvpsByPubkey = new Map();
  for (const evt of dedupeById(rsvpEvents)) {
    const refs = referencesOf(evt);
    const hit = new Set();
    for (const id of refs.ids) if (calendarIds.has(id)) hit.add(id);
    for (const addr of refs.addresses) if (calendarAddresses.has(addr)) hit.add(addr);
    if (hit.size === 0) continue;
    const set = rsvpsByPubkey.get(evt.pubkey) ?? new Set();
    for (const id of hit) set.add(id);
    rsvpsByPubkey.set(evt.pubkey, set);
  }

  const checkinsByPubkey = new Map();
  for (const evt of dedupeById(noteEvents)) {
    const refs = referencesOf(evt);
    const hit = new Set();
    for (const id of refs.ids) if (calendarIds.has(id)) hit.add(id);
    for (const addr of refs.addresses) if (calendarAddresses.has(addr)) hit.add(addr);
    if (hit.size === 0) continue;
    const set = checkinsByPubkey.get(evt.pubkey) ?? new Set();
    for (const id of hit) set.add(id);
    checkinsByPubkey.set(evt.pubkey, set);
  }

  const members = configured.map((m) => {
    const evt = latestByPubkey.get(m.pubkey);
    let content = {};
    if (evt) {
      try {
        content = JSON.parse(evt.content);
      } catch (err) {
        console.warn(`[fetch-members] Failed to parse profile for ${m.pubkey}: ${err.message}`);
      }
    } else {
      console.warn(`[fetch-members] No kind:0 event found for ${m.pubkey} on any relay.`);
    }

    const joinedAtMs = joinedAtFromGit(m.pubkey);

    return {
      pubkey: m.pubkey,
      name: content.display_name || content.name || null,
      picture: content.picture || null,
      about: m.roleOverride || content.about || null,
      nip05: content.nip05 || null,
      githubUrl: m.githubUrl || null,
      linkedinUrl: m.linkedinUrl || null,
      joinedAt: joinedAtMs ? new Date(joinedAtMs * 1000).toISOString() : null,
      attendance: {
        rsvp: [...(rsvpsByPubkey.get(m.pubkey) ?? [])].sort(),
        checkin: [...(checkinsByPubkey.get(m.pubkey) ?? [])].sort(),
      },
    };
  });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ members, fetchedAt: new Date().toISOString() }, null, 2) + "\n",
    "utf-8"
  );
  console.log(`[fetch-members] Wrote members.json (${members.length} member(s))`);
}

main().catch((err) => {
  console.error("[fetch-members] Unexpected error:", err);
});