/**
 * Finds (and, for git branches, fetches) the folder that holds one version's Markdown.
 *
 * Today every version is a folder in this project (`versions/0.2.x`, `versions/0.1.x`). In the
 * strutvane-docs repo, a version can instead say "read `content` from branch
 * `origin/0.2.x`". We read those files straight from git (`git ls-tree` + `git show`) into
 * `.cache/versions/<id>/`, without checking the branch out, so the working copy is never touched.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { DocsBuildError } from './errors.ts'
import type { DocsVersion } from './versions.ts'

/** Where the project lives and where fetched branches are cached. */
export interface SourceOptions {
  /** The docs project root (the folder with `docs.versions.ts`). */
  readonly root: string
  /** Defaults to `<root>/.cache/versions`. */
  readonly cacheDir?: string | undefined
}

function cacheDirOf(options: SourceOptions): string {
  return options.cacheDir ?? join(options.root, '.cache', 'versions')
}

/**
 * Returns the absolute folder that holds a version's content.
 *
 * For a `folder` source that is the folder itself, so `npm run dev` picks up your edits
 * instantly. For a `git` source it is the cache folder, which must have been filled by
 * {@link materializeGitSource} first (`npm run build` does that for you).
 *
 * @example
 * ```ts
 * resolveContentDir(findVersion(versions, '0.2'), { root }) // 'C:\\…\\versions\\0.2'
 * ```
 */
export function resolveContentDir(version: DocsVersion, options: SourceOptions): string {
  const dir = 'folder' in version.source
    ? resolve(options.root, version.source.folder)
    : join(cacheDirOf(options), version.id)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new DocsBuildError(
      `The content folder for docs version "${version.id}" was not found: ${dir}`,
      'folder' in version.source
        ? `Create it, or fix "source.folder" for "${version.id}" in docs.versions.ts.`
        : 'Run `npm run build` once: it reads the branch from git into .cache/versions/.',
    )
  }
  return dir
}

/** Runs git without a shell (so refs and paths are never interpreted by a shell). */
function git(root: string, args: readonly string[]): Buffer {
  return execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
}

/**
 * Copies a version's content folder from a git ref into the cache, and returns the cache folder.
 *
 * Why read with `git show` instead of `git checkout` or `git worktree`: the build must never
 * change the files you are working on, and it must work on Windows without `tar`.
 * The cache folder is wiped first, so a page deleted on the branch disappears from the site.
 *
 * Fails closed: an unknown ref, an empty folder or a ref that looks like a command-line option
 * stops the build with a hint, instead of publishing a version with no pages.
 *
 * @example
 * ```ts
 * // docs.sources.ts: '0.2.x': { git: { ref: 'origin/0.2.x', path: 'content' } }
 * materializeGitSource(findVersion(versions, '0.2.x'), { root: repoRoot }) // '<root>/.cache/versions/0.2.x'
 * ```
 */
export function materializeGitSource(version: DocsVersion, options: SourceOptions): string {
  if (!('git' in version.source)) return resolveContentDir(version, options)
  const { ref, path } = version.source.git
  if (ref.startsWith('-') || path.startsWith('-')) {
    throw new DocsBuildError(`Docs version "${version.id}" has a git ref or path starting with "-".`, 'Use a branch name like "origin/0.2.x".')
  }
  const folder = path.replace(/^\/+|\/+$/g, '')
  let listing: string
  try {
    listing = git(options.root, ['ls-tree', '-r', '-z', '--name-only', ref, '--', folder]).toString('utf8')
  } catch {
    throw new DocsBuildError(
      `Git could not read "${folder}" from "${ref}" for docs version "${version.id}".`,
      `Check that the branch exists locally (git fetch origin ${ref.replace(/^origin\//, '')}) and the path is right in docs.versions.ts.`,
    )
  }
  const files = listing.split('\0').filter((file) => file !== '')
  if (files.length === 0) {
    throw new DocsBuildError(
      `"${folder}" on "${ref}" has no files, so docs version "${version.id}" would be empty.`,
      'Check the path in docs.versions.ts, or remove the version.',
    )
  }
  const target = join(cacheDirOf(options), version.id)
  rmSync(target, { recursive: true, force: true })
  for (const file of files) {
    const relativePath = file.slice(folder.length + 1)
    const destination = resolve(target, relativePath)
    // git never stores ".." segments, but we still refuse to write outside the cache folder.
    if (!destination.startsWith(target + sep)) {
      throw new DocsBuildError(`Refusing to write "${file}" outside the cache folder.`, 'Rename the file on the branch.')
    }
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, git(options.root, ['show', `${ref}:${file}`]))
  }
  return target
}
