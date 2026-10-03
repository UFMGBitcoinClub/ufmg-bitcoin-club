#!/usr/bin/env node
// Phase 2 (architecture.md §6, extended for reposts): fetch the club's
// recent kind:1 notes and kind:6 reposts (NIP-18) at build time, resolve
// repost targets, and write a merged, sorted feed to src/data/feed.json.
//
// Like fetch-profile.mjs, this never fails the build. A genuinely empty
// account (zero notes/reposts on first run) is a valid state and gets
// written as an empty feed. A *total* relay failure — nothing came back
// at all, when a non-empty feed.json already exists — is treated as
// probable outage, and the previous file is left untouched instead of
// being wiped to an empty list.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { createPool, queryRelays } from "./lib/pool.mjs";
import { CLUB_PUBKEY } from "../src/config/club.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/feed.json");
const FEED_LIMIT = 50;

async function readExistingFeed() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  if (!CLUB_PUBKEY || CLUB_PUBKEY.startsWith("REPLACE_WITH")) {
    console.warn("[fetch-notes] CLUB_PUBKEY is not set — skipping fetch.");
    return;
  }

  console.log(`[fetch-notes] Querying kind:1 and kind:6 for ${CLUB_PUBKEY}...`);

  const pool = createPool();

  const [notes, reposts] = await Promise.all([
    queryRelays(pool, RELAYS, { authors: [CLUB_PUBKEY], kinds: [1], limit: FEED_LIMIT }),
    queryRelays(pool, RELAYS, { authors: [CLUB_PUBKEY], kinds: [6], limit: FEED_LIMIT }),
  ]);

  // NIP-18: a repost's `content` MAY contain the stringified original
  // event JSON. If it doesn't, we resolve it via the `e` tag pointing at
  // the original event id.
  const unresolvedIds = [];
  const repostShells = reposts.map((r) => {
    let embedded = null;
    if (r.content && r.content.trim().length > 0) {
      try {
        embedded = JSON.parse(r.content);
      } catch {
        embedded = null;
      }
    }
    const refId = r.tags.find((t) => t[0] === "e")?.[1] ?? null;
    if (!embedded && refId) unresolvedIds.push(refId);
    return { repostEvent: r, refId, embedded };
  });

  const resolvedById = new Map();
  if (unresolvedIds.length > 0) {
    const resolved = await queryRelays(pool, RELAYS, { ids: unresolvedIds });
    for (const ev of resolved) resolvedById.set(ev.id, ev);
  }

  pool.close(RELAYS);

  const normalizedNotes = notes.map((n) => ({
    type: "note",
    id: n.id,
    pubkey: n.pubkey,
    created_at: n.created_at,
    content: n.content,
  }));

  const normalizedReposts = repostShells
    .map(({ repostEvent, refId, embedded }) => {
      const original = embedded ?? (refId ? resolvedById.get(refId) : null) ?? null;
      if (!original) return null; // couldn't resolve on any relay — drop it
      return {
        type: "repost",
        id: repostEvent.id,
        created_at: repostEvent.created_at,
        original: {
          id: original.id,
          pubkey: original.pubkey,
          created_at: original.created_at,
          content: original.content,
        },
      };
    })
    .filter(Boolean);

  const existing = await readExistingFeed();
  const byId = new Map();

  // Seed with existing feed items
  for (const prev of existing?.items ?? []) {
    if (prev?.id) byId.set(prev.id, prev);
  }

  // Overlay fresh normalized notes and reposts
  const freshItems = [...normalizedNotes, ...normalizedReposts];
  for (const item of freshItems) {
    if (item?.id) byId.set(item.id, item);
  }

  if (byId.size === 0) {
    if (existing && existing.items && existing.items.length > 0) {
      console.warn(
        "[fetch-notes] No items returned from any relay but a non-empty feed.json already exists — keeping it."
      );
      return;
    }
    console.warn("[fetch-notes] No notes or reposts found. Writing empty feed (first run or genuinely empty account).");
  }

  const items = [...byId.values()]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 100);

  const feed = { items, fetchedAt: new Date().toISOString() };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(feed, null, 2) + "\n", "utf-8");
  console.log(`[fetch-notes] Wrote feed.json (${items.length} items)`);
}

main().catch((err) => {
  // Non-fatal by design — a fetch failure must never break the build.
  console.error("[fetch-notes] Unexpected error:", err);
});
