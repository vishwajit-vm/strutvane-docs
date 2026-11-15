/**
 * Glue between Astro's content collection and the pure Markdown-export functions.
 * Used by the `.md`, `llms.txt` and `llms-full.txt` endpoints in `src/pages/`.
 */
import { getCollection, type CollectionEntry } from 'astro:content'
import context from 'virtual:strutvane-docs/context'
import { toPlainMarkdown, type LlmsGroup } from '../../scripts/lib/markdown-export.ts'
import { absoluteUrl, markdownPath, pagePath } from '../../scripts/lib/paths.ts'
import { buildingVersion } from '../../scripts/lib/site-context.ts'
import { packagesMarkdown } from '../../scripts/lib/packages-data.ts'
import { releaseLinesMarkdown, supportTableMarkdown } from '../../scripts/lib/support-table.ts'
import { packagesData } from './packages.ts'

/** One docs page from the collection. */
export type DocsEntry = CollectionEntry<'docs'>

/** All pages of the version being built. */
export async function docsEntries(): Promise<DocsEntry[]> {
  return getCollection('docs')
}

/** "Strutvane 0.2 documentation" (or "Strutvane main documentation"). */
export function docsTitle(): string {
  return `${context.siteTitle} ${buildingVersion(context).line} documentation`
}

/**
 * One page as clean Markdown, with data components (the support table, the release lines and
 * the package catalogue) filled in.
 *
 * @example
 * ```ts
 * entryToMarkdown(entry) // '# Installation\n\n> …\n\nSource: https://…/docs/0.2.x/installation/\n…'
 * ```
 */
export function entryToMarkdown(entry: DocsEntry): string {
  return toPlainMarkdown({
    title: entry.data.title,
    description: entry.data.description,
    body: entry.body ?? '',
    url: absoluteUrl(context.site, pagePath(context.base, context.building, entry.id)),
    isMdx: entry.filePath?.endsWith('.mdx') ?? false,
    components: {
      SupportTable: supportTableMarkdown(context.supportTable, buildingVersion(context).line),
      ReleaseLines: releaseLinesMarkdown(context.supportTable),
      PackageCatalogue: packagesMarkdown(packagesData, (slug) => absoluteUrl(context.site, pagePath(context.base, context.building, slug))),
    },
  })
}

/**
 * The menu as `llms.txt` groups, in navigation order, linking to the `.md` exports.
 *
 * @example
 * ```ts
 * llmsGroups(await docsEntries())[0].label // 'Prologue'
 * ```
 */
export function llmsGroups(entries: readonly DocsEntry[]): LlmsGroup[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return context.navigation.groups.map((group) => ({
    label: group.label,
    pages: group.items.flatMap((item) => {
      const entry = byId.get(item.slug)
      if (entry === undefined) return []
      return [{
        title: entry.data.title,
        description: entry.data.description,
        markdownUrl: absoluteUrl(context.site, markdownPath(context.base, context.building, entry.id)),
      }]
    }),
  }))
}

/** Entries in navigation order (for `llms-full.txt`). */
export function entriesInMenuOrder(entries: readonly DocsEntry[]): DocsEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return context.navigation.groups.flatMap((group) => group.items.flatMap((item) => byId.get(item.slug) ?? []))
}
