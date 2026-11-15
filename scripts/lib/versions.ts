/**
 * Docs versions, driven by the support table `versions.json` (ADR-0020).
 *
 * Laravel keeps one docs branch per framework line (`12.x`, `13.x`, `master`) and serves
 * each at `/docs/<branch>/`. Strutvane does the same: the docs for a line live next to the
 * code on that line's branch (`0.2.x`), and `main` holds the next, unreleased line.
 *
 * Two inputs decide what the site builds:
 * - `versions.json` (on `main`): the ONE support table. Which line is current, which lines
 *   are maintained, which are end of life, and their dates. It drives the switcher, the
 *   banners and the support table shown on every version's Release Notes page.
 * - `docs.sources.ts`: where each branch's Markdown can be read from (a folder or a git ref).
 *
 * This module validates the first and joins it with the second.
 */
import { DocsBuildError } from './errors.ts'
import { LATEST } from './paths.ts'

/** Support status of a line, as written in `versions.json`. */
export type SupportStatus = 'active' | 'security' | 'eol'

/** One row of `versions.json` (format from the versioning design, §7.3). */
export interface SupportLine {
  /** The line, for example `0.2` (later `1`). Shown to readers. */
  readonly line: string
  /** Its branch, for example `0.2.x`. Also the docs URL segment: `/docs/0.2.x/`. */
  readonly branch: string
  /** The npm dist-tag that installs it: `latest`, `latest-0.2`, … */
  readonly distTag: string
  /** Supported Node range, for example `>=24.3`. */
  readonly node: string
  /** ISO dates; `null` means "not yet" (released) or "until the next line ships" (fix windows). */
  readonly released: string | null
  readonly bugFixesUntil: string | null
  readonly securityUntil: string | null
  /** Where its docs live, for example `/docs/0.2.x/`. Must match the branch. */
  readonly docs: string
  readonly status: SupportStatus
}

/** The whole `versions.json` file. */
export interface SupportTable {
  /** The current line, for example `0.2`. `npm create strutvane@latest` installs it. */
  readonly current: string
  /** Newest first. */
  readonly lines: readonly SupportLine[]
}

/**
 * Where one branch's docs content can be read from.
 *
 * - `{ folder }`: a folder in this project (this prototype; and `main` in the real site).
 * - `{ git: { ref, path } }`: a folder on a git ref, read without checking it out
 *   (released lines in the real site: `{ ref: 'origin/0.2.x', path: 'content' }` in strutvane-docs).
 */
export type ContentSource =
  | { readonly folder: string }
  | { readonly git: { readonly ref: string; readonly path: string } }

/**
 * How a docs version is presented on the site.
 *
 * - `current`: the line `npm create strutvane@latest` installs.
 * - `maintained`: an older line that still gets security fixes.
 * - `eol`: end of life; frozen, with an "unsupported" banner.
 * - `next`: `main`, the unreleased next line (Laravel's "Master").
 */
export type VersionRole = 'current' | 'maintained' | 'eol' | 'next'

/**
 * One version of the docs site, ready to build.
 *
 * @example
 * ```ts
 * const v: DocsVersion = { id: '0.2.x', line: '0.2', role: 'current', branch: '0.2.x', prerelease: true,
 *   source: { folder: 'versions/0.2.x' }, editBaseUrl: 'https://github.com/vishwajit-vm/strutvane-docs/edit/0.2.x/content/' }
 * ```
 */
export interface DocsVersion {
  /** The URL segment, which is the branch name: `0.2.x`, `0.1.x`, `main`. */
  readonly id: string
  /** What readers see: `0.2`, `0.1`, `main`. */
  readonly line: string
  readonly role: VersionRole
  readonly branch: string
  readonly source: ContentSource
  /** `true` for the current line before its first release (its `released` date is `null`). */
  readonly prerelease: boolean
  /** "Edit this page" prefix; `undefined` for end-of-life lines, which are frozen. */
  readonly editBaseUrl?: string | undefined
}

/** The branch → content map in `docs.sources.ts`. `main` is optional. */
export type DocsSources = Readonly<Record<string, ContentSource>>

const BRANCH_PATTERN = /^(?:main|\d+(?:\.\d+)?\.x)$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const STATUSES: readonly SupportStatus[] = ['active', 'security', 'eol']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function dateOrNull(row: Record<string, unknown>, key: string, where: string): string | null {
  const value = row[key]
  if (value === null) return null
  if (typeof value === 'string' && DATE_PATTERN.test(value)) return value
  throw new DocsBuildError(`${where}: "${key}" must be a date like "2027-01-12" or null.`, 'null means "not yet" or "until the next line ships".')
}

function text(row: Record<string, unknown>, key: string, where: string): string {
  const value = row[key]
  if (typeof value === 'string' && value.trim() !== '') return value
  throw new DocsBuildError(`${where}: "${key}" is missing or empty.`, 'Every line needs line, branch, distTag, node, docs and status.')
}

/**
 * Validates a parsed `versions.json` and returns it typed.
 *
 * Why so strict: this file decides which branches get built and which banner readers see.
 * Checked: `current` names a listed line whose status isn't `eol`; lines and branches are
 * unique; branches look like `0.2.x` or `1.x` (never `latest`, which is a redirect); `docs`
 * equals `/docs/<branch>/`; dates are ISO or `null`; status is active, security or eol.
 *
 * @example
 * ```ts
 * const table = parseSupportTable(JSON.parse(readFileSync('versions.json', 'utf8')), 'versions.json')
 * table.current // '0.2'
 * ```
 */
export function parseSupportTable(json: unknown, where: string): SupportTable {
  if (!isRecord(json) || typeof json['current'] !== 'string' || !Array.isArray(json['lines']) || json['lines'].length === 0) {
    throw new DocsBuildError(`${where} must look like { "current": "0.2", "lines": [ … ] }.`, 'See the versioning design (docs/research/2026-11-14-versioning-and-support-design.md §7.3).')
  }
  const current = json['current']
  const seenLines = new Set<string>()
  const seenBranches = new Set<string>()
  const lines = json['lines'].map((raw: unknown, index): SupportLine => {
    const at = `${where}, line ${index + 1}`
    if (!isRecord(raw)) throw new DocsBuildError(`${at} is not an object.`, 'Each entry describes one line, like { "line": "0.2", … }.')
    const line = text(raw, 'line', at)
    const branch = text(raw, 'branch', at)
    if (branch === LATEST || !BRANCH_PATTERN.test(branch) || branch === 'main') {
      throw new DocsBuildError(`${at}: "${branch}" is not a release branch name.`, 'Use "<line>.x", for example "0.2.x" or "1.x" ("main" is the next line and is not listed here).')
    }
    const status = raw['status']
    if (typeof status !== 'string' || !STATUSES.includes(status as SupportStatus)) {
      throw new DocsBuildError(`${at}: "status" must be "active", "security" or "eol".`, `Found: ${JSON.stringify(status)}`)
    }
    const docs = text(raw, 'docs', at)
    if (docs !== `/docs/${branch}/`) {
      throw new DocsBuildError(`${at}: "docs" is "${docs}", but line ${line}'s docs are served at "/docs/${branch}/".`, 'Docs URLs use the branch name, as at laravel.com/docs/12.x/.')
    }
    if (seenLines.has(line) || seenBranches.has(branch)) throw new DocsBuildError(`${at}: line "${line}" or branch "${branch}" is listed twice.`, 'Remove the duplicate.')
    seenLines.add(line)
    seenBranches.add(branch)
    return {
      line,
      branch,
      distTag: text(raw, 'distTag', at),
      node: text(raw, 'node', at),
      released: dateOrNull(raw, 'released', at),
      bugFixesUntil: dateOrNull(raw, 'bugFixesUntil', at),
      securityUntil: dateOrNull(raw, 'securityUntil', at),
      docs,
      status: status as SupportStatus,
    }
  })
  const currentLine = lines.find((line) => line.line === current)
  if (currentLine === undefined) {
    throw new DocsBuildError(`${where}: "current" is "${current}", but no line "${current}" is listed.`, 'Add the line, or fix "current".')
  }
  if (currentLine.status === 'eol') {
    throw new DocsBuildError(`${where}: the current line ${current} is marked "eol".`, 'The current line is always supported. Change "current" first.')
  }
  return { current, lines }
}

/** Options for {@link resolveDocsVersions}. */
export interface ResolveOptions {
  /** Prefix for edit links; the branch and the content path are filled in. */
  readonly editUrl: (branch: string) => string
}

/**
 * Joins the support table with the content sources into the list of versions to build.
 *
 * Which branches are built (ADR-0020 §10): every line in `versions.json` that has a
 * content source, plus `main` when `docs.sources.ts` lists it. A maintained (active or
 * security) line WITHOUT a source is an error, because its readers would get a 404; an
 * end-of-life line without a source is skipped (its frozen snapshot is served from the archive).
 *
 * Order: `main` first, then lines newest first, as in Laravel's switcher.
 *
 * @example
 * ```ts
 * resolveDocsVersions(table, { '0.2.x': { folder: 'versions/0.2.x' } }, { editUrl })
 * // [{ id: '0.2.x', line: '0.2', role: 'current', … }]
 * ```
 */
export function resolveDocsVersions(table: SupportTable, sources: DocsSources, options: ResolveOptions): DocsVersion[] {
  const known = new Set(['main', ...table.lines.map((line) => line.branch)])
  for (const branch of Object.keys(sources)) {
    if (!known.has(branch)) {
      throw new DocsBuildError(`docs.sources.ts has content for "${branch}", but versions.json has no such line.`, 'Add the line to versions.json, or remove the source.')
    }
  }
  const versions: DocsVersion[] = []
  const main = sources['main']
  if (main !== undefined) {
    versions.push({ id: 'main', line: 'main', role: 'next', branch: 'main', source: main, prerelease: true, editBaseUrl: options.editUrl('main') })
  }
  for (const line of table.lines) {
    const source = sources[line.branch]
    if (source === undefined) {
      if (line.status === 'eol') continue
      throw new DocsBuildError(`Line ${line.line} is still supported, but docs.sources.ts has no content for "${line.branch}".`, `Add "${line.branch}": { git: { ref: 'origin/${line.branch}', path: 'content' } }.`)
    }
    const role: VersionRole = line.line === table.current ? 'current' : line.status === 'eol' ? 'eol' : 'maintained'
    versions.push({
      id: line.branch,
      line: line.line,
      role,
      branch: line.branch,
      source,
      prerelease: role === 'current' && line.released === null,
      editBaseUrl: role === 'eol' ? undefined : options.editUrl(line.branch),
    })
  }
  return versions
}

/**
 * Returns the current version.
 *
 * @example
 * ```ts
 * currentVersion(versions).id // '0.2.x'
 * ```
 */
export function currentVersion(list: readonly DocsVersion[]): DocsVersion {
  const found = list.find((version) => version.role === 'current')
  if (found === undefined) throw new DocsBuildError('No docs version is current.', 'Check "current" in versions.json and that its branch has a content source.')
  return found
}

/**
 * Finds a version by id (branch name), with a friendly error listing the valid ids.
 *
 * Why: `npm run dev -- --version 0.3.x` with a typo should say which versions exist.
 *
 * @example
 * ```ts
 * findVersion(versions, '0.1.x').role // 'eol'
 * ```
 */
export function findVersion(list: readonly DocsVersion[], id: string): DocsVersion {
  const found = list.find((version) => version.id === id)
  if (found === undefined) {
    throw new DocsBuildError(`There is no docs version "${id}".`, `Pick one of: ${list.map((version) => version.id).join(', ')}.`)
  }
  return found
}
