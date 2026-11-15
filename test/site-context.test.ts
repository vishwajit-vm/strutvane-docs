import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canonicalUrl, editUrl, exportLinks, switcherOptions, versionNotice } from '../scripts/lib/site-context.ts'
import { contextFor, manifest, withRole } from './fixtures.ts'

describe('version switcher', () => {
  it('keeps you on the same page when it exists in the other version', () => {
    const options = switcherOptions(contextFor('0.2.x'), 'migrations')
    assert.deepEqual(options.map((o) => [o.label, o.url, o.samePage, o.selected]), [
      ['0.2 (current)', '/strutvane-docs/docs/0.2.x/migrations/', true, true],
      ['0.1 (end of life)', '/strutvane-docs/docs/0.1.x/migrations/', true, false],
    ])
  })

  it('falls back to the other version’s home page when the page does not exist there', () => {
    const [, old] = switcherOptions(contextFor('0.2.x'), 'first-crud')
    assert.deepEqual([old?.url, old?.samePage], ['/strutvane-docs/docs/0.1.x/introduction/', false])
    const [current] = switcherOptions(contextFor('0.1.x'), 'models-and-fields')
    assert.deepEqual([current?.url, current?.samePage], ['/strutvane-docs/docs/0.2.x/introduction/', false])
  })

  it('works with nested slugs and a root base path (custom domain)', () => {
    const [current] = switcherOptions(contextFor('0.2.x', { base: '/' }), 'packages/auth')
    assert.equal(current?.url, '/docs/0.2.x/packages/auth/')
  })
})

describe('version banner', () => {
  it('end of life: links to the same page in the current version', () => {
    assert.deepEqual(versionNotice(contextFor('0.1.x'), 'migrations'), {
      kind: 'eol', readingLine: '0.1', currentLine: '0.2', currentUrl: '/strutvane-docs/docs/0.2.x/migrations/', samePage: true,
      releasesUrl: '/strutvane-docs/docs/0.1.x/releases/',
    })
    assert.equal(versionNotice(contextFor('0.1.x'), 'models-and-fields')?.currentUrl, '/strutvane-docs/docs/0.2.x/introduction/')
  })

  it('current but not released yet: a pre-release note', () => {
    assert.equal(versionNotice(contextFor('0.2.x'), 'installation')?.kind, 'prerelease')
  })

  it('released current line: no banner; security-only and main get their own', () => {
    assert.equal(versionNotice(contextFor('0.2.x', { versions: [withRole('v02', 'current'), withRole('v01', 'eol')] }), 'installation'), undefined)
    assert.equal(versionNotice(contextFor('0.1.x', { versions: [withRole('v02', 'current'), withRole('v01', 'maintained')] }), 'installation')?.kind, 'security')
    const main = { ...withRole('v01', 'next', true), id: 'main', line: 'main' }
    assert.equal(versionNotice(contextFor('main', { versions: [main, withRole('v02', 'current')] }), 'installation')?.kind, 'next')
  })
})

describe('links', () => {
  it('edit links point at the file on the version’s own branch; frozen versions have none', () => {
    assert.equal(editUrl(contextFor('0.2.x'), 'versions/0.2.x/packages/auth.md'), 'https://github.com/vishwajit-vm/strutvane-docs/edit/0.2.x/content/packages/auth.md')
    assert.equal(editUrl(contextFor('0.2.x'), 'versions\\0.2.x\\installation.mdx'), 'https://github.com/vishwajit-vm/strutvane-docs/edit/0.2.x/content/installation.mdx')
    assert.equal(editUrl(contextFor('0.1.x'), 'versions/0.1.x/migrations.mdx'), undefined)
  })

  it('canonical prefers the current version’s copy of a page', () => {
    assert.equal(canonicalUrl(contextFor('0.1.x'), 'migrations'), 'https://vishwajit-vm.github.io/strutvane-docs/docs/0.2.x/migrations/')
    assert.equal(canonicalUrl(contextFor('0.1.x'), 'models-and-fields'), 'https://vishwajit-vm.github.io/strutvane-docs/docs/0.1.x/models-and-fields/')
  })

  it('Markdown exports live next to the page', () => {
    assert.deepEqual(exportLinks(contextFor('0.2.x'), 'installation'), {
      markdown: '/strutvane-docs/docs/0.2.x/installation.md',
      llms: '/strutvane-docs/docs/0.2.x/llms.txt',
      llmsFull: '/strutvane-docs/docs/0.2.x/llms-full.txt',
    })
  })

  it('refuses to build a version that is not in the manifest', () => {
    assert.throws(() => contextFor('0.9.x'), /not in the manifest/)
    assert.equal(manifest().versions.length, 2)
  })
})
