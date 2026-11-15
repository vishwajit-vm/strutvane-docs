/**
 * URL helpers shared by the build scripts and the site components.
 *
 * The whole URL scheme lives here, so it is defined exactly once:
 *
 * ```text
 * {base}docs/{version}/{page}/      a page of one version         /strutvane-docs/docs/0.2.x/installation/
 * {base}docs/{version}/{page}.md    the same page as Markdown     /strutvane-docs/docs/0.2.x/installation.md
 * {base}docs/latest/{page}/         redirect to the current version
 * {base}docs/{page}/                redirect to the current version (like laravel.com/docs/installation)
 * ```
 *
 * `base` is `/strutvane-docs/` on GitHub Pages today and `/` on a future custom domain.
 */

/** The reserved version id that always points at the current version. */
export const LATEST = 'latest'

/**
 * Normalises a base path to exactly one leading and one trailing slash.
 *
 * Why: people write `strutvane-docs`, `/strutvane-docs` or `/strutvane-docs/` in env
 * variables; joining URLs is only safe when the shape is always the same.
 *
 * @example
 * ```ts
 * normalizeBase('strutvane-docs') // '/strutvane-docs/'
 * normalizeBase('/')              // '/'
 * ```
 */
export function normalizeBase(base: string): string {
  const trimmed = base.trim().replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? '/' : `/${trimmed}/`
}

/**
 * The URL path where one version of the docs is served.
 *
 * @example
 * ```ts
 * versionPath('/strutvane-docs/', '0.2.x') // '/strutvane-docs/docs/0.2.x/'
 * ```
 */
export function versionPath(base: string, versionId: string): string {
  return `${normalizeBase(base)}docs/${versionId}/`
}

/**
 * The URL path of one page of one version (always with a trailing slash, as the site is
 * built with `trailingSlash: 'always'`).
 *
 * @example
 * ```ts
 * pagePath('/strutvane-docs/', '0.2.x', 'installation') // '/strutvane-docs/docs/0.2.x/installation/'
 * ```
 */
export function pagePath(base: string, versionId: string, slug: string): string {
  return `${versionPath(base, versionId)}${slug}/`
}

/**
 * The URL path of a page's Markdown export (used by "Copy as Markdown" and `llms.txt`).
 *
 * @example
 * ```ts
 * markdownPath('/strutvane-docs/', '0.2.x', 'installation') // '/strutvane-docs/docs/0.2.x/installation.md'
 * ```
 */
export function markdownPath(base: string, versionId: string, slug: string): string {
  return `${versionPath(base, versionId)}${slug}.md`
}

/**
 * Joins the site origin and a URL path into an absolute URL.
 *
 * Why: canonical links, `llms.txt` and Markdown exports are read outside the site (by
 * search engines and AI tools), so they need full URLs, not paths.
 *
 * @example
 * ```ts
 * absoluteUrl('https://vishwajit-vm.github.io', '/strutvane-docs/docs/0.2.x/') // 'https://vishwajit-vm.github.io/strutvane-docs/docs/0.2.x/'
 * ```
 */
export function absoluteUrl(site: string, path: string): string {
  return new URL(path, site.endsWith('/') ? site : `${site}/`).href
}

/**
 * Converts an OS path to forward slashes.
 *
 * Why: on Windows `path.relative()` returns back slashes, but URLs and git paths need `/`.
 *
 * @example
 * ```ts
 * toPosix('versions\\0.2.x\\installation.md') // 'versions/0.2.x/installation.md'
 * ```
 */
export function toPosix(path: string): string {
  return path.split('\\').join('/')
}
