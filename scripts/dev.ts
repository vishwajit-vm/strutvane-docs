/**
 * `npm run dev`: a live-reloading server for ONE docs version (the current one by default).
 *
 * ```bash
 * npm run dev                       # current version (0.2.x)
 * npm run dev -- --version 0.1.x    # another version
 * ```
 *
 * Why one version at a time: each version is a separate site with its own base path, just
 * like in production. Links to other versions (switcher, banners) and search need the full
 * build: `npm run build && npm run preview`.
 */
import { fileURLToPath } from 'node:url'
import { currentVersion, findVersion } from './lib/versions.ts'
import { versions } from '../docs.sources.ts'
import { resolveSiteLocation } from './lib/build-settings.ts'
import { readFlag, runAstro, runMain } from './lib/cli.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

runMain(async () => {
  const args = process.argv.slice(2)
  const requested = readFlag(args, 'version')
  const version = requested === undefined ? currentVersion(versions) : findVersion(versions, requested)
  const { base } = resolveSiteLocation(process.env)
  const port = readFlag(args, 'port') ?? '4321'
  console.log(`\n  Strutvane docs ${version.id}: http://localhost:${port}${base}docs/${version.id}/introduction/`)
  console.log('  Search, redirects and the other versions work in the full build: npm run build && npm run preview\n')
  await runAstro(root, ['dev', '--port', port], { DOCS_VERSION: version.id })
})
