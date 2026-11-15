/**
 * Turns "build version X" into concrete settings for Astro.
 *
 * `astro.config.ts` and `src/content.config.ts` both call {@link resolveBuildSettings}, so the
 * site works the same whether it is started by our scripts (`npm run dev`, `npm run build`)
 * or by plain `npx astro dev`.
 *
 * Environment variables:
 * - `DOCS_VERSION`: the branch to build (`0.2.x`, `0.1.x`, `main`). Default: the current line.
 * - `DOCS_MANIFEST`: a JSON file with the {@link SiteManifest} computed on `main`. The full
 *   build passes it to every version build, which is exactly what a separate branch checkout
 *   needs, since a branch can't see the other branches. Without it, the manifest is computed here.
 * - `DOCS_SITE`, `DOCS_BASE`: where the site is published (see {@link resolveSiteLocation}).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveContentDir } from './content-source.ts'
import { DocsBuildError } from './errors.ts'
import { loadNavigation, toStarlightSidebar, type StarlightSidebarGroup } from './navigation.ts'
import { normalizeBase } from './paths.ts'
import { createSiteContext, type SiteContext, type SiteManifest } from './site-context.ts'
import { currentVersion, findVersion, type DocsVersion, type SupportTable } from './versions.ts'

/** Where the merged site is published. */
export interface SiteLocation {
  /** Origin, for example `https://vishwajit-vm.github.io`. */
  readonly site: string
  /** Base path of the whole site, for example `/strutvane-docs/`. */
  readonly base: string
}

type Env = Readonly<Record<string, string | undefined>>

/**
 * Reads the publish location from the environment.
 *
 * Why env variables: the same build moves to a custom domain later with
 * `DOCS_SITE=https://strutvane.dev DOCS_BASE=/ npm run build`, and nothing else changes.
 *
 * @example
 * ```ts
 * resolveSiteLocation({}) // { site: 'https://vishwajit-vm.github.io', base: '/strutvane-docs/' }
 * ```
 */
export function resolveSiteLocation(env: Env): SiteLocation {
  return {
    site: env['DOCS_SITE'] ?? 'https://vishwajit-vm.github.io',
    base: normalizeBase(env['DOCS_BASE'] ?? '/strutvane-docs'),
  }
}

/** Input shared by {@link createManifest} and {@link resolveBuildSettings}. */
export interface SiteInput {
  readonly root: string
  readonly siteTitle: string
  readonly supportTable: SupportTable
  readonly versions: readonly DocsVersion[]
  readonly env: Env
}

/**
 * Computes the manifest: every version's pages and home, plus the support table.
 *
 * Every version's navigation is loaded and checked, not only the one being built, because
 * the version switcher on each page needs to know which pages exist in every version.
 *
 * @example
 * ```ts
 * const manifest = createManifest({ root, siteTitle, supportTable, versions, env: process.env })
 * manifest.versions.map((v) => v.id) // ['0.2.x', '0.1.x']
 * ```
 */
export function createManifest(input: SiteInput): SiteManifest {
  const location = resolveSiteLocation(input.env)
  return {
    siteTitle: input.siteTitle,
    site: location.site,
    base: location.base,
    supportTable: input.supportTable,
    versions: input.versions.map((version) => {
      const nav = loadNavigation(resolveContentDir(version, { root: input.root }), version.id)
      return {
        id: version.id,
        line: version.line,
        role: version.role,
        prerelease: version.prerelease,
        branch: version.branch,
        home: nav.home,
        pages: nav.groups.flatMap((group) => group.items.map((item) => item.slug)).sort(),
        editBaseUrl: version.editBaseUrl,
      }
    }),
  }
}

function readManifest(file: string): SiteManifest {
  if (!existsSync(file)) {
    throw new DocsBuildError(`DOCS_MANIFEST points at ${file}, which doesn't exist.`, 'Run `npm run build`, which writes it, or unset DOCS_MANIFEST.')
  }
  return JSON.parse(readFileSync(file, 'utf8')) as SiteManifest
}

/** Everything Astro needs to build one version. */
export interface BuildSettings {
  readonly version: DocsVersion
  /** Absolute folder with this version's Markdown and `navigation.json`. */
  readonly contentDir: string
  readonly sidebar: StarlightSidebarGroup[]
  readonly context: SiteContext
  readonly location: SiteLocation
  /** Where Astro writes this version's build, before the pieces are merged into `dist/`. */
  readonly outDir: string
  /** A separate Astro cache per version, so one version's content cache never leaks into another. */
  readonly cacheDir: string
}

/**
 * Resolves the settings for the version named by `env.DOCS_VERSION` (default: current).
 *
 * @example
 * ```ts
 * const settings = resolveBuildSettings({ root, siteTitle, supportTable, versions, env: process.env })
 * settings.context.building // '0.2.x'
 * ```
 */
export function resolveBuildSettings(input: SiteInput): BuildSettings {
  const requested = input.env['DOCS_VERSION']
  const version = requested === undefined || requested === '' ? currentVersion(input.versions) : findVersion(input.versions, requested)
  const manifestFile = input.env['DOCS_MANIFEST']
  const manifest = manifestFile === undefined || manifestFile === '' ? createManifest(input) : readManifest(manifestFile)

  const contentDir = resolveContentDir(version, { root: input.root })
  const navigation = loadNavigation(contentDir, version.id)
  const context = createSiteContext({ manifest, building: version.id, contentDirFromRoot: relative(input.root, contentDir), navigation })
  return {
    version,
    contentDir,
    sidebar: toStarlightSidebar(navigation),
    context,
    location: { site: manifest.site, base: normalizeBase(manifest.base) },
    outDir: join(input.root, '.build', version.id),
    cacheDir: join(input.root, 'node_modules', '.astro-docs', version.id),
  }
}
