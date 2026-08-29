// Club members shown on the Members page.
//
// `pubkey` (hex) is required — their profile picture/name/about come from
// their live kind:0 Nostr event, fetched by scripts/fetch-members.mjs.
//
// `roleOverride`, `githubUrl`, `linkedinUrl` are optional. Nostr's kind:0
// has no standardized "role" or GitHub/LinkedIn fields — different clients
// stuff different ad-hoc keys into the content JSON, so rather than guess,
// we store these locally when a member wants them shown.
export const MEMBERS = [
  {
    pubkey: "REPLACE_WITH_HEX_PUBKEY_1",
    roleOverride: "Cryptographic Economics Researcher & Applied Nostr Architect.",
    githubUrl: "#",
    linkedinUrl: "#",
  },
  // Add more members here, e.g.:
  // {
  //   pubkey: "...",
  //   roleOverride: "Smart Contract Engineer & Cryptographer.",
  //   githubUrl: "https://github.com/...",
  //   linkedinUrl: "https://linkedin.com/in/...",
  // },
];
