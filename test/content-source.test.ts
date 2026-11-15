/**
 * Reading a version's docs straight from a git branch, in a real temporary git repository.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { materializeGitSource, resolveContentDir } from '../scripts/lib/content-source.ts'
import { DocsBuildError } from '../scripts/lib/errors.ts'
import type { DocsVersion } from '../scripts/lib/versions.ts'

let repo = ''
const git = (...args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })

function version(ref: string, path = 'content'): DocsVersion {
  return { id: '0.1.x', line: '0.1', role: 'eol', branch: '0.1.x', prerelease: false, source: { git: { ref, path } } }
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'strutvane-docs-git-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'docs@example.test')
  git('config', 'user.name', 'Docs Test')
  git('config', 'commit.gpgsign', 'false')
  mkdirSync(join(repo, 'content', 'packages'), { recursive: true })
  writeFileSync(join(repo, 'content', 'installation.md'), '# 0.1 install\n')
  writeFileSync(join(repo, 'content', 'packages', 'auth.md'), '# auth\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'docs for 0.1')
  git('branch', '0.1.x')
  // main moves on: the page changes and a new one appears.
  writeFileSync(join(repo, 'content', 'installation.md'), '# 0.2 install\n')
  writeFileSync(join(repo, 'content', 'first-crud.md'), '# new\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'docs for 0.2')
})

after(() => rmSync(repo, { recursive: true, force: true }))

describe('materializeGitSource', () => {
  it('copies the folder as it is on the branch, without touching the working copy', () => {
    const dir = materializeGitSource(version('0.1.x'), { root: repo })
    assert.equal(readFileSync(join(dir, 'installation.md'), 'utf8'), '# 0.1 install\n')
    assert.equal(readFileSync(join(dir, 'packages', 'auth.md'), 'utf8'), '# auth\n')
    assert.ok(!existsSync(join(dir, 'first-crud.md')), 'a page added later on main must not leak into 0.1.x')
    assert.equal(readFileSync(join(repo, 'content', 'installation.md'), 'utf8'), '# 0.2 install\n')
    assert.equal(resolveContentDir(version('0.1.x'), { root: repo }), dir)
  })

  it('wipes stale files from an earlier fetch', () => {
    const dir = materializeGitSource(version('0.1.x'), { root: repo })
    writeFileSync(join(dir, 'stale.md'), 'old')
    materializeGitSource(version('0.1.x'), { root: repo })
    assert.ok(!existsSync(join(dir, 'stale.md')))
  })

  it('fails closed with a hint for an unknown branch, an empty folder or an option-like ref', () => {
    const friendly = (error: unknown): boolean => error instanceof DocsBuildError && error.hint.length > 0
    assert.throws(() => materializeGitSource(version('9.9.x'), { root: repo }), friendly)
    assert.throws(() => materializeGitSource(version('0.1.x', 'nothing-here'), { root: repo }), friendly)
    assert.throws(() => materializeGitSource(version('--upload-pack=evil'), { root: repo }), friendly)
  })
})
