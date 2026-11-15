/**
 * The support table readers see on every version's Release Notes page.
 *
 * It is rendered from `versions.json` at build time, in EVERY version's build, so even old
 * docs show today's dates. (Laravel copies the table into each docs branch, and on
 * 2026-11-14 its `master` branch still showed the Laravel 12 table: a copied table goes stale.)
 *
 * The same rows feed the HTML table (`SupportTable.astro`) and the Markdown export.
 */
import type { SupportLine, SupportStatus, SupportTable } from './versions.ts'

/** One rendered row. Every cell is plain text. */
export interface SupportRow {
  readonly version: string
  readonly node: string
  readonly release: string
  readonly bugFixesUntil: string
  readonly securityUntil: string
  readonly status: SupportStatus
  /** Text label for the status, so it never relies on colour alone. */
  readonly statusLabel: string
  /** `true` for the line whose docs are being read. */
  readonly reading: boolean
}

/** Readable labels for each status (used as text, not just colour). */
export const STATUS_LABELS: Readonly<Record<SupportStatus, string>> = {
  active: 'Bug and security fixes',
  security: 'Security fixes only',
  eol: 'End of life',
}

function nodeText(range: string): string {
  return range.replace(/^>=\s*/, '') + '+'
}

function windowText(line: SupportLine, date: string | null, isCurrent: boolean, kind: 'bugs' | 'security'): string {
  if (date !== null) return date
  if (line.status === 'eol') return '—'
  if (!isCurrent) return kind === 'bugs' ? '—' : 'To be announced'
  return kind === 'bugs' ? 'Release of the next line' : 'Next line’s release + 6 months'
}

/**
 * Turns `versions.json` into display rows, newest line first.
 *
 * `null` dates are shown in words: "Not released yet", "Release of the next line",
 * "Next line's release + 6 months" (the pre-1.0 policy), or "—" for end-of-life lines.
 *
 * @example
 * ```ts
 * supportRows(table, '0.1')[1] // { version: '0.1', status: 'eol', statusLabel: 'End of life', reading: true, … }
 * ```
 */
export function supportRows(table: SupportTable, readingLine: string | undefined): SupportRow[] {
  return table.lines.map((line) => {
    const isCurrent = line.line === table.current
    return {
      version: line.line,
      node: nodeText(line.node),
      release: line.released ?? (line.status === 'eol' ? 'Pre-releases only' : 'Not released yet'),
      bugFixesUntil: windowText(line, line.bugFixesUntil, isCurrent, 'bugs'),
      securityUntil: windowText(line, line.securityUntil, isCurrent, 'security'),
      status: line.status,
      statusLabel: STATUS_LABELS[line.status],
      reading: line.line === readingLine,
    }
  })
}

/**
 * The support table as a GitHub-flavoured Markdown table (for "Copy as Markdown" and `llms.txt`).
 *
 * @example
 * ```ts
 * supportTableMarkdown(table, '0.2')
 * // '| Version | Node | Release | … |\n|---|…|\n| **0.2** (you are reading these docs) | 24.3+ | … |'
 * ```
 */
export function supportTableMarkdown(table: SupportTable, readingLine: string | undefined): string {
  const header = '| Version | Node | Release | Bug fixes until | Security fixes until | Status |\n|---|---|---|---|---|---|'
  const rows = supportRows(table, readingLine).map((row) => {
    const version = row.reading ? `**${row.version}** (you are reading these docs)` : row.version
    return `| ${version} | ${row.node} | ${row.release} | ${row.bugFixesUntil} | ${row.securityUntil} | ${row.statusLabel} |`
  })
  return [header, ...rows].join('\n')
}

/** One row of the "lines, branches and dist-tags" table on the Versioning page. */
export interface ReleaseLineRow {
  readonly version: string
  readonly branch: string
  readonly distTag: string
  readonly install: string
  readonly docs: string
  readonly node: string
  readonly statusLabel: string
}

/**
 * Where each line lives: its branch, the npm dist-tag that installs it, the command that creates
 * an app on it, and its docs path. Rendered from `versions.json`, newest line first, so the
 * Versioning page can never disagree with the release script (ADR-0020 §6).
 *
 * An end-of-life line has no install command: the starter refuses it unless `--allow-eol` is given.
 *
 * @example
 * ```ts
 * releaseLineRows(table)[0] // { version: '0.2', branch: '0.2.x', distTag: 'latest', install: 'npm create strutvane@latest my-app', … }
 * ```
 */
export function releaseLineRows(table: SupportTable): ReleaseLineRow[] {
  return table.lines.map((line) => ({
    version: line.line,
    branch: line.branch,
    distTag: line.distTag,
    install: line.status === 'eol' ? `npm create strutvane@${line.line} my-app -- --allow-eol` : line.line === table.current ? 'npm create strutvane@latest my-app' : `npm create strutvane@${line.line} my-app`,
    docs: line.docs,
    node: nodeText(line.node),
    statusLabel: STATUS_LABELS[line.status],
  }))
}

/**
 * The same table as Markdown, for "Copy as Markdown" and `llms.txt`.
 *
 * @example
 * ```ts
 * releaseLinesMarkdown(table) // '| Line | Branch | npm dist-tag | … |\n|---|…'
 * ```
 */
export function releaseLinesMarkdown(table: SupportTable): string {
  const header = '| Line | Branch | npm dist-tag | Create an app | Docs | Node | Status |\n|---|---|---|---|---|---|---|'
  const rows = releaseLineRows(table).map((row) => `| ${row.version} | \`${row.branch}\` | \`${row.distTag}\` | \`${row.install}\` | \`${row.docs}\` | ${row.node} | ${row.statusLabel} |`)
  return [header, ...rows].join('\n')
}
