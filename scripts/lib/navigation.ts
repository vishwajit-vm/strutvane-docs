/**
 * The left-hand navigation of one docs version, read from its `navigation.json`.
 *
 * This is Strutvane's version of Laravel's `documentation.md`: one small file, stored next to
 * the pages on the same branch, that lists the groups in learning order (Prologue → Getting
 * Started → … → Packages). Because it lives on the branch, every version keeps its own menu.
 *
 * Format:
 *
 * ```json
 * {
 *   "home": "introduction",
 *   "groups": [
 *     { "label": "Prologue", "items": ["release-notes", "upgrade"] },
 *     { "label": "Getting Started", "items": ["introduction", { "slug": "first-crud", "label": "Your First CRUD" }] }
 *   ]
 * }
 * ```
 *
 * An item is a page slug (the file name without `.md`/`.mdx`); the menu shows the page's
 * title unless you give a shorter `label`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DocsBuildError } from './errors.ts'
import { toPosix } from './paths.ts'

/** One link in the menu. */
export interface NavigationItem {
  readonly slug: string
  /** Optional shorter text for the menu; defaults to the page title. */
  readonly label?: string | undefined
}

/** One titled group of links, like Laravel's "The Basics". */
export interface NavigationGroup {
  readonly label: string
  readonly items: readonly NavigationItem[]
}

/** A whole version's menu, plus the page `/docs/<version>/` opens on. */
export interface Navigation {
  readonly home: string
  readonly groups: readonly NavigationGroup[]
}

/** The file name we look for in every version's content folder. */
export const NAVIGATION_FILE = 'navigation.json'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseItem(raw: unknown, where: string): NavigationItem {
  if (typeof raw === 'string') return { slug: raw }
  if (isRecord(raw) && typeof raw['slug'] === 'string') {
    const label = raw['label']
    if (label !== undefined && (typeof label !== 'string' || label.trim() === '')) {
      throw new DocsBuildError(`${where}: the label for "${raw['slug']}" must be non-empty text.`, 'Remove "label" to use the page title.')
    }
    return { slug: raw['slug'], label }
  }
  throw new DocsBuildError(`${where}: every item must be a page slug like "installation" or { "slug": "…", "label": "…" }.`, `Found: ${JSON.stringify(raw)}`)
}

/**
 * Validates the shape of a parsed `navigation.json` and returns it typed.
 *
 * Why not trust the JSON: navigation files come from older branches written by many people;
 * a wrong shape should produce "group 3 has no label", not a crash deep inside Astro.
 *
 * @example
 * ```ts
 * parseNavigation({ home: 'introduction', groups: [{ label: 'Prologue', items: ['introduction'] }] }, 'versions/0.2.x/navigation.json')
 * ```
 */
export function parseNavigation(json: unknown, where: string): Navigation {
  if (!isRecord(json)) {
    throw new DocsBuildError(`${where} must contain a JSON object.`, 'Start from { "home": "introduction", "groups": [] }.')
  }
  const home = json['home']
  if (typeof home !== 'string' || home === '') {
    throw new DocsBuildError(`${where} has no "home" page.`, 'Add "home": "<slug>", the page /docs/<version>/ should open (usually "introduction").')
  }
  const groupsRaw = json['groups']
  if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) {
    throw new DocsBuildError(`${where} has no "groups".`, 'Add at least one group: { "label": "Getting Started", "items": ["introduction"] }.')
  }
  const groups = groupsRaw.map((group: unknown, index): NavigationGroup => {
    const at = `${where}, group ${index + 1}`
    if (!isRecord(group) || typeof group['label'] !== 'string' || group['label'].trim() === '') {
      throw new DocsBuildError(`${at} has no "label".`, 'Every group needs a title, for example "The Basics".')
    }
    const items = group['items']
    if (!Array.isArray(items) || items.length === 0) {
      throw new DocsBuildError(`${at} ("${group['label']}") has no items.`, 'List at least one page slug, or remove the group.')
    }
    return { label: group['label'], items: items.map((item: unknown) => parseItem(item, `${at} ("${group['label']}")`)) }
  })
  return { home, groups }
}

/**
 * Lists the page slugs in a content folder: every `.md`/`.mdx` file, without its extension.
 * Files and folders starting with `_` are ignored (Starlight's rule for partials).
 *
 * @example
 * ```ts
 * listContentPages('versions/0.2.x') // ['configuration', 'installation', 'introduction', …]
 * ```
 */
export function listContentPages(dir: string): string[] {
  const pages: string[] = []
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder)) {
      if (name.startsWith('_') || name.startsWith('.')) continue
      const full = join(folder, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.mdx?$/.test(name)) pages.push(toPosix(relative(dir, full)).replace(/\.mdx?$/, ''))
    }
  }
  walk(dir)
  return pages.sort()
}

/**
 * Cross-checks a menu against the pages that exist, and reports every mismatch at once.
 *
 * Why every mismatch at once: fixing one problem per build run is slow and frustrating.
 * Checked: slugs are URL-safe; no page is listed twice; every listed page exists; every
 * page is listed (an unlisted page could never be found by readers); `home` exists.
 *
 * @example
 * ```ts
 * checkNavigation(nav, listContentPages(dir), '0.2') // throws DocsBuildError listing the problems
 * ```
 */
export function checkNavigation(nav: Navigation, pages: readonly string[], versionId: string): void {
  const problems: string[] = []
  const listed = new Set<string>()
  const existing = new Set(pages)
  for (const group of nav.groups) {
    for (const item of group.items) {
      if (!SLUG_PATTERN.test(item.slug)) problems.push(`"${item.slug}" (in "${group.label}") is not a valid slug: use lowercase words joined by dashes.`)
      if (listed.has(item.slug)) problems.push(`"${item.slug}" is listed more than once.`)
      listed.add(item.slug)
      if (!existing.has(item.slug)) problems.push(`"${item.slug}" (in "${group.label}") has no page: create ${item.slug}.md.`)
    }
  }
  for (const page of pages) {
    if (!listed.has(page)) problems.push(`The page "${page}" is not in the navigation, so nobody could find it: add it to a group.`)
  }
  if (!existing.has(nav.home)) problems.push(`The home page "${nav.home}" does not exist.`)
  if (problems.length > 0) {
    throw new DocsBuildError(
      `The navigation of docs version "${versionId}" doesn't match its pages:\n    - ${problems.join('\n    - ')}`,
      `Edit ${NAVIGATION_FILE} in that version's content folder (or add the missing pages).`,
    )
  }
}

/**
 * Reads, validates and cross-checks the navigation of one content folder.
 *
 * @example
 * ```ts
 * const nav = loadNavigation(resolveContentDir(version, { root }), version.id)
 * ```
 */
export function loadNavigation(contentDir: string, versionId: string): Navigation {
  const file = join(contentDir, NAVIGATION_FILE)
  if (!existsSync(file)) {
    throw new DocsBuildError(`Docs version "${versionId}" has no ${NAVIGATION_FILE}.`, `Create ${file} (copy another version's file to start).`)
  }
  let json: unknown
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new DocsBuildError(`${file} is not valid JSON: ${(error as Error).message}`, 'Check for a missing comma or quote near the position shown.')
  }
  const nav = parseNavigation(json, file)
  checkNavigation(nav, listContentPages(contentDir), versionId)
  return nav
}

/** The sidebar shape Starlight's `sidebar` option accepts (a subset). */
export interface StarlightSidebarGroup {
  label: string
  /** Closed until opened; the group holding the current page opens by itself. */
  collapsed: boolean
  items: Array<{ slug: string; label?: string }>
}

/**
 * Converts a menu to Starlight's `sidebar` config.
 *
 * Why labels are optional: Starlight shows the page title for `{ slug }`, so titles are
 * written once, in the page itself.
 *
 * @example
 * ```ts
 * toStarlightSidebar(nav) // [{ label: 'Prologue', collapsed: true, items: [{ slug: 'release-notes' }, …] }, …]
 * ```
 */
export function toStarlightSidebar(nav: Navigation): StarlightSidebarGroup[] {
  return nav.groups.map((group) => ({
    label: group.label,
    // Like Laravel's menu: every group starts closed except the one you're reading.
    collapsed: true,
    items: group.items.map((item) => (item.label === undefined ? { slug: item.slug } : { slug: item.slug, label: item.label })),
  }))
}
