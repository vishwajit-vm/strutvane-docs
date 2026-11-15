/**
 * Site settings and where each docs branch's content comes from.
 *
 * WHICH versions exist, and their support status, is decided by `versions.json` (the support
 * table from ADR-0020). This file only says where to READ each branch's Markdown.
 *
 * The real docs live in the `strutvane-docs` repository with one branch per framework line
 * (`main`, `0.2.x`, `0.1.x`), exactly like `laravel/docs`. In this prototype every branch is a
 * folder under `versions/`. In the real site, released lines are read straight from their
 * branches, without checking them out, and `main` is the site's own folder:
 *
 * ```ts
 * export const sources = {
 *   main: { folder: 'content' },
 *   '0.2.x': { git: { ref: 'origin/0.2.x', path: 'content' } },
 * }
 * ```
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseSupportTable, resolveDocsVersions, type DocsSources } from './scripts/lib/versions.ts'

/** The site name shown in the header and in `<title>`. */
export const siteTitle = 'Strutvane'

/** The framework's repository (header GitHub icon). */
export const repositoryUrl = 'https://github.com/vishwajit-vm/strutvane-framework'

/** The docs repository, where "Edit this page" links go. */
export const docsRepositoryUrl = 'https://github.com/vishwajit-vm/strutvane-docs'

/** Content of each branch's docs. No `main` here: its preview build is optional. */
export const sources: DocsSources = {
  '0.2.x': { folder: 'versions/0.2.x' },
  '0.1.x': { folder: 'versions/0.1.x' },
}

const versionsFile = fileURLToPath(new URL('./versions.json', import.meta.url))

/** The support table (`versions.json`), validated. */
export const supportTable = parseSupportTable(JSON.parse(readFileSync(versionsFile, 'utf8')), 'versions.json')

/** Every docs version this site builds, `main` first, then newest line first. */
export const versions = resolveDocsVersions(supportTable, sources, {
  // On each branch of strutvane-docs, the pages live in `content/`.
  editUrl: (branch) => `https://github.com/vishwajit-vm/strutvane/edit/main/spikes/15-versioned-docs-site/versions/${branch}/`,
})
