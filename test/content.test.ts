/**
 * Checks the parts of docs/WRITING-GUIDE.md a machine can check, on every current-version page.
 *
 * A page is "real" unless it is a short stub with the `:::note[Being written]` box. Legacy
 * versions are frozen snapshots and are not held to the new standard.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { versions } from '../docs.sources.ts'
import { currentVersion } from '../scripts/lib/versions.ts'
import { resolveContentDir } from '../scripts/lib/content-source.ts'
import { listContentPages } from '../scripts/lib/navigation.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const current = currentVersion(versions)
const dir = resolveContentDir(current, { root })

/** Every page of the current version, with its source. */
const pages = listContentPages(dir).map((slug) => {
  const file = ['.md', '.mdx'].map((ext) => join(dir, `${slug}${ext}`)).find((path) => {
    try {
      readFileSync(path)
      return true
    } catch {
      return false
    }
  })
  assert.ok(file, `no file for ${slug}`)
  return { slug, source: readFileSync(file, 'utf8') }
})
const real = pages.filter((page) => !page.source.includes(':::note[Being written]'))

describe(`writing guide (${current.id})`, () => {
  it('has real pages for the getting-started path, the ORM and the application core', () => {
    const slugs = new Set(real.map((page) => page.slug))
    for (const slug of [
      'introduction', 'installation', 'configuration', 'structure', 'first-crud', 'migrations', 'seeding', 'releases', 'upgrade',
      'orm', 'orm-querying', 'orm-relationships', 'orm-scopes', 'orm-casts', 'orm-mass-assignment', 'orm-pagination',
      'orm-soft-deletes', 'orm-slugs', 'orm-transactions', 'orm-tenancy',
      'lifecycle', 'container', 'providers', 'helpers', 'routing', 'middleware', 'csrf', 'controllers', 'requests',
      'validation', 'responses', 'errors', 'authorization', 'cli-reference',
      'docker', 'logging', 'security', 'designs', 'authentication', 'charts', 'packages/catalogue', 'versioning',
    ]) {
      assert.ok(slugs.has(slug), `${slug} should be a full page, not a stub`)
    }
  })

  for (const page of real) {
    it(`${page.slug}: has a code example, "Coming from Laravel?" and "Common mistakes"`, () => {
      assert.match(page.source, /^```[a-z]/m, 'needs at least one fenced code example with a language')
      assert.match(page.source, /^## Common mistakes$/m, 'needs a "## Common mistakes" section')
      assert.match(page.source, /Coming from Laravel\?/, 'needs a "Coming from Laravel?" box')
    })
  }

  it('every page uses npm only (no pnpm, yarn or bun commands)', () => {
    // The upgrade guide is the one place that shows 0.1's pnpm commands, as the "before" side.
    for (const page of pages.filter((p) => p.slug !== 'upgrade')) {
      assert.doesNotMatch(page.source, /^\s*(pnpm|yarn|bun) /m, `${page.slug} shows a non-npm command`)
    }
  })

  it('stubs are short and say they are being written', () => {
    for (const page of pages.filter((p) => !real.includes(p))) {
      assert.ok(page.source.split('\n').length < 40, `${page.slug} is long for a stub: finish it to the writing guide instead`)
    }
  })
})
