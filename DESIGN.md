# Spike 15: A versioned, Laravel-style docs site

**Date:** 2026-11-14. **Environment:** Windows 11, Node v24.21.0, npm 11.19.0, Astro 7.4.11, Starlight 0.43.0, Pagefind 1.6.0 (bundled by Starlight).

```bash
cd spikes/15-versioned-docs-site
npm install
npm run dev                      # live preview of the current version: http://localhost:4321/strutvane-docs/docs/0.2.x/introduction/
npm run dev -- --version 0.1.x   # live preview of another version
npm run build                    # every version → dist/ (one Astro build per version, then merged)
npm run preview                  # serve dist/ like GitHub Pages: http://localhost:4321/strutvane-docs/
npm run verify                   # build + link check (all versions) + type check + 101 tests
```

`npm run dev` shows one version with hot reload. Search, redirects and the other versions need the merged site: `npm run build && npm run preview`.

## Question

What should Strutvane's new docs site be, so that it works like Laravel's docs (chronological menu, one docs branch per version, `/docs/{version}/{page}`, version switcher, "old version" banner, search, "Copy as Markdown"), deploys to GitHub Pages, and follows the versioning design (ADR-0020, `versions.json`)?

## Answer

**Starlight, built once per version (per branch), merged into one static site.** The prototype builds 0.2.x (current, 110 pages, 41 of them full guides) and 0.1.x (end of life, 8 pages imported from the old site) into one GitHub Pages-ready `dist/`. Every internal link in both versions is checked (19,000+ links, 346 HTML pages, including switcher targets and redirects), and 101 tests pass, including a check that every full page follows the writing guide.

### What Laravel's docs do (studied 2026-11-14)

- **Menu in learning order** from one file per branch (`documentation.md` on `laravel/docs`): Prologue → Getting Started → Architecture Concepts → The Basics → Digging Deeper → Security → Database → Eloquent ORM → AI → Testing → Packages.
- **One docs branch per version** (`12.x`, `13.x`, `master`). Contributions go to the branch of the version they describe; the next release's docs go to `master`.
- **URLs** `/docs/{branch}/{page}`. Since 2026, laravel.com serves them at `/framework/docs/{branch}/{page}` (301 from the old path), and the unversioned `/docs/{page}` is the current version.
- **Old versions** show "WARNING You're browsing the documentation for an old version of Laravel. Consider upgrading your project to Laravel 13.x", linking to the same page.
- Search, "On this page", "Copy as markdown", and an agent playbook (`/for/agents`).
- **Lesson:** the support table is copied into each branch's `releases.md`, and `master` still showed the 12.x table on 2026-11-14 (versioning design §1.1). We render ours from `versions.json` in every build instead.

### Stack choice

| Option | Versioning model | Search | Fit |
|---|---|---|---|
| **Starlight, one build per branch, merged** (chosen) | Each version is its own Astro build at `/docs/{branch}/`, from its branch's content | Pagefind per version, so results are always from the version you're reading | Matches Laravel's branch model and ADR-0020 §10. Old versions never have to build with today's site code. Reuses the existing Starlight site, theme and know-how. |
| Starlight + `starlight-versions` 0.10.2 | Snapshot folders in one build; current version unversioned | One shared index | Every version must build with today's toolchain forever; URLs don't follow branch names. (Rejected by ADR-0020 too.) |
| Docusaurus versioned docs | `versioned_docs/version-x` snapshots | Algolia by default; local search via a plugin | Same snapshot model, React/MDX rewrite of the existing site, heavier. |
| VitePress | None built in | MiniSearch, not Pagefind | Would need the same per-build merge, plus a Vue rewrite. |

Starlight already gives: dark mode, friendly typography, "On this page", Expressive Code (copy buttons on every code block), tabs (synced across the page, used for macOS/Linux vs Windows, never for package managers: npm only), accessible navigation, sitemap, and Pagefind.

### URL scheme

| URL | What it is |
|---|---|
| `/strutvane-docs/docs/0.2.x/installation/` | A page of one version (the segment is the branch name) |
| `/strutvane-docs/docs/0.2.x/installation.md` | The same page as clean Markdown ("Copy as Markdown") |
| `/strutvane-docs/docs/0.2.x/llms.txt`, `llms-full.txt` | Per-version index and full text for AI tools |
| `/strutvane-docs/docs/latest/{page}/` | Redirect to the current line (stable links for READMEs) |
| `/strutvane-docs/docs/{page}/` | Redirect to the current line (like Laravel's unversioned URLs) |
| `/strutvane-docs/`, `/strutvane-docs/docs/` | Redirect to the current line's Introduction |
| `/strutvane-docs/docs/main/…` | Previews of the next line (supported; enable by adding `main` to `docs.sources.ts`) |
| `/strutvane-docs/versions.json` | The support table, for tools (`node strut about`, the installer) |

On a custom domain, build with `DOCS_SITE=https://strutvane.dev DOCS_BASE=/` and every URL loses the `/strutvane-docs` prefix; nothing else changes. GitHub Pages can't send HTTP redirects, so each redirect is a tiny HTML page (JavaScript `location.replace` keeps `#anchors`, `<meta refresh>` as fallback, `noindex` + canonical), and the site-wide `404.html` rescues `/docs/latest/…` links to pages added later.

### How versions map to code branches

- **`versions.json`** (the ADR-0020 support table, on `main`) decides which lines exist, which is current, and each line's status. It drives the switcher labels, the banners and the support table on every version's Release Notes page.
- **`docs.sources.ts`** says where each branch's Markdown is read from. Here they are folders (`versions/0.2.x`, `versions/0.1.x`). In the real `strutvane-docs` repo (laid out like `laravel/docs`), each line has a branch (`0.2.x`, `0.1.x`, `main`) with its pages in `content/`, and released lines are read with `{ git: { ref: 'origin/0.2.x', path: 'content' } }` (`git ls-tree` + `git show`, no checkout; tested against a real temporary repo).
- **Each version's own `navigation.json`** (our `documentation.md`) lives next to its pages, so each version keeps its own menu.
- **Edit this page** points at the file on that version's branch (`strutvane-docs/edit/0.2.x/content/installation.mdx`). End-of-life versions are frozen and have no edit link.
- **Build contract for a branch:** `DOCS_VERSION=0.2.x DOCS_MANIFEST=manifest.json astro build`. The manifest (every version's page list + the support table) is computed once on `main` and handed to each branch build, because a branch can't see the others. That is exactly what `npm run build` does locally.

### What the reader gets

- **Version switcher** at the top of the menu. Each option is a real URL computed at build time: the same page in the other version, or that version's home when the page doesn't exist there. The `#anchor` is kept only when the page is the same. Every target is link-checked.
- **Banners:** end of life ("You're reading the docs for Strutvane 0.1, which has reached end of life… Read this page for Strutvane 0.2"), security-only lines, `main` previews, and a "0.2 is still being built" note while the current line has no release date.
- **Canonical links** point at the current version's copy of a page, so search engines prefer current docs.
- **Search** scoped to the version you're reading (one Pagefind index per version; checked: every page is indexed).
- **Copy as Markdown**, View as Markdown and `llms.txt` on every page. MDX components become plain Markdown (tabs → bold labels, asides → quotes, link cards → lists, `<SupportTable />` → a table) and relative links become absolute.

### Content

- **0.2.x, full pages (41)**, written to [docs/WRITING-GUIDE.md](docs/WRITING-GUIDE.md) from the v2 blueprint (doc 18), ADR-0021, ADR-0022, spikes 10–14, 16, 17, 19 and 20 and the research drafts. Anything in 0.2.0 that isn't released is marked "Coming in 0.2" (saying whether a prototype proves it or it is only designed); anything the blueprint's phases put after 0.2.0 is marked "Planned after 0.2":
  - **Getting started and prologue:** Introduction, Installation (all 37 installer questions, every flag, steps, resume, exit codes), Docker (Sail-style mode, pass-throughs, the opt-in production Dockerfile and dev container), Configuration (every `.env` key), Directory Structure, Your First CRUD, Designs (Crisp and Vivid), Migrations, Seeding, Release Notes (support table from `versions.json`), Upgrade Guide 0.1 → 0.2.
  - **ORM** (only the API proven in spike 11): Getting Started, Querying, Relationships, Scopes, Casts & Accessors, Mass Assignment, Pagination, Soft Deletes, Slugs, Transactions, Tenancy.
  - **Application core** (only the API proven in spike 12): Request Lifecycle, Service Container, Service Providers, Helpers (no facades), Routing, Middleware, CSRF Protection (every style), Controllers, Requests, Validation, Responses, Error Handling, Logging (channels, ADR-0022), Authorization, CLI Reference (every command, with its status).
  - **Security and data:** Security Features (the full protections list), Authentication (spike 20), Charts (spike 16), Package Catalogue (the 100+ package approach).
- **0.2.x, "being written" pages:** every other menu entry, including all 28 first-party packages, each with an accurate 2–3 line summary. The package pages were never committed before (the hub's `.gitignore` ignores every `packages/` folder); this folder's `.gitignore` now keeps them.
- **0.1.x:** What is Strutvane?, Quick start, Project structure, Environment variables, Models and fields, Migrations and CLI commands, copied from `packages/docs` with links flattened, plus a short Release Notes page with the live support table.

## Design: Laravel's reading experience, Strutvane's look

Measured on 2026-11-14 at `laravel.com/docs/13.x/installation` (1440 × 900, dark theme, computed styles). We copy the **layout, spacing, type scale and behaviour**. We don't copy the brand: no Laravel logo, red, fonts, CSS, images or wording.

| Part | Laravel's docs | Strutvane's docs |
|---|---|---|
| **Top bar** | Full width, about 100px tall with a hairline under it. Logo on the left, a wide search box in the middle (`⌘K`), "Version 13.x" select on the right, then a theme icon. | `Header.astro`: wordmark on the left (its column is as wide as the menu, so search lines up with the text), search in the middle (`Ctrl K`), then the version select, GitHub and the theme toggle. It's 4.25rem tall, slightly translucent, with a hairline. |
| **Left menu** | About 273px. Groups in learning order (Prologue → … → Packages). Only the group you're reading is open; group names are bold and bright, links muted; the current page has a coloured bar on its left. | Starlight's sidebar, 17.5rem, with every group `collapsed`: Starlight opens the group holding the current page by itself. Bold, bright group names; muted links; an amber 2px bar marks the current page, with no filled block. |
| **Content column** | 616px wide. h1 40px, regular weight. h2 28px with 56px above and 21px below. h3 20px, medium, 40px/15px. Body 16px with a 1.8 line height, in a muted grey. | `--sl-content-width: 40rem`. h1 2.5rem/500. h2 1.75rem/500 with 3.5rem/1.25rem margins. h3 1.25rem/600 with 2.5rem/0.9rem. h4 1.0625rem. Body 1rem, line height 1.8, `gray-2` text with brighter headings and bold. |
| **Right column** | "Copy as markdown" above "On this page", which scrolls on its own and marks the current section. | `PageSidebar.astro`: Copy as Markdown, View as Markdown and `llms.txt` above Starlight's "On this page", with the current section in amber. On phones the tools sit under the title, and "On this page" becomes Starlight's dropdown. |
| **Code blocks** | A framed box with a 6px radius and a 2px inner padding, a monospace font, and a copy button. | Expressive Code: a frame with a 0.6rem radius, a **file-name tab** from `title="app/models/post.ts"`, a terminal frame for shell, a copy button, and JetBrains Mono (ligatures off, so `!=` stays two characters). |
| **Callouts** | A bordered box with a 6px radius and 12px × 16px padding. | Starlight asides as bordered cards with a 0.6rem radius and a 3px coloured left edge: blue note, green tip, amber caution, red danger. The title is in the same colour, so meaning never relies on colour alone. |
| **Previous / next** | Links at the end of every page. | Starlight's pagination as quiet bordered cards. |
| **Dark mode** | Dark by default, with a toggle. | Dark by default, a light theme, and Starlight's Auto/Light/Dark toggle. |
| **Mobile** | Logo, version, search icon and a menu button; the menu slides in. | Wordmark, search icon and menu button. The drawer holds the version switcher, the menu, GitHub and the theme toggle. |

**Palette** (all CSS variables in `src/styles/docs.css`, defined once per theme): steel-blue neutrals (`#0d1726` page, `#122033` surfaces, `#24364d` borders, text from `#f4f7fb` to `#8798ad`) with an **amber "vane" accent** (`#f5a524` dark, `#9a5a00` light) for links, the current page and focus. Callout colours are blue `#7fb3ff`, green `#4fd1a5`, amber and red `#ff7a85`.

**Fonts:** Inter (text) and JetBrains Mono (code). Both are under the SIL Open Font License and are self-hosted through `@fontsource-variable/*` 5.3.0, so readers' browsers make no request to a font CDN.

## Writing standard

[docs/WRITING-GUIDE.md](docs/WRITING-GUIDE.md) sets the rules: plain words, every new term explained, a "Coming from Laravel?" box, the smallest example with "What you'll see", every way to use a feature from small to advanced, OS and Docker differences, `## Common mistakes` with the exact error text and the fix, and "Coming in 0.2" for anything not built. `test/content.test.ts` enforces the checkable parts on every full page: a fenced code example, the Laravel box, a Common mistakes section, npm-only commands, and stubs that stay short.

## Layout

| Path | What it is |
|---|---|
| `versions.json` | The support table (ADR-0020 format): feeds the switcher, banners, the support table and the Versioning page's lines/branches/dist-tags table |
| `src/data/packages.json` | The package catalogue: every first-party package, its status (available, preview, in development, planned, shelved, retired), phase, since, replacement and docs link. Feeds the Package Catalogue page, its Markdown export and the What's-new checks |
| `docs.sources.ts` | Site title, repositories, and where each branch's content comes from |
| `versions/<branch>/` | Content of one version: `navigation.json` + pages (`.md`/`.mdx`) |
| `astro.config.ts`, `src/content.config.ts` | One Starlight site, parameterised by `DOCS_VERSION` |
| `src/components/` | Overrides: `Header` (wordmark, search, version switcher), `Sidebar` (drawer switcher on phones), `Banner`, `PageTitle` and `PageSidebar` (both use `PageTools`: Copy as Markdown), plus the data components for MDX: `SupportTable` and `ReleaseLines` (from `versions.json`) and `PackageCatalogue` (from `src/data/packages.json`, with filters) |
| `src/styles/docs.css` | The theme: palette, type scale, menu, callouts, code blocks |
| `docs/WRITING-GUIDE.md` | How every page is written |
| `src/pages/` | Endpoints: `[...slug].md`, `llms.txt`, `llms-full.txt` |
| `src/route-middleware.ts` | Per-version edit links and canonical URLs |
| `scripts/lib/` | Pure, tested logic: versions, navigation, site context, redirects, Markdown export, link checker, git sources |
| `scripts/{build,dev,preview,check-links}.ts` | The npm scripts |
| `test/` | `node:test` unit tests, plus `site.test.ts` on the built output and `packages-data.test.ts`, the packages-data completeness check (hub doc 19, gate R7) |

## Release checklist (every change, same commit)

Hub doc 19 (gate R7) makes the docs part of every change. **Any new feature, deprecation, retirement, repository archive or version bump updates all four of these in the same change**, never in a follow-up:

1. **The packages data**, `src/data/packages.json`: the entry's `status`, `phase`, `since` (the line the new status starts in), `replacement` (required when retired), `repo` and `docs`. A new package gets a new entry.
2. **What's new**, the `## What's new in Strutvane 0.N` section of `versions/<branch>/releases.mdx`: link every entry whose `since` is that line (`../packages/catalogue/#pkg-<id>`), under "New", `### Deprecated in 0.N` or `### Removed and retired in 0.N (with replacements)`.
3. **The versions data**, `versions.json`: release dates, support windows, status and dist-tag of every line. The support table, the banners and the Versioning page's tables are generated from it.
4. **The upgrade guide**, `versions/<branch>/upgrade.md`: before and after code and the likelihood of impact for anything that changes how an app is written. A deprecation also gets a line on the [Deprecations](versions/0.2.x/deprecations.md) page.

`npm test` enforces what a machine can check. `test/packages-data.test.ts` fails when an entry is malformed, a retired entry has no replacement, one of the 47 master-list packages is missing, a docs link points at no page, What's new doesn't link an entry marked `since` the current line, or (after `npm run build`) an entry has no rendered card or is missing from the Markdown export. No "Coming in" marker may stay on anything announced as shipped.

## Releasing a new docs version (the workflow this enables)

1. In `strutvane-docs`, create branch `0.3.x` from `main` when 0.3.0 ships (as the framework does).
2. On `main`, add the `0.3` line to `versions.json` and set `current: "0.3"`; mark `0.2` as `security`.
3. Add `'0.3.x': { git: { ref: 'origin/0.3.x', path: 'content' } }` to `docs.sources.ts`.
4. The site workflow builds every line with a source, plus `main`, and deploys `dist/` to GitHub Pages. 0.2.x pages now show the "security fixes only" banner, and `/docs/latest/…` points at 0.3.x.

## Findings

1. **Per-branch builds are cheap.** The whole two-version build (96 + 9 pages) took 46–71 s on this laptop, most of it Astro start-up per version, so a nightly matrix of two lines plus `main` stays around two minutes.
2. **Search scoping comes for free.** Building each version under its own base gives each its own Pagefind index; no filter UI is needed.
3. **Astro 7's glob loader needs a `file:` URL** for an absolute content folder on Windows (a plain `C:\…` path fails with "The URL must be of scheme file").
4. **Content outside `src/content/docs` needs `markdown.processedDirs`**, or Starlight's asides and heading anchors silently don't apply.
5. **Inline redirect scripts need `<` escaping.** `JSON.stringify` doesn't escape `</script>`; the test suite caught it, and the fix (`\u003c`) has a regression test.
6. **Cross-version links must go through `/docs/latest/`** (or be relative). The 0.1.x Release Notes link to the upgrade guide via `../../latest/upgrade/`, so a frozen version never hard-codes the current one.
7. **Frozen end-of-life builds** bake in the switcher as it was when they were built. If that matters, a later step can refresh the switcher from `/versions.json` at runtime.

8. **Astro's content cache can outlive a theme change.** Cached rendered Markdown links to the code-block stylesheet by its hash. After the redesign, pages that weren't re-rendered pointed at a stylesheet that no longer existed. The link checker caught it, and `npm run build` now starts each version from an empty content cache.
9. **The link checker must skip code samples.** An example like `<script src="/build/app.js">` inside a code block isn't a link. Text inside `<pre>` is now ignored, with a test.

## Not done (next steps)

- GitHub Actions workflow (matrix over `versions.json`, deploy to Pages). Not deployed, as asked.
- Error-code pages (`/docs/errors/<code>`) and a Laravel → Strutvane cheat sheet (requested in SHARED-DESIGN).
- A runtime refresh of the switcher on frozen end-of-life builds (Finding 7).
- Starlight warns that the optional `i18n` collection is empty. That's harmless.
