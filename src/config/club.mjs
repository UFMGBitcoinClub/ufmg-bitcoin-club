// Public Nostr identity for the club.
//
// This is NOT a secret. npub/hex pubkeys are public by design and safe
// to commit to source control. Only ever the club's PRIVATE key must
// never appear anywhere in this repository (see architecture.md §2 and §8 —
// write/read segregation).
//
// To get CLUB_PUBKEY from an npub, use nostr-tools:
//   import { nip19 } from "nostr-tools";
//   const { data } = nip19.decode("npub1...");
//   console.log(data); // hex pubkey

export const CLUB_NPUB = "npub1cxxlm9ckvk594jwrtyqrdlmze9uyttu6hvn2yme9sqaml5qk3reqyyu4wn";
export const CLUB_PUBKEY = "c18dfd971665a85ac9c3590036ff62c97845af9abb26a26f25803bbfd01688f2";
