/**
 * Small, readable test data shared by the unit tests.
 */
import type { Navigation } from '../scripts/lib/navigation.ts'
import { createSiteContext, type SiteContext, type SiteManifest, type VersionSummary } from '../scripts/lib/site-context.ts'
import type { SupportTable } from '../scripts/lib/versions.ts'

/** A support table like the real one: 0.2 current (not released yet), 0.1 end of life. */
export const supportTable: SupportTable = {
  current: '0.2',
  lines: [
    { line: '0.2', branch: '0.2.x', distTag: 'latest', node: '>=24.3', released: null, bugFixesUntil: null, securityUntil: null, docs: '/docs/0.2.x/', status: 'active' },
    { line: '0.1', branch: '0.1.x', distTag: 'next', node: '>=24', released: null, bugFixesUntil: null, securityUntil: null, docs: '/docs/0.1.x/', status: 'eol' },
  ],
}

/** The same table as raw JSON (what `versions.json` contains). */
export function supportTableJson(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(supportTable)) as Record<string, unknown>
}

const v02: VersionSummary = {
  id: '0.2.x', line: '0.2', role: 'current', prerelease: true, branch: '0.2.x', home: 'introduction',
  pages: ['first-crud', 'installation', 'introduction', 'migrations', 'packages/auth', 'releases'],
  editBaseUrl: 'https://github.com/vishwajit-vm/strutvane-docs/edit/0.2.x/content/',
}
const v01: VersionSummary = {
  id: '0.1.x', line: '0.1', role: 'eol', prerelease: false, branch: '0.1.x', home: 'introduction',
  pages: ['installation', 'introduction', 'migrations', 'models-and-fields', 'releases'],
}

/** A manifest with the two versions above, published at /strutvane-docs/. */
export function manifest(overrides: Partial<SiteManifest> = {}): SiteManifest {
  return {
    siteTitle: 'Strutvane',
    site: 'https://vishwajit-vm.github.io',
    base: '/strutvane-docs/',
    supportTable,
    versions: [v02, v01],
    ...overrides,
  }
}

const navigation: Navigation = { home: 'introduction', groups: [{ label: 'Getting Started', items: [{ slug: 'introduction' }] }] }

/** The context of one version's build. */
export function contextFor(building: string, overrides: Partial<SiteManifest> = {}): SiteContext {
  return createSiteContext({ manifest: manifest(overrides), building, contentDirFromRoot: `versions/${building}`, navigation })
}

/** A version summary with a different role, for banner tests. */
export function withRole(summary: 'v02' | 'v01', role: VersionSummary['role'], prerelease = false): VersionSummary {
  return { ...(summary === 'v02' ? v02 : v01), role, prerelease }
}
