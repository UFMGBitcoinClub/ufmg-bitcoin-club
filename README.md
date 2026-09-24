# Bitcoin Students Club — Website (Phase 1)

[![Build and Deploy](https://github.com/UFMGBitcoinClub/ufmg-bitcoin-club/actions/workflows/build-deploy.yml/badge.svg)](https://github.com/UFMGBitcoinClub/ufmg-bitcoin-club/actions/workflows/build-deploy.yml)

Implements Phase 1 of `architecture.md`: a static profile page fetching
kind:0 Nostr metadata at build time, deployed to GitHub Pages.

## Before first run — replace these placeholders

1. **`src/config/club.mjs`**
   Set `CLUB_PUBKEY` (hex) and `CLUB_NPUB` to your club's actual Nostr
   identity. If you only have the npub, decode it with:
   ```js
   const { nip19 } = await import("nostr-tools");
   console.log(nip19.decode("npub1...").data);
   ```

2. **`astro.config.mjs`**
   Set `site` to `https://<your-github-username>.github.io` and `base` to
   `/<your-repo-name>` (project page) or `/` (user/org page or custom domain).

3. **`src/config/members.mjs`**
   Replace the placeholder pubkey(s) with real member hex pubkeys for the
   Members page. Optional `roleOverride`/`githubUrl`/`linkedinUrl` fields
   let you show a role label and links that aren't standard Nostr profile
   fields.

4. **`src/config/projects.mjs`**
   Hand-edit the Proof of Work project cards — this is static content, not
   fetched from Nostr.

5. **`src/config/contribute.mjs`**
   Set `LIGHTNING_ADDRESS` to a real Lightning Address (e.g. from Alby or
   Wallet of Satoshi) so the Contribute page's QR code generates correctly.

6. **Homepage "Join the Network" form** (`src/components/JoinBlock.astro`)
   has no backend to submit to yet — it's a static site by design. Point
   `action` at a free static-form service (e.g. Formspree) or swap it for
   a `mailto:` link before launch. See the code comment in that file.

## Local setup

```bash
npm install
npm run fetch:all   # runs all 4 generators: profile, notes/feed, calendar, members, QR
npm run dev          # http://localhost:4321
npm run build        # fetch:all + static build into dist/
npm run preview      # serve the built dist/ locally
```

Individual generators can also be run on their own: `npm run fetch:profile`,
`npm run fetch:notes`, `npm run fetch:calendar`, `npm run fetch:members`,
`npm run fetch:badges`, `npm run validate:members`, `npm run generate:qr`.

## Membership & badges

- Membership works by pull request: a member opens a PR adding their pubkey
  to `src/config/members.mjs` (template in
  `.github/pull_request_template.md`); CI validates the registry
  (format + duplicates) and a maintainer merges.
- Badges (founder, challenge completions, meetup series) are **NIP-58**
  badge awards (kinds 30008/30009) signed by the club key outside this
  repository, fetched at build time by `scripts/fetch-badges.mjs` and shown
  on the Members page. Attendance evidence (NIP-52 RSVPs and check-in notes)
  is aggregated by `scripts/fetch-members.mjs`.

## Enabling GitHub Pages deployment

In the repo's Settings → Pages, set **Source** to "GitHub Actions" (not
"Deploy from a branch"). Pushing to `main` will then run
`.github/workflows/build-deploy.yml`, which fetches profile data, builds
the site, and deploys it automatically. You can also trigger a rebuild
manually from the Actions tab (`workflow_dispatch`) at any time — useful
right after the manager publishes a profile update.

## Phase 1 Definition of Done

See `architecture.md` §6 for the full checklist. Before calling Phase 1
complete, verify in particular:
- `view-source` on the deployed page shows profile content in the raw
  HTML (not injected by client JS).
- Browser devtools Network tab shows **no** requests to any relay —
  all fetching happens at build time only.
- Deleting/breaking `CLUB_PUBKEY` temporarily and rebuilding does not
  crash the build (falls back to the committed `profile.json`).
