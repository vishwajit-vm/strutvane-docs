/**
 * The package pages (`versions/<branch>/packages/<id>.mdx`), written from the package data.
 *
 * Why generated shells: every package needs a page, a menu entry and a status banner that
 * match its data. Writing 60 pages by hand would drift; instead each page is a 7-line shell
 * whose body is `<PackagePage id="…" />`, and `npm run packages:pages` keeps the shells in step
 * with `src/data/packages.json`. A new package needs only a data entry and that command.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PackageEntry, PackagesData } from './packages-data.ts'

/**
 * The exact source of one package page.
 *
 * @example
 * ```ts
 * packagePageSource(auth) // '---\ntitle: "@strutvane/auth"\n…<PackagePage id="auth" />\n'
 * ```
 */
export function packagePageSource(entry: PackageEntry): string {
  // JSON strings are valid YAML double-quoted strings, so any summary is safe in the front matter.
  return [
    '---',
    `title: ${JSON.stringify(entry.npm ?? entry.title)}`,
    `description: ${JSON.stringify(entry.summary)}`,
    '---',
    '',
    "import PackagePage from '@docs-components/PackagePage.astro'",
    '',
    `<PackagePage id="${entry.id}" />`,
    '',
  ].join('\n')
}

/** What {@link writePackagePages} did. */
export interface PackagePagesResult {
  readonly written: readonly string[]
  readonly unchanged: readonly string[]
  /** Hand-written `.md` stubs replaced by a generated `.mdx` page. */
  readonly replaced: readonly string[]
}

/**
 * Writes (or checks) every package page of one content folder. Only `packages/<id>.mdx` files of
 * data entries are written, and only a `packages/<id>.md` stub of a data entry is removed; the
 * catalogue page and anything else are never touched.
 *
 * @example
 * ```ts
 * writePackagePages(data, 'versions/0.2.x', { check: true }).written // [] when everything is in step
 * ```
 */
export function writePackagePages(data: PackagesData, contentDir: string, options: { readonly check: boolean }): PackagePagesResult {
  const written: string[] = []
  const unchanged: string[] = []
  const replaced: string[] = []
  for (const entry of data.packages) {
    const target = join(contentDir, 'packages', `${entry.id}.mdx`)
    const stub = join(contentDir, 'packages', `${entry.id}.md`)
    const source = packagePageSource(entry)
    if (existsSync(stub)) {
      replaced.push(`packages/${entry.id}.md`)
      if (!options.check) unlinkSync(stub)
    }
    if (existsSync(target) && readFileSync(target, 'utf8').replace(/\r\n/g, '\n') === source) {
      unchanged.push(`packages/${entry.id}.mdx`)
      continue
    }
    written.push(`packages/${entry.id}.mdx`)
    if (!options.check) writeFileSync(target, source)
  }
  return { written, unchanged, replaced }
}
