// Club members shown on the Members page.
//
// Membership works by PR: add your pubkey here, a maintainer merges it.
// See .github/pull_request_template.md for the application flow.
//
// `pubkey` (hex) is required — profile picture/name/about come from the
// member's live kind:0 Nostr event, fetched by scripts/fetch-members.mjs.
//
// `roleOverride`, `githubUrl`, `linkedinUrl` are optional. Nostr's kind:0
// has no standardized "role" or GitHub/LinkedIn fields — different clients
// stuff different ad-hoc keys into the content JSON, so rather than guess,
// we store these locally when a member wants them shown.
//
// Badges (founder, challenge completions, meetup series) are NOT listed
// here: they are club-signed NIP-58 badge awards (definitions kind 30009,
// awards kind 8) published by the club manager outside this repo, fetched
// at build time by scripts/fetch-badges.mjs.
export const MEMBERS = [
  {
    pubkey: "6a8cc5cf25ff56e3652bca7a4947119f3cc162e693a31b63d9afc6d859691925", // dsha256(npub) — replace with your own 64-char hex pubkey
    roleOverride: "Distributed Systems Engineer & Nostr Enthusiast.",
    githubUrl: "https://github.com/ViniMF13",
    linkedinUrl: "https://www.linkedin.com/in/viniciusmf13/",
  },
  // Add more members here via pull request, e.g.:
  // {
  //   pubkey: "...64-char-hex...",
  //   roleOverride: "Smart Contract Engineer & Cryptographer.",
  //   githubUrl: "https://github.com/...",
  // },
];