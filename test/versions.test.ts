import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DocsBuildError } from '../scripts/lib/errors.ts'
import { currentVersion, findVersion, parseSupportTable, resolveDocsVersions } from '../scripts/lib/versions.ts'
import { supportTable, supportTableJson } from './fixtures.ts'

const editUrl = (branch: string): string => `https://example.test/edit/${branch}/`

/** Asserts that `fn` throws a friendly DocsBuildError whose message matches. */
function throwsFriendly(fn: () => unknown, message: RegExp): void {
  assert.throws(fn, (error: unknown) => error instanceof DocsBuildError && message.test(error.message) && error.hint.length > 0)
}

describe('parseSupportTable (versions.json)', () => {
  it('accepts the real table shape', () => {
    assert.deepEqual(parseSupportTable(supportTableJson(), 'versions.json'), supportTable)
  })

  it('refuses a "current" line that is not listed', () => {
    throwsFriendly(() => parseSupportTable({ ...supportTableJson(), current: '0.3' }, 'versions.json'), /no line "0\.3"/)
  })

  it('refuses an end-of-life current line', () => {
    const json = supportTableJson()
    throwsFriendly(() => parseSupportTable({ ...json, current: '0.1' }, 'versions.json'), /current line 0\.1 is marked "eol"/)
  })

  it('refuses docs URLs that do not use the branch name', () => {
    const json = supportTableJson() as { lines: Array<Record<string, unknown>> }
    json.lines[1] = { ...json.lines[1], docs: '/docs/0.1/' }
    throwsFriendly(() => parseSupportTable(json, 'versions.json'), /served at "\/docs\/0\.1\.x\/"/)
  })

  it('refuses branch names that would clash with redirects', () => {
    for (const branch of ['latest', 'main', '0.2', 'v0.2.x']) {
      const json = supportTableJson() as { lines: Array<Record<string, unknown>> }
      json.lines[1] = { ...json.lines[1], branch, docs: `/docs/${branch}/` }
      throwsFriendly(() => parseSupportTable(json, 'versions.json'), /not a release branch name/)
    }
  })

  it('refuses malformed dates and statuses', () => {
    const badDate = supportTableJson() as { lines: Array<Record<string, unknown>> }
    badDate.lines[0] = { ...badDate.lines[0], released: '12/01/2027' }
    throwsFriendly(() => parseSupportTable(badDate, 'versions.json'), /"released" must be a date/)
    const badStatus = supportTableJson() as { lines: Array<Record<string, unknown>> }
    badStatus.lines[0] = { ...badStatus.lines[0], status: 'lts' }
    throwsFriendly(() => parseSupportTable(badStatus, 'versions.json'), /"status" must be/)
  })
})

describe('resolveDocsVersions', () => {
  const sources = { '0.2.x': { folder: 'versions/0.2.x' }, '0.1.x': { folder: 'versions/0.1.x' } }

  it('gives each branch its role, newest first, and no edit link for end-of-life lines', () => {
    const versions = resolveDocsVersions(supportTable, sources, { editUrl })
    assert.deepEqual(versions.map((v) => [v.id, v.line, v.role, v.prerelease, v.editBaseUrl]), [
      ['0.2.x', '0.2', 'current', true, 'https://example.test/edit/0.2.x/'],
      ['0.1.x', '0.1', 'eol', false, undefined],
    ])
    assert.equal(currentVersion(versions).id, '0.2.x')
  })

  it('puts main (the unreleased next line) first when it has a source', () => {
    const versions = resolveDocsVersions(supportTable, { main: { folder: 'content' }, ...sources }, { editUrl })
    assert.deepEqual(versions.map((v) => `${v.id}:${v.role}`), ['main:next', '0.2.x:current', '0.1.x:eol'])
  })

  it('skips an end-of-life line without content, but refuses a supported one', () => {
    assert.deepEqual(resolveDocsVersions(supportTable, { '0.2.x': sources['0.2.x'] }, { editUrl }).map((v) => v.id), ['0.2.x'])
    throwsFriendly(() => resolveDocsVersions(supportTable, { '0.1.x': sources['0.1.x'] }, { editUrl }), /still supported/)
  })

  it('refuses content for a branch that versions.json does not know', () => {
    throwsFriendly(() => resolveDocsVersions(supportTable, { ...sources, '0.9.x': { folder: 'x' } }, { editUrl }), /"0\.9\.x"/)
  })

  it('findVersion lists the valid ids when a typo is made', () => {
    const versions = resolveDocsVersions(supportTable, sources, { editUrl })
    assert.throws(() => findVersion(versions, '0.3.x'), (error: unknown) => error instanceof DocsBuildError && error.hint.includes('0.2.x, 0.1.x'))
  })
})
