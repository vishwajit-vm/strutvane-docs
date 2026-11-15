/**
 * `/docs/<version>/llms.txt`: the menu of this version as Markdown links (https://llmstxt.org).
 */
import type { APIRoute } from 'astro'
import { llmsTxt } from '../../scripts/lib/markdown-export.ts'
import { docsEntries, docsTitle, llmsGroups } from '../lib/markdown-pages.ts'

export const GET: APIRoute = async () => {
  const summary = 'Strutvane is a TypeScript framework that follows Laravel’s flow: npm only, MVC, migrations as the source of truth, and an automatic CRUD API and admin UI.'
  return new Response(llmsTxt(docsTitle(), summary, llmsGroups(await docsEntries())), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
