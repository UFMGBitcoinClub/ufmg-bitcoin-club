// Single source of truth for relay URLs (architecture.md §8: "Relay config
// is centralized... never hardcode relay URLs elsewhere.").
//
// When the official UFMG relay exists, add it here — no other file should
// need to change.
//
// Notes (see scripts/relay-doctor.mjs):
// - purplepag.es and relay.nostr.band were removed: purplepag.es is
//   metadata-only (never serves custom kinds like 31922/32268) and
//   relay.nostr.band has frequent outages / restricts custom kinds.
// - nostr.wine and relay.primal.net are the only relays confirmed to return
//   the club's events during probes.

export const RELAYS = [
  "wss://nostr.wine",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://nos.lol",
];
