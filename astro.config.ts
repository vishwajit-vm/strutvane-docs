/**
 * Astro + Starlight configuration for ONE version (one branch) of the docs.
 *
 * Which version gets built is chosen by the `DOCS_VERSION` environment variable (default:
 * the current line). `npm run build` runs this once per version and merges the results;
 * see scripts/build.ts.
 *
 * Each version is served under its own base path, `{base}docs/{branch}/`, so each one gets
 * its own sidebar, its own Pagefind search index (search is scoped to the version you read)
 * and its own sitemap, and an end-of-life version keeps working after the shell moves on.
 */
import { fileURLToPath } from 'node:url'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import type { Plugin } from 'vite'
import { repositoryUrl, siteTitle, supportTable, versions } from './docs.sources.ts'
import { resolveBuildSettings } from './scripts/lib/build-settings.ts'
import type { SiteContext } from './scripts/lib/site-context.ts'

const root = fileURLToPath(new URL('.', import.meta.url))
const settings = resolveBuildSettings({ root, siteTitle, supportTable, versions, env: process.env })

/**
 * Exposes the site context to components as `virtual:strutvane-docs/context`.
 *
 * Why a virtual module: components need data about *other* versions (which pages exist where,
 * the support table) that isn't in this version's content. A virtual module hands it over at
 * build time, with no generated files and no fetching in the browser.
 */
function siteContextModule(context: SiteContext): Plugin {
  const id = 'virtual:strutvane-docs/context'
  const resolved = `\0${id}`
  return {
    name: 'strutvane-docs-context',
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (loadedId) => (loadedId === resolved ? `export default ${JSON.stringify(context)}` : undefined),
  }
}

export default defineConfig({
  site: settings.location.site,
  base: `${settings.location.base}docs/${settings.version.id}`,
  trailingSlash: 'always',
  outDir: settings.outDir,
  cacheDir: settings.cacheDir,
  vite: {
    plugins: [siteContextModule(settings.context)],
    // Lets MDX pages use shell components without fragile relative paths:
    // import SupportTable from '@docs-components/SupportTable.astro'
    resolve: { alias: { '@docs-components': fileURLToPath(new URL('./src/components', import.meta.url)) } },
  },
  integrations: [
    starlight({
      title: siteTitle,
      description: 'The friendly guide to Strutvane, the TypeScript framework that follows Laravel’s flow.',
      logo: { src: './src/assets/logo.svg', alt: 'Strutvane logo' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: repositoryUrl }],
      // Open-licensed fonts (SIL OFL), self-hosted: no third-party request from readers' browsers.
      customCss: ['@fontsource-variable/inter', '@fontsource-variable/jetbrains-mono', './src/styles/docs.css'],
      sidebar: settings.sidebar,
      // Content lives outside src/content/docs, so tell Starlight to run its Markdown
      // features (asides, heading anchors) on that folder too.
      markdown: { processedDirs: [settings.contentDir] },
      routeMiddleware: './src/route-middleware.ts',
      components: {
        Banner: './src/components/Banner.astro',
        Header: './src/components/Header.astro',
        PageSidebar: './src/components/PageSidebar.astro',
        PageTitle: './src/components/PageTitle.astro',
        Sidebar: './src/components/Sidebar.astro',
      },
      // Code blocks: copy button and file-name tabs (```ts title="app/models/post.ts") are built in.
      // Their look (radius, fonts, borders) is tuned in src/styles/docs.css through Expressive Code's
      // CSS variables, next to the rest of the theme.
      expressiveCode: { themes: ['github-dark', 'github-light'] },
    }),
  ],
})
