import { defineConfig } from "astro/config";

// GitHub Pages deployment notes (see architecture.md §6, Phase 1):
// - If deploying as a PROJECT page (username.github.io/repo-name), `base`
//   MUST match the repo name, e.g. base: "/bitcoin-students-club".
// - If deploying as a USER/ORG page (username.github.io) or a custom
//   domain, set base: "/" and update `site` accordingly.
export default defineConfig({
  site: "https://UFMGBitcoinClub.github.io",
  base: "/clube-bitcoin-ufmg",
});
