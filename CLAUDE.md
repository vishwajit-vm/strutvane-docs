# CLAUDE.md: Strutvane Docs (public documentation site)

Project memory for Claude Code. Keep it short and current.

## Ecosystem memory (shared by every Strutvane repo)

The file below is synced from strutvane-tooling and is identical in every repo. It covers how the whole ecosystem fits together: repo map, decisions, connection rules, standards, workflow and current status. Read it before changing anything.

@.claude/ECOSYSTEM.md

## What this repo is

The public, friendly documentation site for **Strutvane**, built with Astro Starlight. It's published to GitHub Pages at `https://vishwajit-vm.github.io/strutvane-docs/`. The repo is `vishwajit-vm/strutvane-docs` (live). Locally it lives at `packages/docs/` inside the umbrella folder.

## Status

- Phase 1 is in progress: every package is implemented and tested at `0.1.0-next.0`, but nothing is on npm yet.
- Pages describing a built feature carry a caution aside titled "Pre-release (0.1.0-next): APIs may still change". Features that aren't built yet (queue/cache/mail, MySQL, Azure passwordless, SSO/SCIM/MFA, eject, auth CLI, detail pages, themes…) stay marked "Planned".
- Package pages use the real APIs from each package's README; never document an API the code doesn't have.

## Source of truth

- `../../docs/00-executive-summary.md` (decisions D1–D24) and the rest of `../../docs/`.
- The docs explain the blueprint in plain words and must **never contradict it**. If the blueprint changes, update the matching pages.

## Style rules (non-negotiable)

Full guide: `src/content/docs/community/docs-style-guide.mdx`.

1. Friendly, second person ("you"), short sentences, plain words.
2. **An example on every page**, using real code, tables or scenarios.
3. "**What you'll learn**" at the top; "**Next steps**" (LinkCards) at the bottom.
4. Explain jargon on first use, or link to `reference/glossary`.
5. Analogies are welcome: keycard (permissions), apartment building (tenancy), car (levels of control), LEGO (contracts).
6. **Relative links only** between pages (e.g. `../migrations/`), so the site works under any base path.

## Commands

pnpm runs via corepack. Never install anything globally.

- `corepack pnpm dev`: local site at http://localhost:4321/strutvane-docs/
- `corepack pnpm build`: build plus the link checker (must pass)
- `corepack pnpm check`: type-check (must show 0 errors)

## Gotchas

- `starlight-links-validator` does **not** check relative links. `scripts/check-links.mjs` checks the built HTML instead, and that check is the real gate.
- In Git Bash, `DOCS_BASE=/` gets rewritten into a Windows path. Use PowerShell, or set `MSYS_NO_PATHCONV=1`.
- Starlight 0.43 doesn't accept a `tagline` config key; the tagline lives in the home page hero.

## Where things are

- `src/content/docs/`: pages (folder path = URL)
- `astro.config.mjs`: site, base, sidebar, plugins
- `src/styles/custom.css`: brand colours
- `.claude/skills/write-doc-page/`: playbook for new pages
- `.claude/agents/docs-friendliness-reviewer.md`: review pages before merging
