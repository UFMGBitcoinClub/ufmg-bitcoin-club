#!/usr/bin/env node
// Phase 1 (architecture.md §6): fetch the club's kind:0 profile metadata
// at build time and write it to src/data/profile.json for static rendering.
//
// This script never fails the build. If every relay is unreachable, or the
// content can't be parsed, it leaves the previously committed profile.json
// untouched and exits 0 with a warning.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { createPool, queryRelays } from "./lib/pool.mjs";
import { CLUB_PUBKEY } from "../src/config/club.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/profile.json");

async function readExisting() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf-8"));
  } catch {
    return null;
  }
}

async function main() {
  if (!CLUB_PUBKEY || CLUB_PUBKEY.startsWith("REPLACE_WITH")) {
    console.warn(
      "[fetch-profile] CLUB_PUBKEY is not set in src/config/club.mjs — skipping fetch."
    );
    return;
  }

  console.log(
    `[fetch-profile] Querying kind:0 for ${CLUB_PUBKEY} across ${RELAYS.length} relays...`
  );

  const pool = createPool();
  const events = await queryRelays(pool, RELAYS, {
    authors: [CLUB_PUBKEY],
    kinds: [0],
  });
  pool.close(RELAYS);

  const existing = await readExisting();

  if (events.length === 0) {
    console.warn(
      "[fetch-profile] No kind:0 event found on any relay. Keeping previously committed profile.json."
    );
    return;
  }

  // kind:0 is a replaceable event (NIP-01) — only the newest one is current.
  const latest = events.reduce((a, b) => (b.created_at > a.created_at ? b : a));

  if (existing?.created_at && latest.created_at < existing.created_at) {
    console.warn(
      `[fetch-profile] Fetched kind:0 event is older (${latest.created_at}) than existing profile (${existing.created_at}). Keeping existing.`
    );
    return;
  }

  let content;
  try {
    content = JSON.parse(latest.content);
  } catch (err) {
    console.error(`[fetch-profile] Failed to parse profile content JSON: ${err.message}`);
    console.warn("[fetch-profile] Keeping previously committed profile.json.");
    return;
  }

  const profile = {
    pubkey: latest.pubkey || existing?.pubkey || CLUB_PUBKEY,
    created_at: latest.created_at || existing?.created_at || null,
    name: content.name ?? existing?.name ?? null,
    display_name: content.display_name ?? existing?.display_name ?? null,
    about: content.about ?? existing?.about ?? null,
    picture: content.picture ?? existing?.picture ?? null,
    banner: content.banner ?? existing?.banner ?? null,
    nip05: content.nip05 ?? existing?.nip05 ?? null,
    lud16: content.lud16 ?? existing?.lud16 ?? null,
    website: content.website ?? existing?.website ?? null,
    fetchedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(profile, null, 2) + "\n", "utf-8");
  console.log(`[fetch-profile] Wrote profile.json (name: ${profile.name ?? "unknown"})`);
}

main().catch((err) => {
  // Non-fatal by design (architecture.md Phase 1 DoD): a fetch failure
  // must never break the build.
  console.error("[fetch-profile] Unexpected error:", err);
});
