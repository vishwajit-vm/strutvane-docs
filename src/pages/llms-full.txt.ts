/**
 * `/docs/<version>/llms-full.txt`: every page of this version in one file, in menu order.
 */
import type { APIRoute } from 'astro'
import { llmsFullTxt } from '../../scripts/lib/markdown-export.ts'
import { docsEntries, docsTitle, entriesInMenuOrder, entryToMarkdown } from '../lib/markdown-pages.ts'

export const GET: APIRoute = async () => {
  const pages = entriesInMenuOrder(await docsEntries()).map(entryToMarkdown)
  return new Response(llmsFullTxt(docsTitle(), pages), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
