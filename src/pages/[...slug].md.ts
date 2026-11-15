/**
 * `/docs/<version>/<page>.md`: every page as plain Markdown ("Copy as Markdown", AI tools).
 */
import type { APIRoute, GetStaticPaths } from 'astro'
import { docsEntries, entryToMarkdown, type DocsEntry } from '../lib/markdown-pages.ts'

export const getStaticPaths = (async () => {
  const entries = await docsEntries()
  return entries.map((entry) => ({ params: { slug: entry.id }, props: { entry } }))
}) satisfies GetStaticPaths

export const GET: APIRoute<{ entry: DocsEntry }> = ({ props }) =>
  new Response(entryToMarkdown(props.entry), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
