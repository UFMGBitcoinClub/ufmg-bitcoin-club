// Custom event kinds defined by the Bitcoin Students Club network.
//
// 32268 — "Proof of Work" project record (paper / repo / pull request).
// Parameterized replaceable event (NIP-01 range 30000–39999): identified
// by (pubkey, kind, d-tag), editable in place without duplicating entries.
//
// Full tag specification lives in architecture.md §7. A formal NIP for
// this kind is planned once more than one club's relay is running it.
export const PROOF_OF_WORK_KIND = 32268;