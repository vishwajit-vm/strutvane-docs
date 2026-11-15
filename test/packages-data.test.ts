/**
 * The packages-data completeness check (hub docs/19, gate R7).
 *
 * `src/data/packages.json` is the one source for the package catalogue. These tests fail when:
 * - an entry is malformed, or a retired entry names no replacement (the parser's rules);
 * - the 47 packages of the hub's master list aren't all there, once each;
 * - an entry's docs link points at a page that doesn't exist;
 * - "What's new" doesn't link an entry marked `since` the current line;
 * - the built catalogue page has no card for an entry, or its Markdown export leaves one out.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { versions } from '../docs.sources.ts'
import { resolveContentDir } from '../scripts/lib/content-source.ts'
import { listContentPages } from '../scripts/lib/navigation.ts'
import { displayName, PACKAGE_STATUS_LABELS, packageGroups, packagesMarkdown, parsePackagesData, type PackagesData } from '../scripts/lib/packages-data.ts'
import { currentVersion } from '../scripts/lib/versions.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const raw: unknown = JSON.parse(readFileSync(join(root, 'src/data/packages.json'), 'utf8'))
const data = parsePackagesData(raw, 'src/data/packages.json')
const current = currentVersion(versions)
const contentDir = resolveContentDir(current, { root })
const pages = new Set(listContentPages(contentDir))
const dist = join(root, 'dist', 'docs', current.id)

/** A copy of the real data with one entry changed, to prove the rules bite. */
function withEntry(id: string, change: Record<string, unknown>): unknown {
  const copy = JSON.parse(JSON.stringify(raw)) as { packages: Array<Record<string, unknown>> }
  const entry = copy.packages.find((candidate) => candidate['id'] === id)
  assert.ok(entry, id)
  Object.assign(entry, change)
  return copy
}

/** The source of a page of the current version (`.md` or `.mdx`). */
function pageSource(slug: string): string {
  const file = ['.mdx', '.md'].map((ext) => join(contentDir, `${slug}${ext}`)).find((path) => existsSync(path))
  assert.ok(file, `no source for ${slug}`)
  return readFileSync(file, 'utf8')
}

describe('packages data (src/data/packages.json)', () => {
  it('lists the 47 packages of the master list exactly once each, plus the two launch designs', () => {
    const numbers = data.packages.flatMap((entry) => (entry.checklist === null ? [] : [entry.checklist])).sort((a, b) => a - b)
    assert.deepEqual(numbers, Array.from({ length: 47 }, (_, index) => index + 1))
    for (const id of ['design-crisp', 'design-vivid']) {
      assert.equal(data.packages.find((entry) => entry.id === id)?.status, 'in-development', id)
    }
  })

  it('records the retirements and the shelved design, each retired one with its replacement', () => {
    const retired = new Map(data.packages.filter((entry) => entry.status === 'retired').map((entry) => [entry.id, entry.replacement]))
    for (const part of ['core', 'contracts', 'devkit']) assert.equal(retired.get(part), `@strutvane/framework/${part}`)
    assert.match(retired.get('cli') ?? '', /^@strutvane\/framework\/console/)
    assert.match(retired.get('logs') ?? '', /ADR-0022/)
    for (const feature of ['launcher', 'registry-compiler', 'field-spec-parser', 'upgrade-merge', 'better-auth-default']) {
      assert.ok((retired.get(feature) ?? '').length > 10, feature)
    }
    assert.equal(data.packages.find((entry) => entry.id === 'design-glass')?.status, 'shelved')
  })

  it('refuses a retired entry without a replacement, a shelved one without a reason, and duplicates', () => {
    assert.throws(() => parsePackagesData(withEntry('logs', { replacement: null }), 'test'), /retired but names no replacement/)
    assert.throws(() => parsePackagesData(withEntry('design-glass', { note: undefined }), 'test'), /shelved but has no "note"/)
    assert.throws(() => parsePackagesData(withEntry('auth', { id: 'framework' }), 'test'), /appears twice/)
    assert.throws(() => parsePackagesData(withEntry('auth', { status: 'released' }), 'test'), /"status" must be one of/)
    assert.throws(() => parsePackagesData(withEntry('auth', { checklist: 1 }), 'test'), /used twice/)
  })

  it('links every entry with a docs page to a page that exists in this version', () => {
    for (const entry of data.packages) {
      if (entry.docs !== null) assert.ok(pages.has(entry.docs), `${entry.id}: docs page "${entry.docs}" does not exist`)
    }
  })

  it('"What\'s new" links every entry marked since the current line', () => {
    const releases = pageSource('releases')
    const line = current.line
    const due = data.packages.filter((entry) => entry.since === line)
    assert.ok(due.length > 0, `no entry is marked since ${line}`)
    for (const entry of due) {
      assert.ok(releases.includes(`packages/catalogue/#pkg-${entry.id})`), `releases page does not link ${entry.id} (packages/catalogue/#pkg-${entry.id})`)
    }
  })

  it('has "Deprecated" and "Removed and retired" sections in What\'s new', () => {
    const releases = pageSource('releases')
    assert.match(releases, /^### Deprecated in /m)
    assert.match(releases, /^### Removed and retired in .*\(with replacements\)$/m)
  })

  it('the Markdown export lists every entry, with its status and replacement', () => {
    const markdown = packagesMarkdown(data, (slug) => `https://example.test/${slug}/`)
    for (const entry of data.packages) {
      assert.ok(markdown.includes(`\`${displayName(entry)}\``), entry.id)
      if (entry.replacement !== null) assert.ok(markdown.includes(entry.replacement), `${entry.id} replacement`)
    }
    assert.ok(markdown.includes(PACKAGE_STATUS_LABELS.retired))
  })

  it('groups every entry exactly once, retired and shelved last', () => {
    const groups = packageGroups(data as PackagesData)
    const ids = groups.flatMap((group) => group.packages.map((entry) => entry.id)).sort()
    assert.deepEqual(ids, data.packages.map((entry) => entry.id).sort())
    assert.equal(groups.at(-1)?.category.id, 'history')
  })
})

const builtPage = join(dist, 'packages', 'catalogue', 'index.html')
describe('built package catalogue', { skip: existsSync(builtPage) ? false : 'dist/ not found: run `npm run build` first' }, () => {
  it('renders one card per entry, with its anchor and its status in words', () => {
    const html = readFileSync(builtPage, 'utf8')
    for (const entry of data.packages) {
      const card = new RegExp(`<li[^>]*id="pkg-${entry.id}"[^>]*data-status="${entry.status}"`).exec(html)
      assert.ok(card, `no rendered card for ${entry.id}`)
    }
    const cards = html.match(/data-package="/g) ?? []
    assert.equal(cards.length, data.packages.length, 'one card per entry, no extras')
  })

  it('exports every entry in the page\'s Markdown copy', () => {
    const markdown = readFileSync(join(dist, 'packages', 'catalogue.md'), 'utf8')
    for (const entry of data.packages) assert.ok(markdown.includes(`\`${displayName(entry)}\``), entry.id)
  })

  it('the Versioning page shows every line from versions.json with its branch and dist-tag', () => {
    const html = readFileSync(join(dist, 'versioning', 'index.html'), 'utf8')
    for (const version of versions) {
      if (version.role === 'next') continue
      assert.match(html, new RegExp(`data-release-line="${version.line.replace('.', '\\.')}"`), version.line)
    }
  })
})
