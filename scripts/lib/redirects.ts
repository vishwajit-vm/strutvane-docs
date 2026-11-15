/**
 * Redirects for a static host.
 *
 * GitHub Pages can't send real HTTP redirects, so every short URL gets a tiny HTML page that
 * forwards the browser (JavaScript first, so the `#section` part survives; `<meta refresh>`
 * as the no-JavaScript fallback; a visible link as the last resort). Planned redirects:
 *
 * ```text
 * {base}                         → current home      (/strutvane-docs/ → /strutvane-docs/docs/0.2.x/introduction/)
 * {base}docs/                    → current home
 * {base}docs/latest/             → current home
 * {base}docs/latest/{page}/      → current {page}    (stable links for READMEs and blog posts)
 * {base}docs/{page}/             → current {page}    (like laravel.com/docs/installation)
 * {base}docs/{version}/          → that version's home
 * ```
 */
import { LATEST, normalizeBase, pagePath, versionPath } from './paths.ts'
import type { SiteManifest, VersionSummary } from './site-context.ts'

/** One redirect: a folder inside the built site and where it sends readers. */
export interface Redirect {
  /** Path relative to the site root, ending in `/` (`''` is the site root). */
  readonly from: string
  /** Absolute URL path of the destination. */
  readonly to: string
}

/**
 * Plans every redirect for the merged site.
 *
 * Unversioned page shortcuts (`/docs/{page}/`) are skipped when the page slug equals a version
 * id or `latest`, so a shortcut can never hide a real version folder.
 *
 * @example
 * ```ts
 * planRedirects(context).find((r) => r.from === 'docs/latest/installation/')
 * // { from: 'docs/latest/installation/', to: '/strutvane-docs/docs/0.2.x/installation/' }
 * ```
 */
export function planRedirects(context: SiteManifest): Redirect[] {
  const base = normalizeBase(context.base)
  const current = currentOf(context)
  const currentHome = pagePath(base, current.id, current.home)
  const reserved = new Set([LATEST, ...context.versions.map((version) => version.id)])

  const redirects: Redirect[] = [
    { from: '', to: currentHome },
    { from: 'docs/', to: currentHome },
    { from: `docs/${LATEST}/`, to: currentHome },
  ]
  for (const slug of current.pages) {
    redirects.push({ from: `docs/${LATEST}/${slug}/`, to: pagePath(base, current.id, slug) })
    if (!reserved.has(slug.split('/')[0] ?? slug)) redirects.push({ from: `docs/${slug}/`, to: pagePath(base, current.id, slug) })
  }
  for (const version of context.versions) {
    redirects.push({ from: `docs/${version.id}/`, to: pagePath(base, version.id, version.home) })
  }
  return redirects
}

/** The current version of a manifest. */
function currentOf(context: SiteManifest): VersionSummary {
  const current = context.versions.find((version) => version.role === 'current')
  if (current === undefined) throw new Error('The site manifest has no current version.')
  return current
}

/**
 * A JavaScript string literal that is safe inside an inline `<script>`.
 * Why: `JSON.stringify` doesn't escape `<`, so a value containing `</script>` would end the
 * script early. Escaping `<` as `<` keeps the value identical for JavaScript.
 */
function scriptString(text: string): string {
  return JSON.stringify(text).replaceAll('<', '\\u003c')
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * The HTML of one redirect page.
 *
 * Why `noindex` plus `canonical`: search engines should index the destination, never the
 * shortcut. Why `location.replace`: the shortcut doesn't pollute the Back button.
 *
 * @example
 * ```ts
 * writeFileSync('dist/docs/latest/index.html', redirectHtml('/strutvane-docs/docs/0.2.x/introduction/'))
 * ```
 */
export function redirectHtml(to: string): string {
  const safe = escapeHtml(to)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting…</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${safe}">
<script>location.replace(${scriptString(to)} + location.search + location.hash)</script>
<meta http-equiv="refresh" content="0; url=${safe}">
</head>
<body>
<p>This page has moved to <a href="${safe}">${safe}</a>.</p>
</body>
</html>
`
}

/**
 * A small script for the site-wide 404 page that rescues `/docs/latest/…` links to pages
 * that were never planned as redirects (for example a page added after the link was shared),
 * and old-style links without a version.
 *
 * @example
 * ```ts
 * html.replace('</head>', `<script>${notFoundRescueScript(context)}</script></head>`)
 * ```
 */
export function notFoundRescueScript(context: SiteManifest): string {
  const latestPrefix = `${versionPath(context.base, LATEST)}`
  const currentPrefix = versionPath(context.base, currentOf(context).id)
  // Only rewrites the version segment; if the page doesn't exist there either, the reader
  // lands on that version's 404 page, which has the full menu and search.
  return `(function(){var p=location.pathname,l=${scriptString(latestPrefix)};if(p.indexOf(l)===0){location.replace(${scriptString(currentPrefix)}+p.slice(l.length)+location.search+location.hash)}})()`
}
