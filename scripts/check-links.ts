/**
 * `npm run check:links`: checks every internal link in the merged site, across all versions.
 *
 * ```bash
 * npm run build && npm run check:links
 * ```
 *
 * Exits with code 1 and lists each broken link (page, link, reason) when anything is wrong.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSiteLocation } from './lib/build-settings.ts'
import { runMain } from './lib/cli.ts'
import { DocsBuildError } from './lib/errors.ts'
import { checkLinks } from './lib/link-checker.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

runMain(async () => {
  const distDir = join(root, 'dist')
  if (!existsSync(distDir)) throw new DocsBuildError('dist/ was not found.', 'Build the site first: npm run build')
  const { base } = resolveSiteLocation(process.env)
  const report = checkLinks(distDir, base)
  if (report.broken.length > 0) {
    const lines = report.broken.map((link) => `    ${link.page}\n      → ${link.link}  (${link.reason})`)
    throw new DocsBuildError(
      `${report.broken.length} broken link(s) (checked ${report.checked} internal links on ${report.pages} pages):\n${lines.join('\n')}`,
      'Fix each link in the page shown (use relative links like ../migrations/ between pages of one version).',
    )
  }
  console.log(`✔ All ${report.checked} internal links and anchors are valid (${report.pages} HTML pages, every version, base "${base}").`)
})
