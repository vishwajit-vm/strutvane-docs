import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { versions } from '../docs.sources.ts'
import { resolveContentDir } from '../scripts/lib/content-source.ts'
import { DocsBuildError } from '../scripts/lib/errors.ts'
import { checkNavigation, loadNavigation, parseNavigation, toStarlightSidebar } from '../scripts/lib/navigation.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

describe('parseNavigation', () => {
  it('accepts slugs and { slug, label } items', () => {
    const nav = parseNavigation({ home: 'introduction', groups: [{ label: 'Getting Started', items: ['introduction', { slug: 'first-crud', label: 'Your First CRUD' }] }] }, 'nav.json')
    assert.deepEqual(toStarlightSidebar(nav), [{ label: 'Getting Started', collapsed: true, items: [{ slug: 'introduction' }, { slug: 'first-crud', label: 'Your First CRUD' }] }])
  })

  it('explains what is wrong with a malformed file', () => {
    const cases: Array<[unknown, RegExp]> = [
      [[], /must contain a JSON object/],
      [{ groups: [] }, /no "home" page/],
      [{ home: 'a', groups: [] }, /no "groups"/],
      [{ home: 'a', groups: [{ items: ['a'] }] }, /group 1 has no "label"/],
      [{ home: 'a', groups: [{ label: 'A', items: [] }] }, /has no items/],
      [{ home: 'a', groups: [{ label: 'A', items: [42] }] }, /every item must be a page slug/],
    ]
    for (const [json, message] of cases) {
      assert.throws(() => parseNavigation(json, 'nav.json'), (error: unknown) => error instanceof DocsBuildError && message.test(error.message))
    }
  })
})

describe('checkNavigation', () => {
  it('reports every mismatch at once', () => {
    const nav = parseNavigation({ home: 'start', groups: [{ label: 'A', items: ['intro', 'intro', 'Bad Slug', 'missing'] }] }, 'nav.json')
    assert.throws(() => checkNavigation(nav, ['intro', 'orphan'], '0.2.x'), (error: unknown) => {
      assert.ok(error instanceof DocsBuildError)
      for (const part of ['listed more than once', '"Bad Slug"', '"missing" (in "A") has no page', '"orphan" is not in the navigation', 'home page "start"']) {
        assert.ok(error.message.includes(part), `expected the message to mention: ${part}\n${error.message}`)
      }
      return true
    })
  })
})

describe('the real versions', () => {
  it('every version folder has a navigation that matches its pages', () => {
    for (const version of versions) {
      const nav = loadNavigation(resolveContentDir(version, { root }), version.id)
      assert.equal(nav.home, 'introduction')
    }
  })

  it('0.2.x follows Laravel’s learning order', () => {
    const version = versions.find((v) => v.id === '0.2.x')
    assert.ok(version)
    const nav = loadNavigation(resolveContentDir(version, { root }), version.id)
    // Generated groups (the Packages menu, from src/data/packages.json) sit under their parent.
    const topLevel = nav.groups.map((group) => group.parent ?? group.label).filter((label, index, all) => all[index - 1] !== label)
    assert.deepEqual(topLevel, [
      'Prologue', 'Getting Started', 'Architecture Concepts', 'The Basics', 'Digging Deeper', 'Security',
      'Database', 'ORM', 'Auto CRUD & UI', 'Testing', 'Packages', 'CLI Reference',
    ])
  })

  it('reports a missing content folder with a hint', () => {
    assert.throws(
      () => resolveContentDir({ id: 'x', line: 'x', role: 'eol', branch: '9.x', prerelease: false, source: { folder: join('versions', 'nope') } }, { root }),
      (error: unknown) => error instanceof DocsBuildError && /was not found/.test(error.message),
    )
  })
})
