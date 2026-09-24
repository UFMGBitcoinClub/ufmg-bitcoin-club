---
name: Membership application
about: Apply to become a member of UFMG Bitcoin Club
labels: membership
---

## Membership application

Add your pubkey to the registry, a maintainer approves it by merging. The merge commit becomes your
public "member since" date on the site.

**npub:** `npub1...`
**hex pubkey:** `...64-char hex...`
**Signed claim:** `note1...` / `nevent1...` (a kind:1 note signed with the key above, referencing this PR — proof that the GitHub account and the Nostr
identity belong to the same person)

### Checklist

- [ ] `src/config/members.mjs` updated with my hex pubkey (npub decodes to it)
- [ ] My kind:0 profile (name + about, ideally picture) is published on
      public relays and resolvable
- [ ] The signed claim note above is signed by this pubkey and mentions this PR
- [ ] Optional `roleOverride` / `githubUrl` / `linkedinUrl` filled if I want them shown (links point to real profiles)

### Notes for maintainers

- CI validates the registry automatically (npub format, duplicates).
- Verify the signed claim on any Nostr client before approving.