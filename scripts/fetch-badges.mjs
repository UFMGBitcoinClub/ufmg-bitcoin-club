#!/usr/bin/env node
// NIP-58 badges (read side): fetches the club's badge definitions
// (kind 30009) and club-signed badge awards (kind 8) at build time.
//
// The club manager publishes definitions and awards with their own
// signing setup outside this repository — this site only ever READS
// (architecture.md §2 write/read segregation). Any member listed in an
// award's p tags gets the badge rendered on the Members page.
//
// Non-fatal like every fetch script: on a total relay outage with a
// previously committed healthy badges.json, the old snapshot is kept;
// a genuinely empty first run writes an honest empty state.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { createPool, queryRelays } from "./lib/pool.mjs";
import { CLUB_PUBKEY } from "../src/config/club.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/badges.json");

const DEFINITIONS_LIMIT = 100;
const AWARDS_LIMIT = 500;

function tagValue(tags, name) {
  const tag = tags.find((t) => t[0] === name);
  return tag ? tag[1] : null;
}

function tagValues(tags, name) {
  return tags.filter((t) => t[0] === name).map((t) => t[1]);
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
    console.warn("[fetch-badges] CLUB_PUBKEY is not set — skipping fetch.");
    return;
  }

  console.log(`[fetch-badges] Querying NIP-58 badges for ${CLUB_PUBKEY}...`);

  const pool = createPool();
  const [definitionEvents, awardEvents] = await Promise.all([
    queryRelays(pool, RELAYS, { authors: [CLUB_PUBKEY], kinds: [30009], limit: DEFINITIONS_LIMIT }),
    queryRelays(pool, RELAYS, { authors: [CLUB_PUBKEY], kinds: [8], limit: AWARDS_LIMIT }),
  ]);
  pool.close(RELAYS);

  // Badge definitions (kind 30009) are parameterized replaceable events:
  // keep only the newest per `d` tag.
  const defsByD = new Map();
  for (const evt of definitionEvents) {
    const d = tagValue(evt.tags, "d");
    if (!d) continue;
    const existing = defsByD.get(d);
    if (!existing || evt.created_at > existing.created_at) defsByD.set(d, evt);
  }

  const definitions = [...defsByD.values()].map((evt) => ({
    id: tagValue(evt.tags, "d"),
    name: tagValue(evt.tags, "name") || tagValue(evt.tags, "d"),
    // NIP-58 puts the description in a tag; content is not standardized.
    description: tagValue(evt.tags, "description") ?? evt.content ?? null,
    image: tagValue(evt.tags, "image"),
    thumb: tagValues(evt.tags, "thumb")[0] ?? null,
  }));

  // Badge awards (kind 8, immutable): the `a` tag points at the
  // definition ("30009:<issuer-pubkey>:<d>"), `p` tags list the awarded
  // pubkeys. One award event may grant the badge to many members at once.
  // Only awards referencing the club's own kind-30009 definitions count.
  const seenAwards = new Set();
  const awards = [];
  const clubPrefix = `30009:${CLUB_PUBKEY.toLowerCase()}:`;
  for (const evt of awardEvents) {
    const a = tagValue(evt.tags, "a");
    if (!a) continue;
    if (!a.toLowerCase().startsWith(clubPrefix)) continue;
    const parts = a.split(":");
    const badgeId = parts[2] ?? null;
    if (!badgeId) continue;
    const awarded = tagValues(evt.tags, "p").filter((p) => /^[0-9a-f]{64}$/i.test(p));
    if (awarded.length === 0) continue;

    const dedupeKey = `${a}:${awarded.join(",")}`;
    if (seenAwards.has(dedupeKey)) continue;
    seenAwards.add(dedupeKey);

    for (const pubkey of awarded) {
      awards.push({ badgeId, pubkey, awardedAt: evt.created_at, eventId: evt.id });
    }
  }

  const existing = await readExisting();

  // Merge definitions (union by id/d)
  const defsMap = new Map();
  for (const prev of existing?.definitions ?? []) {
    if (prev?.id) defsMap.set(prev.id, prev);
  }
  for (const def of definitions) {
    if (def?.id) defsMap.set(def.id, def);
  }
  const mergedDefinitions = [...defsMap.values()];

  // Merge awards (union by composite key badgeId:pubkey)
  const awardsMap = new Map();
  for (const prev of existing?.awards ?? []) {
    if (prev?.badgeId && prev?.pubkey) {
      const key = `${prev.badgeId}:${prev.pubkey}`;
      awardsMap.set(key, prev);
    }
  }
  for (const award of awards) {
    const key = `${award.badgeId}:${award.pubkey}`;
    awardsMap.set(key, award);
  }
  const mergedAwards = [...awardsMap.values()].sort(
    (a, b) => (b.awardedAt || 0) - (a.awardedAt || 0)
  );

  const hasContent = mergedDefinitions.length > 0 || mergedAwards.length > 0;
  if (!hasContent) {
    console.warn("[fetch-badges] No badges published yet. Writing honest empty state.");
  }

  const payload = {
    definitions: mergedDefinitions,
    awards: mergedAwards,
    fetchedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(
    `[fetch-badges] Wrote badges.json (${mergedDefinitions.length} definition(s), ${mergedAwards.length} award(s))`
  );
}

main().catch((err) => {
  console.error("[fetch-badges] Unexpected error:", err);
});