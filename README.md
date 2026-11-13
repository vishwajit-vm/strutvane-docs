<div align="center">

# Strutvane Docs

**Friendly, example-first documentation for [Strutvane](https://github.com/vishwajit-vm/strutvane).**

[![Status: in development](https://img.shields.io/badge/status-in%20development-blueviolet)](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md)
[![Built with Starlight](https://img.shields.io/badge/built%20with-Starlight-ff5d01)](https://starlight.astro.build)
[![Code: MIT](https://img.shields.io/badge/code-MIT-green.svg)](LICENSE)
[![Content: CC BY 4.0](https://img.shields.io/badge/content-CC%20BY%204.0-lightgrey.svg)](LICENSE)

</div>

This repository is the public documentation site for Strutvane, a TypeScript framework for enterprise B2B apps.

**Live site:** https://vishwajit-vm.github.io/strutvane-docs/ (after the first deployment)

> Strutvane is in its design phase. The docs describe **planned** behaviour and say so clearly on each page.

## Run it locally

You need **Node.js 24+**. pnpm runs through corepack, which ships with Node, so you don't install anything globally.

```bash
corepack pnpm install
corepack pnpm dev       # http://localhost:4321/strutvane-docs/
```

| Command | What it does |
|---|---|
| `corepack pnpm dev` | Live-reloading local site |
| `corepack pnpm build` | Production build into `dist/`, followed by the link checker |
| `corepack pnpm preview` | Serve the built site locally |
| `corepack pnpm check` | Type-check the site and content |
| `corepack pnpm check:links` | Re-run the link checker on an existing `dist/` |

## Write or edit a page

1. Pages live in `src/content/docs/`. The folder path is the URL: `concepts/migrations.mdx` becomes `/concepts/migrations/`.
2. Follow the **[docs style guide](src/content/docs/community/docs-style-guide.mdx)**: friendly tone, plain words, an example on every page, "What you'll learn" at the top and "Next steps" at the bottom.
3. Use **relative links** between pages (`../models-and-fields/`). They keep working if the site moves to a custom domain.
4. Add the page to the `sidebar` in `astro.config.mjs`.
5. Run `corepack pnpm build`. It fails if any link or `#anchor` is broken.

## How quality is enforced

- **`astro check`:** type-checks the configuration and components.
- **Link checking, twice:**
  - [`starlight-links-validator`](https://github.com/HiDeoo/starlight-links-validator) checks absolute links and anchors while the site builds.
  - [`scripts/check-links.mjs`](scripts/check-links.mjs) crawls the **built HTML** and checks every internal link and anchor, including relative links, which the plugin skips.
- **CI** builds every pull request under both the GitHub Pages base path and a root base (custom-domain readiness).

## Deploy

On every push to `main`, [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the site and publishes it to **GitHub Pages**.

One-time setup: in the repository, go to **Settings → Pages**, set **Source** to **GitHub Actions**.

**Moving to a custom domain later:** configure the domain in GitHub Pages. The workflow reads the site URL and base path from GitHub automatically. To build locally for a domain, run `DOCS_SITE=https://strutvane.dev DOCS_BASE=/ corepack pnpm build`.

## Source of truth

The docs explain the [Strutvane blueprint](https://github.com/vishwajit-vm/strutvane/tree/main/docs) in friendly language and must never contradict it. If you find a conflict, open an issue.

## License

- **Code** (config, scripts, components): [MIT](LICENSE)
- **Documentation content** (`src/content/**`): [CC BY 4.0](LICENSE). Share and adapt it with credit.
