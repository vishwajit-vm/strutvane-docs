<div align="center">

# Strutvane Docs

**The versioned documentation site for [Strutvane](https://github.com/vishwajit-vm/strutvane).**

[![Deploy docs](https://github.com/vishwajit-vm/strutvane-docs/actions/workflows/deploy.yml/badge.svg)](https://github.com/vishwajit-vm/strutvane-docs/actions/workflows/deploy.yml)
[![Built with Starlight](https://img.shields.io/badge/built%20with-Starlight-ff5d01)](https://starlight.astro.build)
[![Code: MIT](https://img.shields.io/badge/code-MIT-green.svg)](LICENSE)
[![Content: CC BY 4.0](https://img.shields.io/badge/content-CC%20BY%204.0-lightgrey.svg)](LICENSE)

</div>

**Live site:** https://vishwajit-vm.github.io/strutvane-docs/ (redirects to the current version, `/strutvane-docs/docs/0.2.x/introduction/`)

This repository is what GitHub Pages builds. The docs are **written in the hub** ([`spikes/15-versioned-docs-site`](https://github.com/vishwajit-vm/strutvane/tree/main/spikes/15-versioned-docs-site) in `vishwajit-vm/strutvane`) and imported here with one command. How the site works, and why, is in [DESIGN.md](DESIGN.md) (the hub's design notes, imported with the site). How pages are written is in [docs/WRITING-GUIDE.md](docs/WRITING-GUIDE.md).

## URLs

| URL | What it is |
|---|---|
| `/strutvane-docs/` and `/strutvane-docs/docs/` | Redirect to the current version's Introduction |
| `/strutvane-docs/docs/0.2.x/{page}/` | Strutvane 0.2 (current) |
| `/strutvane-docs/docs/0.1.x/{page}/` | Strutvane 0.1 (end of life, with an "old version" banner) |
| `/strutvane-docs/docs/latest/{page}/`, `/strutvane-docs/docs/{page}/` | Redirect to the same page in the current version |
| `/strutvane-docs/docs/0.2.x/{page}.md`, `…/llms.txt`, `…/llms-full.txt` | Markdown exports for "Copy as Markdown" and AI tools |
| `/strutvane-docs/versions.json` | The support table (which lines exist, which is current) |
| Old v1 URLs such as `/strutvane-docs/getting-started/quick-start/` | Redirect to the matching 0.1.x page, or to the 0.1.x home when 0.1.x didn't keep that page ([`scripts/v1-redirects.mjs`](scripts/v1-redirects.mjs)) |

Every page has a version switcher at the top of the menu: it opens the same page in the other version, or that version's home when the page doesn't exist there.

## Branches, and why both versions build from `main`

| Branch | What it holds |
|---|---|
| `main` | The versioned site: site code, `versions.json`, and every version's pages in `versions/<branch>/` (`versions/0.2.x`, `versions/0.1.x`). Pushing to `main` deploys. |
| `0.1.x` | The original v1 site (the old unversioned Starlight site), frozen with its full history. Not deployed: its pages were imported into `versions/0.1.x` in the new format. |

The design ([DESIGN.md](DESIGN.md), "How versions map to code branches") gives each docs line a branch and reads a **released** line's pages straight from that branch (`'0.2.x': { git: { ref: 'origin/0.2.x', path: 'content' } }` in `docs.sources.ts`). Each version is still built separately, under its own `/docs/<branch>/` path with its own search index, and the builds are merged into one site. Today **both versions build from `main`'s `versions/` folders** (the snapshot's `docs.sources.ts`, unchanged), because:

- **0.2 isn't released yet** (`released: null` in `versions.json`). In the design, an unreleased line is written on `main`, and it gets its own branch only when it ships.
- **The `0.1.x` branch holds the v1 site in its old format** (`src/content/docs/`, its own sidebar config), not the `content/` + `navigation.json` layout the build reads. Its pages were converted into `versions/0.1.x` instead, so the archive stays exactly as it was published.
- **The pages are written in the hub.** A branch per line here would mean a second place to edit. One import from the hub keeps one source of truth.

When 0.2.0 ships, follow "Releasing a new docs version" in [DESIGN.md](DESIGN.md): freeze the line onto a `0.2.x` branch with its pages in `content/`, and point `docs.sources.ts` at `origin/0.2.x`. The workflows already check out every branch (`fetch-depth: 0`).

## Update the docs (one command)

Pages are edited in the hub, committed there, then imported here:

```bash
# in the local workspace (this repo at packages/docs/ inside the hub folder)
npm run sync            # import the hub's COMMITTED snapshot (git HEAD) of the docs folder
npm ci
npm run verify          # build every version, check every link, type-check, run the tests
git add -A
git commit -s -m "docs: sync from hub <short sha>"
git push origin main    # deploys
```

[`scripts/sync-from-hub.mjs`](scripts/sync-from-hub.mjs) options: `--hub <path>` (default `../..`), `--ref <git ref>` (default `HEAD`; for example `origin/main` to publish only what is pushed), `--allow-dirty`. It reads files from a commit with `git ls-tree` and `git cat-file`, so writers' uncommitted work in the hub is never published, and the hub's working tree is never touched. It:

- deletes files the hub removed and writes the rest (the hub's `README.md` becomes `DESIGN.md`);
- never touches the files this repo owns: `README.md`, `LICENSE`, `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.claude/`, `.github/` and its own two scripts;
- applies four checked adjustments: the package name and licence in `package.json` and `package-lock.json`, `build` also running `scripts/v1-redirects.mjs`, and "Edit this page" links opening the page in the hub (where it's really edited) instead of a `0.2.x` branch here that doesn't exist yet, with the built-site test that pins that link updated to match;
- records the imported hub commit in `hub-snapshot.json`.

It stops before writing anything if the hub ref or folder is missing, a file isn't a regular file, this repo has uncommitted changes, an adjustment's anchor text has changed in the hub, or our `.gitignore` lacks one of the hub's rules.

**Don't edit pages, site code or dependencies here:** the next sync overwrites them. Change them in the hub. (Dependabot PRs for npm packages belong in the hub too.)

## Run it locally

You need **Node.js 24+** and npm.

```bash
npm ci
npm run dev                      # live preview of the current version: http://localhost:4321/strutvane-docs/docs/0.2.x/introduction/
npm run dev -- --version 0.1.x   # another version
npm run build                    # every version → dist/, plus redirects (search, redirects and switching need this)
npm run preview                  # serve dist/ like GitHub Pages: http://localhost:4321/strutvane-docs/
npm run verify                   # build + link check + type check + tests: the deploy gate
```

## Deploy

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main` (and by hand: Actions → Deploy docs → Run workflow). It runs `npm ci` and `npm run verify`, so **any broken link, failing test or type error stops the deploy**, then uploads `dist/` and deploys it with `actions/deploy-pages`. Actions are pinned by commit SHA, and only the deploy job gets `pages: write` and `id-token: write`. [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same gate on pull requests.

To redeploy without a change: `gh workflow run deploy.yml --repo vishwajit-vm/strutvane-docs --ref main`.

**Custom domain later:** the workflow passes the Pages URL and base path to the build (`DOCS_SITE`, `DOCS_BASE`). The built-site tests pin `/strutvane-docs/`, so they will fail (and block the deploy) until they're updated in the hub for the new domain.

## License

- **Code** (site code, scripts, components): [MIT](LICENSE)
- **Documentation content** (`versions/**`): [CC BY 4.0](LICENSE). Share and adapt it with credit.
