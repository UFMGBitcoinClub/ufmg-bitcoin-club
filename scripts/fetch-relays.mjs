#!/usr/bin/env node
// Network probe (architecture.md §6/§8): at build time, measure per-relay
// health (connect latency + club-event counts via a read-only REQ) and
// collect NIP-11 relay information documents, then write src/data/relays.json
// for the site's terminal panel.
//
// READ-ONLY by design (architecture.md §2): this script performs REQ queries
// and HTTP GETs only. No signing, no publishing, no private key.
//
// Non-fatal: if every probe fails and a previously committed relays.json
// exists, the old file is kept — a build-runner outage must not overwrite a
// good snapshot with an all-FAIL one.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELAYS } from "./lib/relays.mjs";
import { createPool } from "./lib/pool.mjs";
import { CLUB_PUBKEY } from "../src/config/club.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/relays.json");

const CONNECT_TIMEOUT_MS = 10000;
const EOSE_TIMEOUT_MS = 10000;
const NIP11_TIMEOUT_MS = 5000;
const PROBED_KINDS = [0, 1, 6, 31922, 31923, 32268];

async function readExisting() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function hostOf(relayUrl) {
  try {
    return new URL(relayUrl).host;
  } catch {
    return relayUrl;
  }
}

function httpsUrl(relayUrl) {
  if (relayUrl.startsWith("wss://")) return "https://" + relayUrl.slice(6);
  if (relayUrl.startsWith("ws://")) return "http://" + relayUrl.slice(5);
  return relayUrl;
}

async function fetchNip11(relayUrl) {
  try {
    const res = await fetch(httpsUrl(relayUrl), {
      headers: { Accept: "application/nostr+json" },
      signal: AbortSignal.timeout(NIP11_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const doc = await res.json();
    const limitation = doc.limitation ?? {};
    const limits = {};
    for (const key of [
      "max_message_length",
      "max_subscriptions",
      "max_filters",
      "auth_required",
      "payment_required",
      "restriction",
    ]) {
      if (limitation[key] !== undefined) limits[key] = limitation[key];
    }
    return {
      name: doc.name ?? null,
      description: doc.description ?? null,
      software: doc.software ?? null,
      version: doc.version ?? null,
      pubkey: doc.pubkey ?? null,
      contact: doc.contact ?? null,
      supportedNips: Array.isArray(doc.supported_nips) ? doc.supported_nips : [],
      limits,
    };
  } catch {
    return null;
  }
}

async function probeRelay(pool, relayUrl) {
  const result = {
    url: relayUrl,
    host: hostOf(relayUrl),
    ok: false,
    latencyMs: null,
    error: null,
    nip11: null,
    eventCounts: {},
    totalEvents: 0,
    probedAt: new Date().toISOString(),
  };

  const nip11Promise = fetchNip11(relayUrl);

  try {
    const t0 = Date.now();
    const relay = await pool.ensureRelay(relayUrl);
    result.latencyMs = Date.now() - t0;
    result.ok = true;

    if (CLUB_PUBKEY && !CLUB_PUBKEY.startsWith("REPLACE_WITH")) {
      const events = await new Promise((resolve) => {
        const found = [];
        let sub;
        const finish = () => {
          try {
            sub?.close();
          } catch {}
          resolve(found);
        };
        const timer = setTimeout(finish, EOSE_TIMEOUT_MS);
        try {
          sub = relay.subscribe(
            [{ authors: [CLUB_PUBKEY], kinds: PROBED_KINDS, limit: 400 }],
            {
              onevent: (ev) => found.push(ev),
              oneose: () => {
                clearTimeout(timer);
                finish();
              },
            }
          );
        } catch (err) {
          clearTimeout(timer);
          console.warn(`[fetch-relays] subscribe failed for ${relayUrl}: ${err?.message ?? err}`);
          resolve(found);
        }
      });

      const deduped = new Map();
      for (const ev of events) deduped.set(ev.id, ev);
      const counts = {};
      for (const ev of deduped.values()) {
        counts[ev.kind] = (counts[ev.kind] ?? 0) + 1;
      }
      result.eventCounts = counts;
      result.totalEvents = deduped.size;
    }
  } catch (err) {
    result.ok = false;
    result.error = err?.message ?? String(err);
  }

  result.nip11 = await nip11Promise;
  return result;
}

async function main() {
  console.log(`[fetch-relays] Probing ${RELAYS.length} relays (connect + NIP-11 + club events)...`);

  const pool = createPool();
  const relays = await Promise.all(RELAYS.map((url) => probeRelay(pool, url)));
  pool.close(RELAYS);

  const probedAt = new Date().toISOString();
  const okCount = relays.filter((r) => r.ok).length;

  if (okCount === 0) {
    const existing = await readExisting();
    if (existing && Array.isArray(existing.relays) && existing.relays.some((r) => r.ok)) {
      console.warn(
        "[fetch-relays] Every probe failed but a healthy relays.json already exists — keeping it (likely a build-runner outage)."
      );
      return;
    }
    console.warn(
      "[fetch-relays] Every probe failed and no healthy snapshot exists — writing the all-FAIL result (honest first run)."
    );
  }

  const payload = { relays, probedAt };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(`[fetch-relays] Wrote relays.json (${okCount}/${relays.length} relays ok)`);
}

main().catch((err) => {
  // Non-fatal by design — a fetch failure must never break the build.
  console.error("[fetch-relays] Unexpected error:", err);
});
