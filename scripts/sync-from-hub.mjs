#!/usr/bin/env node
/**
 * `npm run sync`: re-imports the docs site from the hub repository (the source of truth).
 *
 * The docs are written in the hub, in `spikes/15-versioned-docs-site/`. This repo is what
 * GitHub Pages builds. This script copies the hub's COMMITTED snapshot of that folder into
 * this repo, so a docs update is one command, then `npm ci`, `npm run verify`, commit, push.
 *
 * ```bash
 * npm run sync                                   # hub at ../.. (the local workspace layout), ref HEAD
 * node scripts/sync-from-hub.mjs --hub ../strutvane --ref origin/main
 * node scripts/sync-from-hub.mjs --allow-dirty   # don't insist on a clean working tree here
 * ```
 *
 * Why read from git instead of copying the folder: several writers edit the hub's working tree
 * at once. Reading blobs from a commit (`git ls-tree` + `git cat-file`) publishes only what was
 * committed, never someone's half-written page, and never touches the hub's working tree or index.
 *
 * What it does, in order (it stops, before writing anything, on the first problem):
 * 1. Reads every file of the spike folder at `--ref` from the hub.
 * 2. Deletes every tracked file here that the snapshot no longer has (pages removed in the hub
 *    disappear from the site), except the files this repo owns ({@link REPO_OWNED}).
 * 3. Writes the snapshot. The hub's `README.md` becomes `DESIGN.md` (this repo has its own README).
 * 4. Applies this repo's few, checked adjustments ({@link adjust}): package name and scripts,
 *    and "Edit this page" links pointing at the hub (where pages are really edited).
 * 5. Records the imported hub commit in `hub-snapshot.json`.
 *
 * Failure scenarios, all fail closed: the hub isn't a git repo or the ref doesn't exist; the
 * folder is missing or empty at that ref; the snapshot holds a symlink, submodule or a path
 * escaping this repo; this repo has uncommitted changes (they would be mixed into the import);
 * an adjustment's anchor text is gone from the hub's files (the hub changed: update {@link adjust});
 * the hub's `.gitignore` has a rule this repo's `.gitignore` lacks.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The docs site's folder inside the hub repository. */
const SPIKE_PATH = 'spikes/15-versioned-docs-site'

/** Where the hub lives on GitHub; "Edit this page" links open the page there. */
const HUB_URL = 'https://github.com/vishwajit-vm/strutvane'

/**
 * Files this repo owns. The import never writes or deletes them.
 * `.gitignore` is owned here because ours also keeps secrets and Docker files out (ADR-0006);
 * the import checks that it still contains every rule of the hub's `.gitignore`.
 */
const REPO_OWNED = [
  'README.md',
  'LICENSE',
  'CLAUDE.md',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  'hub-snapshot.json',
  'scripts/sync-from-hub.mjs',
  'scripts/v1-redirects.mjs',
]
/** Folders this repo owns (synced from strutvane-tooling or specific to this repo). */
const REPO_OWNED_DIRS = ['.claude/', '.github/']

/** Snapshot files that land under another name here. */
const RENAMED = new Map([['README.md', 'DESIGN.md']])

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

class SyncError extends Error {
  /** @param {string} message @param {string} hint */
  constructor(message, hint) {
    super(message)
    this.hint = hint
  }
}

/** @param {string} path */
function isRepoOwned(path) {
  return REPO_OWNED.includes(path) || REPO_OWNED_DIRS.some((dir) => path.startsWith(dir))
}

/**
 * Runs git without a shell, so refs and paths are never interpreted by one.
 * @param {string} cwd @param {readonly string[]} args @param {Buffer} [input]
 */
function git(cwd, args, input) {
  return execFileSync('git', ['-C', cwd, ...args], {
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = { hub: resolve(root, '..', '..'), ref: 'HEAD', allowDirty: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = () => {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('-')) throw new SyncError(`${arg} needs a value.`, 'Example: --ref origin/main')
      i += 1
      return next
    }
    if (arg === '--hub') options.hub = resolve(value())
    else if (arg === '--ref') options.ref = value()
    else if (arg === '--allow-dirty') options.allowDirty = true
    else throw new SyncError(`Unknown option: ${arg}`, 'Options: --hub <path>, --ref <git ref>, --allow-dirty')
  }
  if (options.ref.startsWith('-')) throw new SyncError(`Refusing the ref "${options.ref}".`, 'Use a branch, tag or commit, like HEAD or origin/main.')
  return options
}

/**
 * Reads every file of the spike folder at `ref`, as raw bytes keyed by path inside the folder.
 * @param {string} hub @param {string} ref
 * @returns {{ commit: string, committedAt: string, files: Map<string, Buffer> }}
 */
function readSnapshot(hub, ref) {
  let commit
  try {
    commit = git(hub, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).toString().trim()
  } catch {
    throw new SyncError(`"${ref}" is not a commit in ${hub}.`, 'Pass the hub folder with --hub and an existing ref with --ref.')
  }
  // The last commit that changed the docs folder: stable while nothing in the docs changes.
  const [lastChange = '', committedAt = ''] = git(hub, ['log', '-1', '--format=%H%n%cI', commit, '--', SPIKE_PATH]).toString().trim().split('\n')
  if (lastChange === '') throw new SyncError(`${SPIKE_PATH} does not exist at ${ref} in ${hub}.`, 'Check --hub and --ref.')

  const listing = git(hub, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', SPIKE_PATH]).toString('utf8')
  /** @type {Array<{ path: string, sha: string }>} */
  const entries = []
  for (const record of listing.split('\0')) {
    if (record === '') continue
    const match = /^(\d{6}) (\w+) ([0-9a-f]+)\t(.+)$/s.exec(record)
    if (match === null) throw new SyncError(`Unexpected git ls-tree output: ${record}`, 'Report this; the script needs updating.')
    const [, mode, type, sha, fullPath] = match
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) {
      throw new SyncError(`${fullPath} is a ${type} (mode ${mode}); only regular files can be imported.`, 'Replace it with a regular file in the hub.')
    }
    entries.push({ path: fullPath.slice(SPIKE_PATH.length + 1), sha })
  }
  if (entries.length === 0) throw new SyncError(`${SPIKE_PATH} is empty at ${ref}.`, 'Check --ref.')

  // One `git cat-file --batch` call for every blob: output is "<sha> blob <size>\n<bytes>\n".
  const output = git(hub, ['cat-file', '--batch'], Buffer.from(entries.map((entry) => `${entry.sha}\n`).join('')))
  const files = new Map()
  let offset = 0
  for (const entry of entries) {
    const headerEnd = output.indexOf(0x0a, offset)
    const header = output.subarray(offset, headerEnd).toString('utf8').split(' ')
    if (header[0] !== entry.sha || header[1] !== 'blob') throw new SyncError(`git cat-file returned "${header.join(' ')}" for ${entry.path}.`, 'Retry; if it persists, report it.')
    const size = Number(header[2])
    files.set(entry.path, output.subarray(headerEnd + 1, headerEnd + 1 + size))
    offset = headerEnd + 1 + size + 1
  }
  return { commit: lastChange, committedAt, files }
}

/**
 * Where a snapshot file lands here, or `undefined` when this repo owns that path.
 * @param {string} path
 */
function targetOf(path) {
  const target = RENAMED.get(path) ?? path
  if (isAbsolute(target) || normalize(target).split(sep).includes('..')) {
    throw new SyncError(`The snapshot has an unsafe path: ${path}`, 'Rename the file in the hub.')
  }
  return isRepoOwned(target) ? undefined : target
}

/**
 * Replaces `from` with `to` in a text, failing when `from` is not there exactly once.
 * @param {string} text @param {string} from @param {string} to @param {string} file
 */
function replaceOnce(text, from, to, file) {
  const count = text.split(from).length - 1
  if (count !== 1) {
    throw new SyncError(
      `${file}: expected the text ${JSON.stringify(from)} once, found it ${count} time(s).`,
      'The hub changed this file. Update the matching adjustment in scripts/sync-from-hub.mjs.',
    )
  }
  return text.replace(from, () => to)
}

/**
 * This repo's adjustments to the snapshot, each checked so a hub change can't silently undo it.
 *
 * - `package.json` and `package-lock.json`: this repo's name, description and licence; `build`
 *   also writes the v1 redirects (old v1 URLs → their 0.1.x pages); `sync` runs this script.
 * - "Edit this page": the hub design reads each line from a `0.N.x` branch's `content/` folder
 *   here. Until a line is frozen onto such a branch, its pages are edited in the hub, so the
 *   link opens the page in the hub. The built-site test that pins the link is updated to match.
 * @param {Map<string, Buffer>} files
 */
function adjust(files) {
  const text = (/** @type {string} */ path) => {
    const content = files.get(path)
    if (content === undefined) throw new SyncError(`The snapshot has no ${path}.`, 'Update the adjustments in scripts/sync-from-hub.mjs.')
    return content.toString('utf8')
  }
  const name = 'strutvane-docs'

  const pkg = JSON.parse(text('package.json'))
  if (typeof pkg.scripts?.build !== 'string') throw new SyncError('package.json has no "build" script.', 'Update scripts/sync-from-hub.mjs.')
  pkg.name = name
  pkg.description = 'The Strutvane documentation site: versioned docs (one Starlight build per version), deployed to GitHub Pages.'
  pkg.license = 'MIT AND CC-BY-4.0'
  pkg.scripts.build = `${pkg.scripts.build} && node scripts/v1-redirects.mjs`
  pkg.scripts.sync = 'node scripts/sync-from-hub.mjs'
  files.set('package.json', Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`))

  const lock = JSON.parse(text('package-lock.json'))
  lock.name = name
  if (lock.packages?.[''] !== undefined) {
    lock.packages[''].name = name
    lock.packages[''].license = pkg.license
  }
  files.set('package-lock.json', Buffer.from(`${JSON.stringify(lock, null, 2)}\n`))

  const hubEdit = `${HUB_URL}/edit/main/${SPIKE_PATH}/versions/`
  files.set(
    'docs.sources.ts',
    Buffer.from(replaceOnce(text('docs.sources.ts'), '`${docsRepositoryUrl}/edit/${branch}/content/`', `\`${hubEdit}\${branch}/\``, 'docs.sources.ts')),
  )
  files.set(
    'test/site.test.ts',
    Buffer.from(
      replaceOnce(
        text('test/site.test.ts'),
        "'https://github.com/vishwajit-vm/strutvane-docs/edit/0.2.x/content/installation.mdx'",
        `'${hubEdit}0.2.x/installation.mdx'`,
        'test/site.test.ts',
      ),
    ),
  )
}

/**
 * Our `.gitignore` must keep ignoring everything the hub's does (build output, caches) and keep
 * un-ignoring what it un-ignores (the package pages).
 * @param {Buffer | undefined} hubIgnore
 */
function checkGitignore(hubIgnore) {
  if (hubIgnore === undefined) return
  const ours = new Set(readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/).map((line) => line.trim()))
  const missing = hubIgnore
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && !ours.has(line))
  if (missing.length > 0) {
    throw new SyncError(`.gitignore is missing the hub's rule(s): ${missing.join(', ')}`, 'Add them to .gitignore here, then run the sync again.')
  }
}

/**
 * Removes a folder left empty by a deleted page, then its empty parents, up to the repo root.
 * Why: a stale empty `src/content/docs/` would still look like content to Astro tools.
 * @param {string} folder
 */
function pruneEmptyFolders(folder) {
  let current = folder
  while (current !== root && !relative(root, current).startsWith('..') && existsSync(current) && readdirSync(current).length === 0) {
    rmdirSync(current)
    current = dirname(current)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (resolve(options.hub) === root) throw new SyncError('--hub points at this repo.', 'Point it at the hub (the strutvane repository).')

  if (!options.allowDirty) {
    const status = git(root, ['status', '--porcelain']).toString().trim()
    if (status !== '') throw new SyncError('This repo has uncommitted changes; they would be mixed into the import.', 'Commit or stash them, or pass --allow-dirty.')
  }

  const snapshot = readSnapshot(options.hub, options.ref)
  checkGitignore(snapshot.files.get('.gitignore'))
  adjust(snapshot.files)

  /** @type {Map<string, Buffer>} */
  const writes = new Map()
  for (const [path, content] of snapshot.files) {
    const target = targetOf(path)
    if (target !== undefined) writes.set(target, content)
  }

  // Everything is validated; only now touch the files.
  const tracked = git(root, ['ls-files', '-z']).toString('utf8').split('\0').filter((path) => path !== '')
  let removed = 0
  for (const path of tracked) {
    if (isRepoOwned(path) || writes.has(path)) continue
    rmSync(join(root, path), { force: true })
    removed += 1
    pruneEmptyFolders(dirname(join(root, path)))
  }
  for (const [path, content] of writes) {
    const file = join(root, path)
    if (relative(root, file).startsWith('..')) throw new SyncError(`Refusing to write outside the repo: ${path}`, 'Rename the file in the hub.')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  const record = {
    hub: HUB_URL,
    path: SPIKE_PATH,
    commit: snapshot.commit,
    committedAt: snapshot.committedAt,
    note: 'The last hub commit that changed the docs folder, imported by scripts/sync-from-hub.mjs. Do not edit by hand.',
  }
  writeFileSync(join(root, 'hub-snapshot.json'), `${JSON.stringify(record, null, 2)}\n`)

  console.log(`✔ Imported ${writes.size} files from ${SPIKE_PATH} at ${snapshot.commit.slice(0, 12)} (${snapshot.committedAt}); removed ${removed} stale file(s).`)
  console.log('  Next: npm ci && npm run verify, then review `git status`, commit (git commit -s) and push main.')
  if (existsSync(join(root, 'dist'))) console.log('  (dist/ holds an older build; npm run verify rebuilds it.)')
}

try {
  main()
} catch (error) {
  if (error instanceof SyncError) {
    process.stderr.write(`✘ ${error.message}\n  ${error.hint}\n`)
    process.exitCode = 1
  } else {
    throw error
  }
}
