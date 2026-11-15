/**
 * Per-page adjustments that depend on the version being built.
 *
 * - "Edit this page" points at the file on the version's own branch (or is hidden for
 *   frozen legacy versions).
 * - The canonical link points at the current version's copy of the page when it exists,
 *   so search engines send readers to up-to-date docs.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data'
import context from 'virtual:strutvane-docs/context'
import { canonicalUrl, editUrl, isContentPage } from '../scripts/lib/site-context.ts'

export const onRequest = defineRouteMiddleware((astro) => {
  const route = astro.locals.starlightRoute
  if (!isContentPage(context, route.id)) return

  const edit = route.entry.filePath === undefined ? undefined : editUrl(context, route.entry.filePath)
  route.editUrl = edit === undefined ? undefined : new URL(edit)

  const canonical = route.head.find((entry) => entry.tag === 'link' && entry.attrs?.['rel'] === 'canonical')
  if (canonical?.attrs !== undefined) canonical.attrs['href'] = canonicalUrl(context, route.id)
})
