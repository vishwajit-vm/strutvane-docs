# CLAUDE.md: Strutvane Docs (public documentation site)

Project memory for Claude Code. Keep it short and current.

## Ecosystem memory (shared by every Strutvane repo)

The file below is synced from strutvane-tooling and is identical in every repo. It covers how the whole ecosystem fits together: repo map, decisions, connection rules, standards, workflow and current status. Read it before changing anything.

@.claude/ECOSYSTEM.md

## What this repo is

The versioned documentation site for **Strutvane** (Starlight, one Astro build per version, merged into one site), published to GitHub Pages at `https://vishwajit-vm.github.io/strutvane-docs/` (`/docs/0.2.x/…` current, `/docs/0.1.x/…` end of life). The repo is `vishwajit-vm/strutvane-docs`. Locally it lives at `packages/docs/` inside the hub folder.

**This repo is a deploy mirror.** The site is written in the hub at `spikes/15-versioned-docs-site/` and imported with `npm run sync` (`scripts/sync-from-hub.mjs`, committed snapshot only). Never edit pages, site code or dependencies here: the next sync overwrites them. Repo-owned files: `README.md`, `LICENSE`, `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.claude/`, `.github/`, `scripts/sync-from-hub.mjs`, `scripts/v1-redirects.mjs`.

## Branches

- `main`: the versioned site; both versions build from `versions/<branch>/` (why: README "Branches"). Push = deploy.
- `0.1.x`: the original v1 site, frozen with its history. Not deployed. Old v1 URLs redirect to `/docs/0.1.x/` (`scripts/v1-redirects.mjs`).

## Commands (npm)

- `npm run sync`: import the hub's committed docs snapshot (`--ref`, `--hub`, `--allow-dirty`)
- `npm ci`, then `npm run verify`: build every version + link check + type check + tests. Must pass; it is the deploy gate.
- `npm run dev`, `npm run preview`

## Gotchas

- The built-site tests pin the base `/strutvane-docs/` and the Pages origin; a custom domain needs a hub change first.
- In Git Bash, `DOCS_BASE=/` gets rewritten into a Windows path. Use PowerShell, or set `MSYS_NO_PATHCONV=1`.
- Sync adjustments are anchored on exact text in the hub's files; if the hub changes them, sync stops and names the adjustment to update.

## Where things are

- `DESIGN.md`: how the site works (the hub's design notes); `docs/WRITING-GUIDE.md`: how pages are written
- `versions.json`: support table; `docs.sources.ts`: where each version's pages come from
- `versions/<branch>/`: pages + `navigation.json`; `src/data/packages.json`: package catalogue
- `.github/workflows/deploy.yml`: verify + deploy to Pages; `ci.yml`: the same gate on PRs
