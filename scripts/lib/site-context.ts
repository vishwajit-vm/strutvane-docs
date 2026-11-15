/**
 * The "site context": everything one version's build needs to know about all the others.
 *
 * Each version (each branch) is built separately, but its pages still link to the other
 * versions: the version switcher, the version banner, the canonical link and the support
 * table. So before each build we compute this small, plain-JSON object and hand it to the
 * components through a virtual module (`virtual:strutvane-docs/context`).
 *
 * Every function here is pure (no file system, no Astro), so the rules are unit-tested.
 */
import type { Navigation } from './navigation.ts'
import { absoluteUrl, markdownPath, normalizeBase, pagePath, toPosix, versionPath } from './paths.ts'
import type { SupportTable, VersionRole } from './versions.ts'

/** What the site knows about one version (one branch). */
export interface VersionSummary {
  /** URL segment = branch: `0.2.x`, `0.1.x`, `main`. */
  readonly id: string
  /** What readers see: `0.2`, `0.1`, `main`. */
  readonly line: string
  readonly role: VersionRole
  readonly prerelease: boolean
  readonly branch: string
  /** The slug `/docs/<id>/` opens on. */
  readonly home: string
  /** Every page slug of this version, sorted. */
  readonly pages: readonly string[]
  readonly editBaseUrl?: string | undefined
}

/**
 * The part of the context that is the same for every version's build.
 *
 * In the real site (strutvane-docs), the workflow computes this once on `main` and passes it to each
 * branch's build (`DOCS_MANIFEST=<file>`), because a branch can't see the other branches.
 */
export interface SiteManifest {
  readonly siteTitle: string
  /** Origin, for example `https://vishwajit-vm.github.io`. */
  readonly site: string
  /** Base path of the whole site, normalised, for example `/strutvane-docs/`. */
  readonly base: string
  /** The support table, `versions.json`. */
  readonly supportTable: SupportTable
  /** All versions, in switcher order: `main` first, then newest line first. */
  readonly versions: readonly VersionSummary[]
}

/** Everything a single version's build needs. Plain JSON, so it can go through Vite. */
export interface SiteContext extends SiteManifest {
  /** Id of the current version (`0.2.x`). */
  readonly current: string
  /** Id of the version this build produces. */
  readonly building: string
  /** The building version's content folder, relative to the project root, with `/`. */
  readonly contentDirFromRoot: string
  /** The building version's menu (used for `llms.txt` ordering). */
  readonly navigation: Navigation
}

/** Input for {@link createSiteContext}. */
export interface SiteContextInput {
  readonly manifest: SiteManifest
  readonly building: string
  readonly contentDirFromRoot: string
  readonly navigation: Navigation
}

/**
 * Builds the context object for one version's build.
 *
 * @example
 * ```ts
 * createSiteContext({ manifest, building: '0.1.x', contentDirFromRoot: 'versions/0.1.x', navigation })
 * ```
 */
export function createSiteContext(input: SiteContextInput): SiteContext {
  const current = input.manifest.versions.find((version) => version.role === 'current')
  if (current === undefined) throw new Error('createSiteContext: no current version (resolveDocsVersions() should have caught this).')
  if (!input.manifest.versions.some((version) => version.id === input.building)) {
    throw new Error(`createSiteContext: version "${input.building}" is not in the manifest.`)
  }
  return {
    ...input.manifest,
    base: normalizeBase(input.manifest.base),
    current: current.id,
    building: input.building,
    contentDirFromRoot: toPosix(input.contentDirFromRoot).replace(/\/+$/, ''),
    navigation: input.navigation,
  }
}

function versionOf(context: SiteManifest, id: string): VersionSummary {
  const found = context.versions.find((version) => version.id === id)
  if (found === undefined) throw new Error(`Unknown docs version "${id}".`)
  return found
}

/** The version this build produces. */
export function buildingVersion(context: SiteContext): VersionSummary {
  return versionOf(context, context.building)
}

/**
 * Where a reader on page `slug` should land in version `targetId`.
 *
 * Why: like Laravel's switcher, changing version keeps you on the same page when that page
 * exists in the other version, and otherwise takes you to that version's home page.
 *
 * @example
 * ```ts
 * versionTarget(context, '0.1.x', 'migrations') // { url: '/strutvane-docs/docs/0.1.x/migrations/', samePage: true }
 * versionTarget(context, '0.1.x', 'first-crud') // { url: '/strutvane-docs/docs/0.1.x/introduction/', samePage: false }
 * ```
 */
export function versionTarget(context: SiteManifest, targetId: string, slug: string): { url: string; samePage: boolean } {
  const target = versionOf(context, targetId)
  const samePage = target.pages.includes(slug)
  return { url: pagePath(context.base, target.id, samePage ? slug : target.home), samePage }
}

/** Short, plain-words role suffixes for the switcher. */
const ROLE_SUFFIX: Readonly<Record<VersionRole, string>> = {
  current: ' (current)',
  maintained: ' (security fixes only)',
  eol: ' (end of life)',
  next: ' (unreleased)',
}

/** One entry of the version switcher. */
export interface SwitcherOption {
  readonly id: string
  /** For example `0.2 (current)` or `0.1 (end of life)`. */
  readonly label: string
  readonly url: string
  readonly samePage: boolean
  readonly selected: boolean
}

/**
 * The options of the version switcher shown on page `slug` of the building version.
 *
 * @example
 * ```ts
 * switcherOptions(context, 'installation').map((o) => o.label) // ['0.2 (current)', '0.1 (end of life)']
 * ```
 */
export function switcherOptions(context: SiteContext, slug: string): SwitcherOption[] {
  return context.versions.map((version) => {
    const { url, samePage } = versionTarget(context, version.id, slug)
    return { id: version.id, label: `${version.line}${ROLE_SUFFIX[version.role]}`, url, samePage, selected: version.id === context.building }
  })
}

/** A banner shown above every page of a version that is not the plain, released current line. */
export interface VersionNotice {
  /**
   * - `eol`: old, unsupported docs (Laravel's "You're browsing the documentation for an old version").
   * - `security`: an older line that only gets security fixes.
   * - `next`: `main`, not released yet.
   * - `prerelease`: the current line before its first release (0.2 today).
   */
  readonly kind: 'eol' | 'security' | 'next' | 'prerelease'
  /** The version being read, for example `0.1`. */
  readonly readingLine: string
  /** The current line, for example `0.2`. */
  readonly currentLine: string
  /** Where "read the current docs" goes: the same page in the current version, or its home. */
  readonly currentUrl: string
  readonly samePage: boolean
  /** Link to this version's Release Notes, where the support table is, when that page exists. */
  readonly releasesUrl?: string | undefined
}

/**
 * Decides which version banner, if any, page `slug` shows.
 *
 * @example
 * ```ts
 * versionNotice(contextFor('0.1.x'), 'migrations')
 * // { kind: 'eol', readingLine: '0.1', currentLine: '0.2', currentUrl: '/strutvane-docs/docs/0.2.x/migrations/', samePage: true, … }
 * ```
 */
export function versionNotice(context: SiteContext, slug: string): VersionNotice | undefined {
  const reading = buildingVersion(context)
  const current = versionOf(context, context.current)
  const { url, samePage } = versionTarget(context, current.id, slug)
  const releasesUrl = reading.pages.includes('releases') ? pagePath(context.base, reading.id, 'releases') : undefined
  const base = { readingLine: reading.line, currentLine: current.line, currentUrl: url, samePage, releasesUrl }
  switch (reading.role) {
    case 'eol':
      return { kind: 'eol', ...base }
    case 'maintained':
      return { kind: 'security', ...base }
    case 'next':
      return { kind: 'next', ...base }
    case 'current':
      return reading.prerelease ? { kind: 'prerelease', ...base } : undefined
  }
}

/**
 * The "Edit this page" URL for a content file, or `undefined` for frozen versions.
 *
 * Why not Starlight's `editLink.baseUrl`: Starlight appends the path from the project root
 * (`versions/0.2.x/installation.md`), but on GitHub the file lives somewhere else on the
 * version's own branch (`content/installation.md` on branch `0.2.x` of strutvane-docs).
 *
 * @example
 * ```ts
 * editUrl(context, 'versions/0.2.x/installation.md') // 'https://github.com/vishwajit-vm/strutvane-docs/edit/0.2.x/content/installation.md'
 * ```
 */
export function editUrl(context: SiteContext, filePathFromRoot: string): string | undefined {
  const { editBaseUrl } = buildingVersion(context)
  if (editBaseUrl === undefined) return undefined
  const filePath = toPosix(filePathFromRoot)
  const prefix = `${context.contentDirFromRoot}/`
  const inside = filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath
  return `${editBaseUrl.replace(/\/?$/, '/')}${inside}`
}

/**
 * The canonical URL of page `slug`: the current version's copy when it exists.
 *
 * Why: search engines should send people to current docs, not to several copies of the
 * same page. Pages that only exist in another version stay canonical to themselves.
 *
 * @example
 * ```ts
 * canonicalUrl(contextFor('0.1.x'), 'migrations') // 'https://vishwajit-vm.github.io/strutvane-docs/docs/0.2.x/migrations/'
 * ```
 */
export function canonicalUrl(context: SiteContext, slug: string): string {
  const current = versionOf(context, context.current)
  const id = current.pages.includes(slug) ? current.id : context.building
  return absoluteUrl(context.site, pagePath(context.base, id, slug))
}

/**
 * Links for the "Copy as Markdown" toolbar of page `slug` in the building version.
 *
 * @example
 * ```ts
 * exportLinks(context, 'installation').markdown // '/strutvane-docs/docs/0.2.x/installation.md'
 * ```
 */
export function exportLinks(context: SiteContext, slug: string): { markdown: string; llms: string; llmsFull: string } {
  const root = versionPath(context.base, context.building)
  return { markdown: markdownPath(context.base, context.building, slug), llms: `${root}llms.txt`, llmsFull: `${root}llms-full.txt` }
}

/** `true` when `slug` is a real content page of the building version (not the 404 page). */
export function isContentPage(context: SiteContext, slug: string): boolean {
  return buildingVersion(context).pages.includes(slug)
}
