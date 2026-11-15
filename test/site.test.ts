/**
 * Checks on the BUILT site (`dist/`): version switcher, banners, redirects, search index,
 * Markdown exports and the support table, across every version.
 *
 * Run `npm run build` first (`npm run verify` does build → links → tests in one go).
 * These read the real HTML, so they prove what readers actually get.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { versions } from '../docs.sources.ts'
import { resolveContentDir } from '../scripts/lib/content-source.ts'
import { listContentPages } from '../scripts/lib/navigation.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const skip = existsSync(dist) ? false : 'dist/ not found: run `npm run build` first (or `npm run verify`)'
const base = '/strutvane-docs/'

function html(path: string): string {
  return readFileSync(join(dist, path, 'index.html'), 'utf8')
}

/** The version switcher's options on a page: [label, url, selected]. */
function switcher(page: string): Array<[string, string, boolean]> {
  const select = /<select id="docs-version-select"[^>]*>([\s\S]*?)<\/select>/.exec(html(page))?.[1] ?? ''
  return [...select.matchAll(/<option value="([^"]+)"([^>]*)>\s*([^<]+?)\s*<\/option>/g)].map((m) => [m[3] ?? '', m[1] ?? '', /\sselected/.test(m[2] ?? '')])
}

describe('built site', { skip }, () => {
  it('builds every page of every version', () => {
    for (const version of versions) {
      for (const slug of listContentPages(resolveContentDir(version, { root }))) {
        assert.ok(existsSync(join(dist, 'docs', version.id, slug, 'index.html')), `${version.id}/${slug} was not built`)
        assert.ok(existsSync(join(dist, 'docs', version.id, `${slug}.md`)), `${version.id}/${slug}.md (Markdown export) is missing`)
      }
    }
  })

  it('the switcher keeps you on the same page, or falls back to the version’s home', () => {
    assert.deepEqual(switcher('docs/0.2.x/migrations'), [
      ['0.2 (current)', `${base}docs/0.2.x/migrations/`, true],
      ['0.1 (end of life)', `${base}docs/0.1.x/migrations/`, false],
    ])
    assert.deepEqual(switcher('docs/0.2.x/first-crud')[1], ['0.1 (end of life)', `${base}docs/0.1.x/introduction/`, false])
    assert.deepEqual(switcher('docs/0.1.x/models-and-fields')[0], ['0.2 (current)', `${base}docs/0.2.x/introduction/`, false])
    assert.match(html('docs/0.2.x/migrations'), /data-docs-version-switcher/)
  })

  it('end-of-life pages carry the old-docs banner, linking to the current page', () => {
    const page = html('docs/0.1.x/migrations')
    assert.match(page, /data-docs-version-banner="eol"/)
    assert.match(page, /which has reached end of life/)
    assert.ok(page.includes(`href="${base}docs/0.2.x/migrations/"`))
    assert.match(page, new RegExp(`<link rel="canonical" href="https://vishwajit-vm\\.github\\.io${base}docs/0\\.2\\.x/migrations/"`))
    assert.ok(!page.includes('/edit/'), 'frozen versions must not offer "Edit this page"')
  })

  it('current pages have no old-docs banner, and edit links point at their branch', () => {
    const page = html('docs/0.2.x/installation')
    assert.ok(!page.includes('data-docs-version-banner="eol"'))
    assert.match(page, /data-docs-version-banner="prerelease"/)
    assert.ok(page.includes('https://github.com/vishwajit-vm/strutvane/edit/main/spikes/15-versioned-docs-site/versions/0.2.x/installation.mdx'))
  })

  it('/docs/latest/…, /docs/<page>/ and / redirect to the current version', () => {
    assert.ok(html('docs/latest/installation').includes(`location.replace("${base}docs/0.2.x/installation/"`))
    assert.ok(html('docs/installation').includes(`location.replace("${base}docs/0.2.x/installation/"`))
    assert.ok(html('').includes(`location.replace("${base}docs/0.2.x/introduction/"`))
    assert.ok(html('docs/0.1.x').includes(`location.replace("${base}docs/0.1.x/introduction/"`))
    assert.match(readFileSync(join(dist, '404.html'), 'utf8'), /docs\/latest\//)
  })

  it('each version has its own search index covering all its pages', () => {
    for (const version of versions) {
      const pages = listContentPages(resolveContentDir(version, { root })).length
      const entry = JSON.parse(readFileSync(join(dist, 'docs', version.id, 'pagefind', 'pagefind-entry.json'), 'utf8')) as { languages: Record<string, { page_count: number }> }
      const indexed = Object.values(entry.languages).reduce((sum, language) => sum + language.page_count, 0)
      assert.equal(indexed, pages, `${version.id}: Pagefind indexed ${indexed} pages, expected ${pages}`)
      assert.ok(readdirSync(join(dist, 'docs', version.id, 'pagefind')).some((file) => file.endsWith('.pf_meta')))
    }
  })

  it('every version renders today’s support table from versions.json', () => {
    for (const id of ['0.2.x', '0.1.x']) {
      const page = html(`docs/${id}/releases`)
      assert.match(page, /data-support-line="0\.2"/)
      assert.match(page, /data-support-line="0\.1"/)
      assert.match(page, /End of life/)
    }
    assert.match(readFileSync(join(dist, 'docs', '0.1.x', 'releases.md'), 'utf8'), /\| \*\*0\.1\*\* \(you are reading these docs\) \|/)
    assert.deepEqual(JSON.parse(readFileSync(join(dist, 'versions.json'), 'utf8')).current, '0.2')
  })

  it('publishes llms.txt and llms-full.txt per version, and a Copy as Markdown button', () => {
    const llms = readFileSync(join(dist, 'docs', '0.2.x', 'llms.txt'), 'utf8')
    assert.match(llms, /^# Strutvane 0\.2 documentation/)
    assert.ok(llms.includes('## Prologue') && llms.includes('docs/0.2.x/installation.md'))
    const full = readFileSync(join(dist, 'docs', '0.2.x', 'llms-full.txt'), 'utf8')
    assert.ok(full.includes('# Installation') && !full.includes("import { Tabs"))
    assert.match(html('docs/0.2.x/installation'), new RegExp(`data-copy-markdown="${base}docs/0\\.2\\.x/installation\\.md"`))
    assert.ok(existsSync(join(dist, '.nojekyll')))
  })
})
