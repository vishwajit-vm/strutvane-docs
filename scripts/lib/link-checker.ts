/**
 * Checks every internal link of the built site, across all versions at once.
 *
 * Why check the built HTML and not the Markdown: it is what readers get. It catches broken
 * relative links in content, but also links our own components create: the version switcher,
 * the "old docs" banner, redirect pages and Markdown export links.
 *
 * For every page we check `href` and `src` attributes plus the `value` of `<option>` elements
 * whose value is a URL path (the version switcher). A link is broken when its file doesn't
 * exist or its `#anchor` isn't on the target page. External links are skipped on purpose:
 * they aren't under our control and would make the check flaky.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { normalizeBase, toPosix } from './paths.ts'

/** One broken link, with enough context to fix it. */
export interface BrokenLink {
  /** The URL of the page that contains the link. */
  readonly page: string
  readonly link: string
  readonly reason: string
}

/** The result of {@link checkLinks}. */
export interface LinkReport {
  readonly pages: number
  readonly checked: number
  readonly broken: readonly BrokenLink[]
}

function htmlFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full))
    else if (name.endsWith('.html')) out.push(full)
  }
  return out
}

/**
 * Crawls `distDir` (served at `base`) and returns every broken internal link.
 *
 * @example
 * ```ts
 * const report = checkLinks('dist', '/strutvane-docs/')
 * if (report.broken.length > 0) process.exitCode = 1
 * ```
 */
export function checkLinks(distDir: string, baseInput: string): LinkReport {
  const base = normalizeBase(baseInput)
  const urlOf = (file: string): string => {
    const rel = toPosix(relative(distDir, file))
    return base + (rel.endsWith('index.html') ? rel.slice(0, -'index.html'.length) : rel)
  }
  const fileOf = (pathname: string): string | undefined => {
    if (!pathname.startsWith(base)) return undefined
    const rel = decodeURIComponent(pathname.slice(base.length))
    const direct = join(distDir, rel)
    if (rel === '' || rel.endsWith('/')) return join(direct, 'index.html')
    if (existsSync(direct) && statSync(direct).isFile()) return direct
    return join(direct, 'index.html')
  }
  const ids = new Map<string, Set<string>>()
  const idsOf = (file: string): Set<string> => {
    let found = ids.get(file)
    if (found === undefined) {
      found = new Set([...readFileSync(file, 'utf8').matchAll(/\s(?:id|name)="([^"]+)"/g)].map((match) => match[1] ?? ''))
      ids.set(file, found)
    }
    return found
  }

  const pages = htmlFiles(distDir)
  const broken: BrokenLink[] = []
  let checked = 0
  for (const page of pages) {
    // Code samples are text, not links: an example like <script src="/build/app.js"> inside a
    // code block must not be checked as if it were part of the page.
    const html = readFileSync(page, 'utf8').replace(/<pre\b[\s\S]*?<\/pre>/g, '')
    const pageUrl = new URL(urlOf(page), 'https://docs.invalid')
    const links = [
      ...[...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((match) => match[1] ?? ''),
      ...[...html.matchAll(/<option\b[^>]*\svalue="(\/[^"]*)"/g)].map((match) => match[1] ?? ''),
    ]
    for (const rawLink of links) {
      const link = rawLink.replaceAll('&amp;', '&')
      if (link === '' || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue
      checked++
      const target = new URL(link, pageUrl)
      const file = fileOf(target.pathname)
      if (file === undefined) {
        broken.push({ page: urlOf(page), link, reason: `outside the site base "${base}"` })
      } else if (!existsSync(file)) {
        broken.push({ page: urlOf(page), link, reason: 'page or file does not exist' })
      } else {
        const hash = decodeURIComponent(target.hash.slice(1))
        if (hash !== '' && file.endsWith('.html') && !idsOf(file).has(hash)) {
          broken.push({ page: urlOf(page), link, reason: `anchor #${hash} not found` })
        }
      }
    }
  }
  return { pages: pages.length, checked, broken }
}
