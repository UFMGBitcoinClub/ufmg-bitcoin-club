// Static "Proof of Work" project ledger. This is NOT fetched from Nostr —
// papers, repos, and PRs don't map cleanly onto a single Nostr event kind
// the way profiles/notes/calendar events do, so this is hand-curated.
// Add/edit entries directly here.
export const PROJECTS = [
  {
    id: "PAPER_01",
    status: "PUBLISHED", // PUBLISHED | ACTIVE | MERGED
    title: "Lightning Network Routing Heuristics",
    description:
      "Analyzing efficiency and privacy trade-offs in multi-path routing algorithms across highly connected graph topologies within the LN.",
    contributors: "npub1xyz...789, Alice M.",
    linkLabel: "FETCH WHITEPAPER.PDF",
    linkUrl: "#",
  },
  {
    id: "REPO_01",
    status: "ACTIVE",
    title: "LN Watchtower Rust Implementation",
    description:
      "A lightweight, rust-based watchtower service to protect Lightning Network nodes against routing failures and channel breaches.",
    contributors: "Carol J., Dave K.",
    linkLabel: "VIEW ON GITHUB",
    linkUrl: "#",
  },
  {
    id: "PR_01",
    status: "MERGED",
    title: "Core PR #28331: P2P V2 Transport",
    description:
      "Implementing the encrypted P2P v2 transport protocol (BIP-324) to enhance privacy and security of Bitcoin node communications.",
    contributors: "npub1abc...123",
    linkLabel: "VIEW PULL REQUEST",
    linkUrl: "#",
  },
];
