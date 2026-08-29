// Single source of truth for relay URLs (architecture.md §8: "Relay config
// is centralized... never hardcode relay URLs elsewhere.").
//
// When the official UFMG relay exists, add it here — no other file should
// need to change.

export const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://purplepag.es", // metadata-focused relay, good for kind:0 lookups
];
