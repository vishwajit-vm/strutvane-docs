/**
 * `npm run build`: builds every docs version and merges them into one static site in `dist/`.
 *
 * Steps (each one fails with a friendly message):
 * 1. Read versions from git branches when a version's source is `{ git }` (none in this prototype).
 * 2. Compute the site manifest once: every version's pages, plus the support table. Every
 *    version's build gets the same manifest, so all switchers and banners agree.
 * 3. Build each version separately with Astro (`DOCS_VERSION=0.2.x astro build`), each under
 *    its own base path `{base}docs/{branch}/`, with its own Pagefind search index.
 * 4. Merge: copy each build to `dist/docs/{branch}/`, add the redirects (`/docs/latest/…`,
 *    `/docs/{page}/`, `/`), the site-wide 404 page, `versions.json` and `.nojekyll`.
 *
 * In the real site (the strutvane-docs repo), step 3 runs inside each branch's own checkout (that branch's site code and
 * content), receiving the manifest through `DOCS_MANIFEST`; steps 1, 2 and 4 run on `main`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { siteTitle, supportTable, versions } from '../docs.sources.ts'
import { createManifest } from './lib/build-settings.ts'
import { runAstro, runMain } from './lib/cli.ts'
import { materializeGitSource } from './lib/content-source.ts'
import { DocsBuildError } from './lib/errors.ts'
import { notFoundRescueScript, planRedirects, redirectHtml } from './lib/redirects.ts'
import type { SiteManifest } from './lib/site-context.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const buildDir = join(root, '.build')
const distDir = join(root, 'dist')

/** Writes a file, creating its folder, and refuses to overwrite one (fail closed). */
function writeNew(file: string, content: string): void {
  if (existsSync(file)) {
    throw new DocsBuildError(`Refusing to overwrite ${file} with a redirect.`, 'A real page already lives at that URL. Rename the page, or drop the redirect in scripts/lib/redirects.ts.')
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** Step 4: merge the per-version builds into `dist/`. */
function assemble(manifest: SiteManifest): number {
  rmSync(distDir, { recursive: true, force: true })
  for (const version of manifest.versions) {
    cpSync(join(buildDir, version.id), join(distDir, 'docs', version.id), { recursive: true })
  }

  // The site-wide 404 page is the current version's (it has the menu and search), plus a
  // tiny script that rescues /docs/latest/<page> links. Its asset URLs are absolute, so it
  // works from any folder.
  const current = manifest.versions.find((version) => version.role === 'current')
  if (current === undefined) throw new Error('assemble: no current version in the manifest.')
  const notFound = readFileSync(join(buildDir, current.id, '404.html'), 'utf8')
  writeNew(join(distDir, '404.html'), notFound.replace('</head>', `<script>${notFoundRescueScript(manifest)}</script></head>`))

  const redirects = planRedirects(manifest)
  for (const redirect of redirects) writeNew(join(distDir, redirect.from, 'index.html'), redirectHtml(redirect.to))

  // The support table, served at the site root for tools (`node strut about`, the starter).
  writeNew(join(distDir, 'versions.json'), `${JSON.stringify(supportTable, null, 2)}\n`)
  // GitHub Pages: don't run Jekyll (it would hide the `_astro/` folders).
  writeNew(join(distDir, '.nojekyll'), '')
  return redirects.length
}

runMain(async () => {
  const started = performance.now()
  for (const version of versions) {
    if ('git' in version.source) {
      console.log(`→ Reading docs ${version.id} from git (${version.source.git.ref}:${version.source.git.path})`)
      materializeGitSource(version, { root })
    }
  }

  const manifest = createManifest({ root, siteTitle, supportTable, versions, env: process.env })
  rmSync(buildDir, { recursive: true, force: true })
  mkdirSync(buildDir, { recursive: true })
  const manifestFile = join(buildDir, 'manifest.json')
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)

  for (const version of manifest.versions) {
    // Start every release build from an empty content cache. Astro caches rendered Markdown,
    // and that HTML links to the code-block stylesheet by its hash: after a theme change, cached
    // pages pointed at a stylesheet that no longer existed (found by the link checker).
    rmSync(join(root, 'node_modules', '.astro-docs', version.id), { recursive: true, force: true })
    console.log(`\n→ Building docs ${version.id} (${version.pages.length} pages) at ${manifest.base}docs/${version.id}/`)
    await runAstro(root, ['build'], { DOCS_VERSION: version.id, DOCS_MANIFEST: manifestFile })
  }

  const redirectCount = assemble(manifest)
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  console.log(`\n✔ Built ${manifest.versions.map((version) => version.id).join(', ')} into dist/ with ${redirectCount} redirects in ${seconds}s.`)
  console.log('  Preview it with: npm run preview')
})
