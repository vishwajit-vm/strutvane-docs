#!/usr/bin/env node
/**
 * Keeps the OLD v1 site's URLs working after the switch to the versioned docs (run by `npm run build`).
 *
 * Until 2026-11-15 this site served the v1 docs at unversioned URLs such as
 * `/strutvane-docs/getting-started/quick-start/`. Those links live on in READMEs, issues and
 * search engines. v1 is now the end-of-life 0.1 line at `/strutvane-docs/docs/0.1.x/`
 * (the original v1 site's source is frozen on the `0.1.x` branch of this repo).
 *
 * Every old URL gets a small redirect page (the same kind the build writes for `/docs/latest/`):
 * - pages that exist in 0.1.x go to that page;
 * - pages the 0.1.x docs didn't keep go to the 0.1.x home, which links to the current docs.
 *
 * Fails closed: a redirect never overwrites a real page, and every destination must have been
 * built (the link checker then checks every redirect page's link too).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSiteLocation } from './lib/build-settings.ts'
import { redirectHtml } from './lib/redirects.ts'

const VERSION = '0.1.x'
const HOME = 'introduction'

/** Old v1 path (relative to the site base) → 0.1.x page slug. */
const MOVED = {
  'getting-started/what-is-strutvane/': 'introduction',
  'getting-started/how-it-works/': 'introduction',
  'getting-started/quick-start/': 'installation',
  'concepts/project-structure/': 'structure',
  'concepts/environment-variables/': 'configuration',
  'concepts/models-and-fields/': 'models-and-fields',
  'concepts/migrations/': 'migrations',
  'reference/cli/': 'cli-reference',
}

/** Old v1 pages with no 0.1.x counterpart: they land on the 0.1.x home. */
const NOT_KEPT = [
  'concepts/auth-and-permissions/',
  'concepts/auto-api/',
  'concepts/levels-of-control/',
  'concepts/multi-tenancy/',
  'concepts/the-ui/',
  'community/contributing/',
  'community/docs-style-guide/',
  'community/faq/',
  'community/roadmap/',
  'packages/overview/',
  'packages/auth/',
  'packages/cli/',
  'packages/contracts/',
  'packages/core/',
  'packages/create-strutvane/',
  'packages/devkit/',
  'packages/framework/',
  'packages/logs/',
  'packages/ui/',
  'reference/glossary/',
  'tutorial/build-a-crm-in-2-hours/',
]

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const { base } = resolveSiteLocation(process.env)

const plan = [...Object.entries(MOVED), ...NOT_KEPT.map((from) => [from, HOME])]
for (const [from, slug] of plan) {
  if (!existsSync(join(dist, 'docs', VERSION, slug, 'index.html'))) {
    throw new Error(`v1 redirect ${from} → docs/${VERSION}/${slug}/: that page was not built. Update scripts/v1-redirects.mjs.`)
  }
  const file = join(dist, from, 'index.html')
  if (existsSync(file)) throw new Error(`Refusing to overwrite ${file} with a v1 redirect: a real page lives there.`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, redirectHtml(`${base}docs/${VERSION}/${slug}/`))
}
process.stdout.write(`✔ Wrote ${plan.length} redirects from old v1 URLs to /docs/${VERSION}/.\n`)
