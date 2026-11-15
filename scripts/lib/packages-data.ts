/**
 * The package catalogue's data (`src/data/packages.json`), validated, grouped and exported.
 *
 * Why one data file: the catalogue page, its Markdown export, "What's new" and the tests all
 * read the same entries, so a package can't be "retired" on one page and "planned" on another
 * (hub docs/19, gate R7: the packages data is updated in the same change as the feature).
 *
 * The same functions feed `PackageCatalogue.astro` (HTML) and the Markdown export, like the
 * support table does.
 */
import { DocsBuildError } from './errors.ts'

/** Where a package stands. Written in words on every card, never shown by colour alone. */
export type PackageStatus = 'available' | 'preview' | 'in-development' | 'planned' | 'shelved' | 'retired'

/** A real npm package, a design package, or a framework feature that never had its own name. */
export type PackageKind = 'package' | 'design' | 'feature'

/** One catalogue entry. */
export interface PackageEntry {
  /** Card anchor: `#pkg-<id>`. */
  readonly id: string
  readonly kind: PackageKind
  readonly npm: string | null
  readonly repo: string | null
  readonly category: string
  readonly summary: string
  readonly status: PackageStatus
  readonly phase: number | null
  /** The docs line in which this status started (`"0.2"`), or `null`. */
  readonly since: string | null
  /** Required for `retired` entries. */
  readonly replacement: string | null
  /** A page slug of this docs version, or `null`. */
  readonly docs: string | null
  /** Number in the hub's 47-package master list, or `null`. */
  readonly checklist: number | null
  readonly note?: string | undefined
  /** Menu label and page heading in words: "Auth", "Crisp (default)", "Registry compiler". */
  readonly title: string
  /** The Laravel equivalent, in words, or `null`. */
  readonly laravel: string | null
  /** What using it will look like (a proposal for anything not built), or `null`. */
  readonly example: PackageExample | null
}

/** A short code sample shown on a package's page. */
export interface PackageExample {
  readonly lang: 'ts' | 'bash' | 'css' | 'json'
  readonly code: string
}

/** A group of the catalogue page. */
export interface PackageCategory {
  readonly id: string
  readonly label: string
}

/** The whole data file. */
export interface PackagesData {
  readonly categories: readonly PackageCategory[]
  readonly packages: readonly PackageEntry[]
}

/** Every status, in the order the filter lists them. */
export const PACKAGE_STATUSES: readonly PackageStatus[] = ['available', 'preview', 'in-development', 'planned', 'shelved', 'retired']

/** Readable label for each status. */
export const PACKAGE_STATUS_LABELS: Readonly<Record<PackageStatus, string>> = {
  available: 'Available',
  preview: 'Preview',
  'in-development': 'In development',
  planned: 'Planned',
  shelved: 'Shelved',
  retired: 'Retired',
}

/** The id of the last group, which holds every retired and shelved entry whatever its category. */
export const HISTORY_GROUP: PackageCategory = { id: 'history', label: 'Retired and shelved' }

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/
const KINDS: readonly PackageKind[] = ['package', 'design', 'feature']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableString(entry: Record<string, unknown>, key: string, where: string, problems: string[]): string | null {
  const value = entry[key]
  if (value === null) return null
  if (typeof value === 'string' && value.trim() !== '') return value
  problems.push(`${where}: "${key}" must be text or null.`)
  return null
}

/**
 * Validates the parsed `packages.json` and returns it typed. Every problem is reported at once.
 *
 * Rules beyond the shape: ids are unique, categories exist, a `retired` entry names its
 * replacement, a `shelved` entry says why in `note`, `phase` is 1–8 for active entries, and the
 * master-list numbers are unique.
 *
 * @example
 * ```ts
 * parsePackagesData(JSON.parse(readFileSync('src/data/packages.json', 'utf8')), 'src/data/packages.json')
 * ```
 */
export function parsePackagesData(json: unknown, where: string): PackagesData {
  const problems: string[] = []
  if (!isRecord(json) || !Array.isArray(json['categories']) || !Array.isArray(json['packages'])) {
    throw new DocsBuildError(`${where}: expected { "categories": [...], "packages": [...] }.`, 'See the $comment at the top of the file.')
  }
  const categories: PackageCategory[] = json['categories'].flatMap((raw, index): PackageCategory[] => {
    if (isRecord(raw) && typeof raw['id'] === 'string' && ID.test(raw['id']) && typeof raw['label'] === 'string') {
      return [{ id: raw['id'], label: raw['label'] }]
    }
    problems.push(`${where}: categories[${index}] needs an id (lowercase-with-dashes) and a label.`)
    return []
  })
  const categoryIds = new Set(categories.map((category) => category.id))
  const seen = new Set<string>()
  const checklistSeen = new Set<number>()
  const packages: PackageEntry[] = json['packages'].flatMap((raw, index): PackageEntry[] => {
    const at = `${where}: packages[${index}]`
    if (!isRecord(raw)) {
      problems.push(`${at} must be an object.`)
      return []
    }
    const id = raw['id']
    if (typeof id !== 'string' || !ID.test(id)) {
      problems.push(`${at}: "id" must be lowercase-with-dashes.`)
      return []
    }
    const label = `${where}: "${id}"`
    if (seen.has(id)) problems.push(`${label} appears twice.`)
    seen.add(id)
    const kind = raw['kind']
    if (typeof kind !== 'string' || !KINDS.includes(kind as PackageKind)) problems.push(`${label}: "kind" must be one of ${KINDS.join(', ')}.`)
    const status = raw['status']
    if (typeof status !== 'string' || !PACKAGE_STATUSES.includes(status as PackageStatus)) {
      problems.push(`${label}: "status" must be one of ${PACKAGE_STATUSES.join(', ')}.`)
    }
    const category = raw['category']
    if (typeof category !== 'string' || !categoryIds.has(category)) problems.push(`${label}: "category" must be one of the listed categories.`)
    const summary = raw['summary']
    if (typeof summary !== 'string' || summary.trim() === '') problems.push(`${label}: "summary" is required.`)
    const phase = raw['phase']
    if (phase !== null && !(typeof phase === 'number' && Number.isInteger(phase) && phase >= 1 && phase <= 8)) {
      problems.push(`${label}: "phase" must be a whole number from 1 to 8, or null.`)
    }
    const checklist = raw['checklist']
    if (checklist !== null && !(typeof checklist === 'number' && Number.isInteger(checklist) && checklist >= 1)) {
      problems.push(`${label}: "checklist" must be a positive whole number, or null.`)
    } else if (typeof checklist === 'number') {
      if (checklistSeen.has(checklist)) problems.push(`${label}: master-list number ${checklist} is used twice.`)
      checklistSeen.add(checklist)
    }
    const npm = nullableString(raw, 'npm', label, problems)
    const repo = nullableString(raw, 'repo', label, problems)
    if (repo !== null && !repo.startsWith('https://github.com/')) problems.push(`${label}: "repo" must be a https://github.com/ URL.`)
    const since = nullableString(raw, 'since', label, problems)
    if (since !== null && !/^\d+\.\d+$/.test(since)) problems.push(`${label}: "since" must be a line like "0.2".`)
    const replacement = nullableString(raw, 'replacement', label, problems)
    const docs = nullableString(raw, 'docs', label, problems)
    if (docs !== null && !SLUG.test(docs)) problems.push(`${label}: "docs" must be a page slug like "packages/auth" (no slashes at the ends, no #).`)
    const title = raw['title']
    if (typeof title !== 'string' || title.trim() === '') problems.push(`${label}: "title" is required (the menu label).`)
    const laravel = nullableString(raw, 'laravel', label, problems)
    const exampleRaw = raw['example']
    let example: PackageExample | null = null
    if (exampleRaw !== null) {
      if (isRecord(exampleRaw) && typeof exampleRaw['code'] === 'string' && exampleRaw['code'].trim() !== '' && ['ts', 'bash', 'css', 'json'].includes(String(exampleRaw['lang']))) {
        example = { lang: exampleRaw['lang'] as PackageExample['lang'], code: exampleRaw['code'] }
      } else {
        problems.push(`${label}: "example" must be null or { "lang": "ts" | "bash" | "css" | "json", "code": "…" }.`)
      }
    }
    const note = raw['note']
    if (note !== undefined && (typeof note !== 'string' || note.trim() === '')) problems.push(`${label}: "note" must be text when present.`)
    if (status === 'retired' && replacement === null) problems.push(`${label} is retired but names no replacement. Say what people use instead.`)
    if (status === 'shelved' && typeof note !== 'string') problems.push(`${label} is shelved but has no "note" saying why.`)
    if ((status === 'retired' || status === 'shelved') && phase !== null) problems.push(`${label}: a ${String(status)} entry has no phase (use null).`)
    if (status !== 'retired' && status !== 'shelved' && phase === null) problems.push(`${label}: an active entry needs a phase.`)
    return [{
      id,
      kind: kind as PackageKind,
      npm,
      repo,
      category: String(category),
      summary: String(summary),
      status: status as PackageStatus,
      phase: typeof phase === 'number' ? phase : null,
      since,
      replacement,
      docs,
      checklist: typeof checklist === 'number' ? checklist : null,
      note: typeof note === 'string' ? note : undefined,
      title: String(title),
      laravel,
      example,
    }]
  })
  if (problems.length > 0) {
    throw new DocsBuildError(`${where} has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`, 'Fix the entries above; the $comment at the top explains every field.')
  }
  return { categories, packages }
}

/** One group of cards, in display order. */
export interface PackageGroup {
  readonly category: PackageCategory
  readonly packages: readonly PackageEntry[]
}

/**
 * The cards grouped for display: each category in file order (active entries by phase, then
 * name), then one last "Retired and shelved" group. Empty groups are left out.
 *
 * @example
 * ```ts
 * packageGroups(data).map((group) => group.category.label) // ['Core', 'Designs', …, 'Retired and shelved']
 * ```
 */
export function packageGroups(data: PackagesData): PackageGroup[] {
  const isHistory = (entry: PackageEntry): boolean => entry.status === 'retired' || entry.status === 'shelved'
  const byPhase = (a: PackageEntry, b: PackageEntry): number => (a.phase ?? 99) - (b.phase ?? 99) || a.id.localeCompare(b.id)
  const groups = data.categories.map((category) => ({
    category,
    packages: data.packages.filter((entry) => entry.category === category.id && !isHistory(entry)).sort(byPhase),
  }))
  groups.push({ category: HISTORY_GROUP, packages: data.packages.filter(isHistory) })
  return groups.filter((group) => group.packages.length > 0)
}

/** The name a card shows: the npm name, or the id for entries without one. */
export function displayName(entry: PackageEntry): string {
  return entry.npm ?? entry.id
}

/** "Phase 2", or the empty string. */
/** The page slug of a package: `packages/<id>`. */
export function packageSlug(entry: PackageEntry): string {
  return `packages/${entry.id}`
}

/** The tone of a status banner: drives its colour; the text always says the status in words. */
export type BannerTone = 'available' | 'progress' | 'proposed' | 'shelved' | 'retired'

/**
 * The plain-words banner at the top of a package's page. The same text is rendered in the page,
 * exported to Markdown and checked by the tests, so a page can never claim a status its data
 * doesn't have.
 *
 * @example
 * ```ts
 * statusBanner(redis) // { tone: 'proposed', text: 'Proposed: planned for 0.3' }
 * statusBanner(core)  // { tone: 'retired', text: 'Retired: use @strutvane/framework/core instead' }
 * ```
 */
export function statusBanner(entry: PackageEntry): { readonly tone: BannerTone; readonly text: string } {
  switch (entry.status) {
    case 'available':
      return { tone: 'available', text: 'Available' }
    case 'preview':
      return { tone: 'progress', text: 'Preview: published for trying out; it may still change' }
    case 'in-development':
      return { tone: 'progress', text: 'In development for 0.2' }
    case 'shelved':
      return { tone: 'shelved', text: 'Shelved' }
    case 'retired':
      return { tone: 'retired', text: `Retired: use ${entry.replacement ?? 'its replacement'} instead` }
    case 'planned':
      if (entry.phase === 2) return { tone: 'proposed', text: 'Proposed: planned for 0.3' }
      if (entry.phase === 3) return { tone: 'proposed', text: 'Proposed: planned for 1.0' }
      return { tone: 'proposed', text: `Proposed: planned for a later release (phase ${entry.phase ?? '?'})` }
  }
}

/** One menu group generated from the data. */
export interface PackageMenuGroup {
  readonly label: string
  readonly items: ReadonlyArray<{ readonly slug: string; readonly label: string }>
}

/**
 * The Packages part of the menu, grouped by status in the order readers look for things:
 * Overview, Core, Designs, Coming in 0.3, Planned for 1.0, one "Later" group per phase, Retired.
 * Empty groups are left out, and every entry lands in exactly one group.
 *
 * @example
 * ```ts
 * packageMenuGroups(data).map((group) => group.label) // ['Overview', 'Core', 'Designs', 'Coming in 0.3 (proposed)', …]
 * ```
 */
export function packageMenuGroups(data: PackagesData): PackageMenuGroup[] {
  const item = (entry: PackageEntry): { slug: string; label: string } => ({ slug: packageSlug(entry), label: entry.title })
  const byPhaseThenTitle = (a: PackageEntry, b: PackageEntry): number => (a.phase ?? 0) - (b.phase ?? 0) || a.title.localeCompare(b.title)
  const active = (entry: PackageEntry): boolean => entry.status !== 'retired' && entry.status !== 'shelved'
  const designs = data.packages.filter((entry) => entry.kind === 'design')
  const core = data.packages.filter((entry) => entry.kind !== 'design' && active(entry) && entry.phase === 1)
  const planned = (phase: number): PackageEntry[] => data.packages.filter((entry) => entry.kind !== 'design' && active(entry) && entry.phase === phase).sort(byPhaseThenTitle)
  const later = [4, 5, 6, 7, 8].map((phase) => ({ label: `Later (proposed): phase ${phase}`, items: planned(phase).map(item) }))
  const groups: PackageMenuGroup[] = [
    { label: 'Overview', items: [{ slug: 'packages/catalogue', label: 'Package Catalogue' }] },
    { label: 'Core (in development for 0.2)', items: core.map(item) },
    { label: 'Designs', items: designs.sort((a, b) => Number(a.status === 'shelved') - Number(b.status === 'shelved')).map(item) },
    { label: 'Coming in 0.3 (proposed)', items: planned(2).map(item) },
    { label: 'Planned for 1.0 (proposed)', items: planned(3).map(item) },
    ...later,
    { label: 'Retired', items: data.packages.filter((entry) => entry.status === 'retired').map(item) },
  ]
  return groups.filter((group) => group.items.length > 0)
}

/**
 * One package page as Markdown (for "Copy as Markdown" and `llms.txt`).
 *
 * @example
 * ```ts
 * packagePageMarkdown(auth, (slug) => `https://example.com/docs/0.2.x/${slug}/`)
 * ```
 */
export function packagePageMarkdown(entry: PackageEntry, docsUrl: (slug: string) => string): string {
  const lines = [`> **${statusBanner(entry).text}**`, '', entry.summary, '']
  if (entry.replacement !== null) lines.push(`**Use instead:** ${entry.replacement}`, '')
  if (entry.note !== undefined) lines.push(entry.note, '')
  if (entry.example !== null) {
    lines.push(entry.status === 'retired' ? '**Before and after:**' : entry.status === 'in-development' ? '**What using it looks like** (names may still change before 0.2):' : '**What using it will look like** (a proposal; names may change):', '', `\`\`\`${entry.example.lang}`, entry.example.code, '\`\`\`', '')
  }
  const facts = [
    entry.npm === null ? '' : `- **npm:** \`${entry.npm}\``,
    entry.laravel === null ? '' : `- **Laravel equivalent:** ${entry.laravel}`,
    entry.phase === null ? '' : `- **Phase:** ${entry.phase}`,
    entry.repo === null ? '' : `- **Repository:** ${entry.repo}`,
    entry.docs === null ? '' : `- **Docs:** ${docsUrl(entry.docs)}`,
  ].filter((line) => line !== '')
  return [...lines, ...facts].join('\n').trim()
}

export function phaseText(entry: PackageEntry): string {
  return entry.phase === null ? '' : `Phase ${entry.phase}`
}

/**
 * The catalogue as Markdown (for "Copy as Markdown" and `llms.txt`): one table per group.
 * `docsUrl(slug)` turns a docs slug into an absolute URL.
 *
 * @example
 * ```ts
 * packagesMarkdown(data, (slug) => `https://example.com/docs/0.2.x/${slug}/`)
 * ```
 */
export function packagesMarkdown(data: PackagesData, docsUrl: (slug: string) => string): string {
  return packageGroups(data)
    .map((group) => {
      const rows = group.packages.map((entry) => {
        const name = entry.docs === null ? `\`${displayName(entry)}\`` : `[\`${displayName(entry)}\`](${docsUrl(entry.docs)})`
        const extra = [entry.replacement === null ? '' : `Replaced by: ${entry.replacement}.`, entry.note ?? ''].filter((text) => text !== '').join(' ')
        const status = [PACKAGE_STATUS_LABELS[entry.status], phaseText(entry)].filter((text) => text !== '').join(', ')
        return `| ${name} | ${entry.summary}${extra === '' ? '' : ` ${extra}`} | ${status} |`
      })
      return [`### ${group.category.label}`, '', '| Package | What it does | Status |', '|---|---|---|', ...rows].join('\n')
    })
    .join('\n\n')
}
