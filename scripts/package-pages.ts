/**
 * `npm run packages:pages`: writes one page per entry of `src/data/packages.json` into the
 * current version's `packages/` folder. `--check` writes nothing and exits 1 when a page is
 * missing or out of step (the tests run the same check).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { versions } from '../docs.sources.ts'
import { resolveContentDir } from './lib/content-source.ts'
import { describeError } from './lib/errors.ts'
import { writePackagePages } from './lib/package-pages.ts'
import { PACKAGES_DATA_FILE } from './lib/navigation.ts'
import { parsePackagesData } from './lib/packages-data.ts'
import { currentVersion } from './lib/versions.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')
try {
  const data = parsePackagesData(JSON.parse(readFileSync(PACKAGES_DATA_FILE, 'utf8')), 'src/data/packages.json')
  const result = writePackagePages(data, resolveContentDir(currentVersion(versions), { root }), { check })
  for (const path of result.replaced) console.log(`${check ? 'would replace' : 'replaced'} ${path} with a generated .mdx page`)
  for (const path of result.written) console.log(`${check ? 'out of step' : 'wrote'} ${path}`)
  console.log(`${result.unchanged.length} package pages already in step, ${result.written.length} ${check ? 'out of step' : 'written'}.`)
  if (check && (result.written.length > 0 || result.replaced.length > 0)) {
    console.log('Run: npm run packages:pages')
    process.exitCode = 1
  }
} catch (error) {
  console.error(describeError(error))
  process.exitCode = 1
}
