// Thin wrapper around nostr-tools SimplePool.
//
// IMPORTANT (architecture.md §2): this project only ever performs READ
// (REQ) operations against relays. No signing, no publishing, no private
// key ever appears in this codebase. Do not add a `publish` helper here.

import { SimplePool } from "nostr-tools/pool";

const DEFAULT_TIMEOUT_MS = 8000;

export function createPool() {
  return new SimplePool();
}

/**
 * Query relays for events matching `filter`, merged across all relays.
 * Never throws — returns an empty array on total failure so build scripts
 * can fall back to previously committed data instead of breaking the build.
 */
export async function queryRelays(pool, relays, filter, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const events = await pool.querySync(relays, filter, { maxWait: timeoutMs });
    return events ?? [];
  } catch (err) {
    console.warn(`[pool] query failed: ${err?.message ?? err}`);
    return [];
  }
}
