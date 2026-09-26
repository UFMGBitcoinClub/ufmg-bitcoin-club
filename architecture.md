# Architecture — UFMG Bitcoin Club Webpage

This document describes how this project works and all tecnologies used.

---

## 1. Purpose

This project is a simple 

## 2. Core Principle: Write/Read Segregation

WRITE PATH (manual, outside this repo's runtime)
Club manager → Nostr client or a small publish script
→ signs with their own key → publishes to relays

READ PATH (this project, fully automated)
GitHub Actions (scheduled + manual dispatch)
→ fetch scripts (Node + nostr-tools) → query relays (read-only)
→ write static JSON into src/data/ → Astro build → GitHub Pages


No private key, signing call, or write-capable relay operation exists
anywhere in this codebase — with one deliberate exception: the Events
page lets visitors publish NIP-52 RSVP events (kinds 31924/31925). Those
events are signed by the visitor's own NIP-07 browser extension
(`window.nostr.signEvent`) — the site never holds, sees, or transmits a
private key, it only relays member-signed events. Every fetch script
performs read-only `REQ` queries only.

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Site framework | Astro (static output, zero JS by default) |
| Nostr library | nostr-tools, used only in build-time Node scripts |
| QR generation | `qrcode` npm package, build-time SVG (no runtime third-party calls) |
| CI/CD | GitHub Actions — push, scheduled cron (every 4h), manual dispatch |
| Hosting | GitHub Pages |
| Styling | Hand-written CSS, no framework |
| Form backend | Formspree (static form `action`, no JS, no backend of our own) |

## 4. Visual Design System

Warm off-white background (`#faf8f1`), near-black text (`#17140f`),
monospace type (JetBrains Mono / IBM Plex Mono), orange accent (`#dd8830`)
used only for links/active states/highlights, never as a background. All
design tokens and shared utility classes (`.btn`, `.panel`, `.badge`,
`.grid-3`, header/footer/nav styles) live in `src/styles/global.css`.

## 5. Site Map

| Route | Purpose | Data source |
|---|---|---|
| `/` | Hero (club profile), recent activity feed, relay terminal, join CTA | `profile.json`, `feed.json`, `relays.json`, `calendar.json` |
| `/manifesto` | Club manifesto | static placeholder text (future: fetched Nostr long-form event) |
| `/join` | Join form | Formspree (`https://formspree.io/f/xvkogdzl`) |
| `/events` | Upcoming + past events | `calendar.json` (NIP-52) |
| `/proof-of-work` | Research/project ledger | `projects.json` (custom kind, §7) |
| `/members` | Club member roster (registry source-of-truth: `src/config/members.mjs`, membership by PR) + NIP-58 honors | `members.json`, `badges.json` |
| `/contribute` | Lightning donation + other ways to help | static config + build-time QR |

## 6. Data Sources (Nostr Kinds Used)

| Kind | Meaning | Fetch script | Output |
|---|---|---|---|
| `0` | Club profile metadata | `fetch-profile.mjs` | `profile.json` |
| `0` (batch) | Member profile metadata | `fetch-members.mjs` | `members.json` |
| `1`, `6` | Notes + reposts | `fetch-notes.mjs` | `feed.json` |
| `31922`, `31923` | NIP-52 calendar events | `fetch-calendar.mjs` | `calendar.json` |
| `32268` | Proof of Work project record (custom — see §7) | `fetch-projects.mjs` | `projects.json` |
| probe (REQ) + NIP-11 | Per-relay health: connect latency, club-event counts per kind, relay info document | `fetch-relays.mjs` | `relays.json` |
| `30009` (definition), `8` (award) — NIP-58 | Badge definitions + club-signed badge awards | `fetch-badges.mjs` | `badges.json` |
| `31924`, `31925`, check-in `1`s | Member engagement evidence (RSVPs / check-in notes referencing club calendar events — self-attested tier) | `fetch-members.mjs` | `members.json` (`attendance`, `joinedAt`) |
| `31924`, `31925` (all authors) | Per-event RSVP aggregates ("N going · M maybe") across every Nostr user, not just members | `fetch-rsvps.mjs` | `rsvps.json` |

All fetch scripts share `scripts/lib/relays.mjs` (single relay list) and
`scripts/lib/pool.mjs` (read-only SimplePool wrapper). All are non-fatal:
a relay outage falls back to previously committed JSON rather than
breaking the build; a genuinely empty result on first run writes an
honest empty state instead.

## 7. Custom Kind 32268 — Proof of Work Project Record

A parameterized replaceable event (NIP-01 range `30000–39999`): identified
by `(pubkey, kind, d-tag)`, editable in place without leaving duplicate
stale copies on relays. Chosen so any standards-compliant public relay
stores and serves it without needing to recognize the kind specifically —
relays make storage decisions by range, not by kind number.

**Tags:**

| Tag | Required | Meaning |
|---|---|---|
| `d` | yes | stable project identifier/slug |
| `title` | yes | project title |
| `status` | no (default `DRAFT`) | free text, documented known values: `PUBLISHED`, `ACTIVE`, `MERGED`. Unrecognized values render with a generic fallback badge rather than breaking. |
| `type` | no (default `project`) | free text, documented known values: `paper`, `repo`, `pr`. Drives the external-link button label; unrecognized values get a generic label. |
| `r` | no | external URL (paper, repo, PR). Standard NIP-01 tag, reused rather than inventing a new one. |
| `p` | no, repeatable | contributor pubkey (Nostr-native contributor) |
| `t` | no, repeatable | topic tag, standard hashtag convention |
| `content` | no | free-text project description |

**Compatibility policy:**
- Additive-only evolution: new optional tags may be introduced in the
  future; existing tag names never change meaning.
- Consumers must ignore unrecognized tags and tolerate missing optional
  ones — never crash on the unfamiliar.
- A genuinely incompatible change requires a **new kind number**, with
  32268 explicitly marked deprecated at that point — never redefined
  in place.
- Institutional attribution is intentionally *not* a separate tag: the
  signing pubkey already identifies the specific club account, and a
  `nip05` identifier on that account's `kind:0` profile can carry a
  human-readable institution signal if one is ever needed.
- Funding/donation requests are explicitly out of scope for this kind
  and deferred to a separate future kind, to keep "project record" and
  "funding request" as independent concerns.

**Status:** in production use by this club's site only. A formal NIP will
be drafted and published once a second club's relay is running this
kind, so the spec has a canonical home independent of any one club's
source code.

## 8. Repository Structure

├── .github/workflows/build-deploy.yml
├── scripts/
│ ├── lib/
│ │ ├── relays.mjs
│ │ ├── pool.mjs
│ │ └── kinds.mjs
│ ├── fetch-profile.mjs
│ ├── fetch-notes.mjs
│ ├── fetch-calendar.mjs
│ ├── fetch-rsvps.mjs
│ ├── fetch-members.mjs
│ ├── fetch-badges.mjs
│ ├── fetch-projects.mjs
│ ├── fetch-relays.mjs
│ └── generate-qr.mjs
├── src/
│ ├── lib/
│ │ ├── nav.js
│ │ └── url.js
│ ├── config/
│ │ ├── club.mjs
│ │ ├── members.mjs
│ │ └── contribute.mjs
│ ├── data/
│ │ ├── profile.json / feed.json / calendar.json / members.json
│ │ ├── rsvps.json / badges.json
│ │ ├── projects.json / lightning-qr.json / relays.json
│ ├── components/
│ │ ├── Header.astro / Footer.astro / Layout.astro
│ │ ├── HeroProfileCard.astro / NetworkTerminal.astro / NoteCard.astro / JoinBlock.astro
│ │ ├── EventCard.astro / ProjectCard.astro / MemberCard.astro / LightningDonate.astro
│ ├── pages/
│ │ ├── index.astro / manifesto.astro / join.astro
│ │ ├── events.astro / proof-of-work.astro / members.astro / contribute.astro
│ └── styles/global.css
├── astro.config.mjs
├── package.json
├── architecture.md
└── architecture-phases-history.md


## 9. Build & Deployment

Single GitHub Actions workflow, triggered on push to `main`, every 4
hours by cron, and manually via `workflow_dispatch`: install deps → run
`npm run fetch:all` (all generators) → `astro build` → deploy to
GitHub Pages. No server, no database, no paid infrastructure.

## 10. Known Manual Steps / Limitations

- **Publishing** any of the custom-schema data (calendar events, project
  records) requires either a NIP-52/kind-aware client or a small CLI
  script — generic Nostr clients don't know this project's specific tag
  conventions for kind 32268.
- **Placeholders still requiring real values:** `CLUB_PUBKEY`/`CLUB_NPUB`
  in `src/config/club.mjs`, `site`/`base` in `astro.config.mjs`, member
  pubkeys in `src/config/members.mjs`, `LIGHTNING_ADDRESS` in
  `src/config/contribute.mjs`.
- **Formspree redirect:** configure a custom redirect URL in the
  Formspree dashboard for the `/join` form once the real domain/base
  path is set — otherwise submitters land on Formspree's generic page.

## 11. Deferred / Future Work

- Formal NIP publication for kind 32268, once adopted by a second club.
- A funding/bounty event kind, separate from the project-record kind.
- NIP-51 curated "featured" lists; NIP-23 long-form articles (manifesto,
  research write-ups); NIP-57 zap integration on the Contribute page.
- Official UFMG-run relay (relay list is centralized in
  `scripts/lib/relays.mjs`, so this is a one-line addition when ready).
- NIP-46 remote signing for the manager's publishing key.

## 12. Glossary 

- **Relay** — a server storing/forwarding Nostr events; queried, never written to, by this site.
- **Kind** — an integer identifying an event's type/schema by convention.
- **Parameterized replaceable event** — only the latest event per (pubkey, kind, `d`-tag) is retained.
- **NIP** — Nostr Implementation Possibility, a numbered spec document.
- **npub / pubkey** — a Nostr identity's public key; public by design, safe to commit.