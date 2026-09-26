// Thin wrapper around nostr-tools SimplePool.
//
// IMPORTANT (architecture.md §2): this project only ever performs READ
// (REQ) operations against relays. No signing, no publishing, no private
// key ever appears in this codebase. Do not add a `publish` helper here.

import { SimplePool } from "nostr-tools/pool";

// 15s+: GitHub Actions runners have cold WebSocket handshakes; 8s was tight
// enough that slow-but-alive relays silently contributed nothing.
const DEFAULT_TIMEOUT_MS = 20000;

export function createPool() {
  return new SimplePool();
}

/**
 * Query relays for events matching `filter`, merged across all relays.
 * Never throws — returns an empty array on total failure so build scripts
 * can fall back to previously committed data instead of breaking the build.
 *
 * Logs per-relay EOSE/CLOSED/error so partial failures are visible in CI
 * output instead of silently degrading to whatever arrived.
 */
export async function queryRelays(pool, relays, filter, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const closed = new Map(); // url -> close reason from relay
  const closeHandler = (url, reason) => {
    const detail = reason?.message ?? reason ?? "closed";
    // "EVENT-subscription-id" style reasons are normal EOSE terminations;
    // only surface unusual closes.
    if (!/^EVENT-/.test(String(detail))) closed.set(url, detail);
  };
  const errorHandler = (url, err) => {
    console.warn(`[pool] relay error ${url}: ${err?.message ?? err}`);
  };

  pool.onclose = closeHandler;
  pool.onerror = errorHandler;

  try {
    const events = await pool.querySync(relays, filter, { maxWait: timeoutMs });
    const result = events ?? [];

    if (closed.size > 0) {
      console.warn(
        `[pool] relay(s) closed early: ${[...closed.entries()]
          .map(([url, why]) => `${url} (${why})`)
          .join(", ")}`
      );
    }
    console.log(
      `[pool] query kind(s)=${[...new Set([].concat(filter?.kinds ?? []))].join(",")} -> ${result.length} events`
    );
    return result;
  } catch (err) {
    console.warn(`[pool] query failed: ${err?.message ?? err}`);
    return [];
  } finally {
    pool.onclose = null;
    pool.onerror = null;
  }
}
