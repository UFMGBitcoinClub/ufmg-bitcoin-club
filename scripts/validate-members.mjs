#!/usr/bin/env node
// CI guardrail for the membership registry (src/config/members.mjs).
//
// Unlike the fetch scripts, this one is ALLOWED to fail the build: an
// invalid members file is a code bug, not a relay outage. Membership
// works by PR (see .github/pull_request_template.md): a new member adds
// their pubkey hex to members.mjs and a maintainer merges it.
//
// Checks:
//   1. every entry has a 64-char hex pubkey (fatal)
//   2. no duplicate pubkeys (fatal)
//   3. no placeholder/REPLACE values (fatal)
//   4. liveness: profile decodable on relays (warning only — a relay
//      outage must never block CI)
//
// Optional: verify the key-ownership claim note referenced in the PR
// manually on review — the merge itself remains the trust anchor.

import { createPool, queryRelays } from "./lib/pool.mjs";
import { RELAYS } from "./lib/relays.mjs";

const HEX64 = /^[0-9a-f]{64}$/;

async function main() {
  const { MEMBERS } = await import("../src/config/members.mjs");

  if (!Array.isArray(MEMBERS) || MEMBERS.length === 0) {
    console.error("[validate-members] MEMBERS is empty — the club needs at least one member.");
    process.exit(1);
  }

  const errors = [];
  const keys = [];
  const seen = new Map();

  MEMBERS.forEach((m, i) => {
    const pk = (m.pubkey ?? "").toLowerCase();
    if (!HEX64.test(pk)) {
      errors.push(
        `entry ${i}: pubkey is not 64-char lowercase hex (${JSON.stringify(m.pubkey)})`
      );
      return;
    }
    if (seen.has(pk)) {
      errors.push(`entry ${i}: duplicate pubkey (first listed at entry ${seen.get(pk)})`);
      return;
    }
    seen.set(pk, i);
    keys.push(pk);
  });

  if (errors.length > 0) {
    console.error("[validate-members] Invalid members registry:");
    for (const e of errors) console.error(`  - ${e}`);
    console.error(`[validate-members] Fix src/config/members.mjs before merging.`);
    process.exit(1);
  }

  console.log(`[validate-members] Registry OK — ${keys.length} unique member pubkey(s).`);

  // Liveness probe: warning-only, never fails CI.
  try {
    const pool = createPool();
    const events = await queryRelays(
      pool,
      RELAYS,
      { authors: keys, kinds: [0], limit: 1 },
      5000
    );
    pool.close(RELAYS);
    const found = new Set(events.map((e) => e.pubkey));
    for (const pk of keys) {
      if (!found.has(pk)) {
        console.warn(
          `[validate-members] WARNING: no kind:0 profile found for ${pk.slice(0, 8)}... on any relay (may be relay outage, or the member has no profile yet).`
        );
      }
    }
  } catch (err) {
    console.warn(`[validate-members] WARNING: liveness probe failed: ${err?.message ?? err}`);
  }
}

main().catch((err) => {
  console.error("[validate-members] Unexpected error:", err);
  process.exit(1);
});