/**
 * The `docs` content collection: the Markdown pages of the version being built.
 *
 * Starlight's default loader reads `src/content/docs/`. We point Astro's glob loader at the
 * version's own folder instead (for example `versions/0.2.x/`), so `npm run dev` shows your
 * edits instantly and each version's pages stay exactly where its branch keeps them.
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import { docsSchema } from '@astrojs/starlight/schema'
import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'
import { siteTitle, supportTable, versions } from '../docs.sources.ts'
import { resolveBuildSettings } from '../scripts/lib/build-settings.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const settings = resolveBuildSettings({ root, siteTitle, supportTable, versions, env: process.env })

export const collections = {
  docs: defineCollection({
    // Files starting with "_" are partials, as in Starlight. navigation.json is not a page.
    loader: glob({ base: pathToFileURL(`${settings.contentDir}/`), pattern: '**/[^_]*.{md,mdx}' }),
    schema: docsSchema(),
  }),
}
