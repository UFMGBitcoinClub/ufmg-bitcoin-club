#!/usr/bin/env node
// Members page data source (new — not one of the original 3 phases, added
// alongside the visual design work). Fetches kind:0 profile metadata for
// every pubkey in src/config/members.mjs and merges it with any local
// overrides (role label, GitHub/LinkedIn links — see members.mjs for why
// those are stored locally rather than parsed from arbitrary profile JSON).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { createPool, queryRelays } from "./lib/pool.mjs";
import { MEMBERS } from "../src/config/members.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/members.json");

async function main() {
  const configured = MEMBERS.filter(
    (m) => m.pubkey && !m.pubkey.startsWith("REPLACE_WITH")
  );

  if (configured.length === 0) {
    console.warn("[fetch-members] No member pubkeys configured — skipping fetch.");
    return;
  }

  console.log(`[fetch-members] Querying kind:0 for ${configured.length} member(s)...`);

  const pool = createPool();
  const events = await queryRelays(pool, RELAYS, {
    authors: configured.map((m) => m.pubkey),
    kinds: [0],
  });
  pool.close(RELAYS);

  // Replaceable event semantics: keep only the newest kind:0 per pubkey.
  const latestByPubkey = new Map();
  for (const evt of events) {
    const existing = latestByPubkey.get(evt.pubkey);
    if (!existing || evt.created_at > existing.created_at) latestByPubkey.set(evt.pubkey, evt);
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

    return {
      pubkey: m.pubkey,
      name: content.display_name || content.name || null,
      picture: content.picture || null,
      about: m.roleOverride || content.about || null,
      nip05: content.nip05 || null,
      githubUrl: m.githubUrl || null,
      linkedinUrl: m.linkedinUrl || null,
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
