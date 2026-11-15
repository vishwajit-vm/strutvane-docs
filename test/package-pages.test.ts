/**
 * Every package has a page, a menu entry and a banner that matches its data.
 *
 * Fails when: a data entry has no page or its generated shell is out of step (run
 * `npm run packages:pages`), a package page exists without a data entry, an entry is missing
 * from the Packages menu or listed twice, the menu groups come in the wrong order, or (after a
 * build) a page's banner doesn't say the status its data has, or a retired page doesn't name
 * its replacement.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { versions } from '../docs.sources.ts'
import { resolveContentDir } from '../scripts/lib/content-source.ts'
import { listContentPages, loadNavigation, PACKAGES_DATA_FILE, toStarlightSidebar } from '../scripts/lib/navigation.ts'
import { packagePageSource, writePackagePages } from '../scripts/lib/package-pages.ts'
import { packageMenuGroups, packageSlug, parsePackagesData, statusBanner } from '../scripts/lib/packages-data.ts'
import { currentVersion } from '../scripts/lib/versions.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = parsePackagesData(JSON.parse(readFileSync(PACKAGES_DATA_FILE, 'utf8')), 'src/data/packages.json')
const current = currentVersion(versions)
const contentDir = resolveContentDir(current, { root })
const nav = loadNavigation(contentDir, current.id)

describe('package pages', () => {
  it('every data entry has its generated page, in step with the data', () => {
    const result = writePackagePages(data, contentDir, { check: true })
    assert.deepEqual(result.written, [], 'out of step: run npm run packages:pages')
    assert.deepEqual(result.replaced, [], 'hand-written stubs left: run npm run packages:pages')
    for (const entry of data.packages) {
      const source = readFileSync(join(contentDir, `${packageSlug(entry)}.mdx`), 'utf8').replace(/\r\n/g, '\n')
      assert.equal(source, packagePageSource(entry), entry.id)
    }
  })

  it('no package page exists without a data entry (the catalogue page aside)', () => {
    const ids = new Set(data.packages.map(packageSlug))
    const orphans = listContentPages(contentDir).filter((slug) => slug.startsWith('packages/') && slug !== 'packages/catalogue' && !ids.has(slug))
    assert.deepEqual(orphans, [])
  })

  it('every entry is listed once, flat, directly under Packages (no status sub-groups)', () => {
    // The project lead asked for a plain list (2026-11-15); status lives on each page's banner.
    assert.equal(nav.groups.filter((group) => group.parent === 'Packages').length, 0)
    const packages = nav.groups.find((group) => group.label === 'Packages' && group.parent === undefined)
    assert.ok(packages, 'a top-level Packages group')
    const listed = packages.items.map((item) => item.slug)
    assert.deepEqual(listed, packageMenuGroups(data).flatMap((group) => group.items.map((item) => item.slug)))
    assert.equal(listed[0], 'packages/catalogue')
    assert.equal(new Set(listed).size, listed.length)
    assert.deepEqual([...listed].sort(), ['packages/catalogue', ...data.packages.map(packageSlug)].sort())
    // Retired packages come last, so the list reads "what you can use" first.
    const firstRetired = listed.findIndex((slug) => data.packages.some((entry) => entry.status === 'retired' && packageSlug(entry) === slug))
    assert.ok(listed.slice(firstRetired).every((slug) => data.packages.some((entry) => entry.status === 'retired' && packageSlug(entry) === slug)))
  })

  it('the sidebar nests the generated groups under one Packages group, keeping the approved group order', () => {
    const labels = toStarlightSidebar(nav).map((group) => group.label)
    assert.deepEqual(labels, ['Prologue', 'Getting Started', 'Architecture Concepts', 'The Basics', 'Digging Deeper', 'Security', 'Database', 'ORM', 'Auto CRUD & UI', 'Testing', 'Packages', 'CLI Reference'])
  })

  it('banners say the status in plain words', () => {
    const byId = new Map(data.packages.map((entry) => [entry.id, entry]))
    const banner = (id: string): string => {
      const entry = byId.get(id)
      assert.ok(entry, id)
      return statusBanner(entry).text
    }
    assert.equal(banner('auth'), 'In development for 0.2')
    assert.equal(banner('redis'), 'Proposed: planned for 0.3')
    assert.equal(banner('charts'), 'Proposed: planned for 1.0')
    assert.equal(banner('billing'), 'Proposed: planned for a later release (phase 6)')
    assert.equal(banner('design-glass'), 'Shelved')
    assert.equal(banner('core'), 'Retired: use @strutvane/framework/core instead')
  })
})

const dist = join(root, 'dist', 'docs', current.id)
describe('built package pages', { skip: existsSync(join(dist, 'packages', 'auth', 'index.html')) ? false : 'dist/ not found: run `npm run build` first' }, () => {
  it('every page shows the banner its data asks for, and retired pages name their replacement', () => {
    for (const entry of data.packages) {
      const html = readFileSync(join(dist, packageSlug(entry), 'index.html'), 'utf8')
      const match = new RegExp(`data-package-banner="([a-z-]+)" data-package-id="${entry.id}"[^>]*>\\s*<strong[^>]*>([^<]*)</strong>`).exec(html)
      assert.ok(match, `${entry.id}: no banner`)
      assert.equal(match[1], entry.status, `${entry.id}: banner status`)
      assert.equal(match[2]?.replace(/&#39;/g, "'").replace(/&amp;/g, '&'), statusBanner(entry).text, `${entry.id}: banner text`)
      // Compare as text: apostrophes and ampersands arrive HTML-escaped.
      const text = html.replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      if (entry.status === 'retired') assert.ok(text.includes(entry.replacement ?? '\u0000'), `${entry.id}: replacement not shown`)
      const markdown = readFileSync(join(dist, `${packageSlug(entry)}.md`), 'utf8')
      assert.ok(markdown.includes(statusBanner(entry).text), `${entry.id}: Markdown export has no banner`)
    }
  })
})
