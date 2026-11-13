// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';

/**
 * Where the site is published.
 *
 * - Today: a GitHub Pages "project site" at https://vishwajit-vm.github.io/strutvane-docs/
 * - Later: a custom domain (for example https://strutvane.dev). Then build with
 *   DOCS_SITE=https://strutvane.dev DOCS_BASE=/ and nothing else needs to change,
 *   because every link inside the content is written as a relative link.
 */
const site = process.env.DOCS_SITE ?? 'https://vishwajit-vm.github.io';
const base = process.env.DOCS_BASE ?? '/strutvane-docs';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Strutvane',
      description: 'Declare the model. Ship the app. A friendly guide to Strutvane, the TypeScript framework for enterprise B2B apps.',
      logo: { src: './src/assets/logo.svg', alt: 'Strutvane logo' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/vishwajit-vm/strutvane' }],
      editLink: { baseUrl: 'https://github.com/vishwajit-vm/strutvane-docs/edit/main/' },
      customCss: ['./src/styles/custom.css'],
      lastUpdated: true,
      plugins: [
        // Fails the build if any internal link or #anchor points nowhere.
        starlightLinksValidator({ errorOnRelativeLinks: false }),
      ],
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { label: 'What is Strutvane?', slug: 'getting-started/what-is-strutvane' },
            { label: 'How it works', slug: 'getting-started/how-it-works' },
            { label: 'Quick start', slug: 'getting-started/quick-start' },
          ],
        },
        {
          label: 'Tutorial',
          items: [{ label: 'Build a CRM in 2 hours', slug: 'tutorial/build-a-crm-in-2-hours' }],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Models and fields', slug: 'concepts/models-and-fields' },
            { label: 'Migrations', slug: 'concepts/migrations' },
            { label: 'The automatic API', slug: 'concepts/auto-api' },
            { label: 'Auth and permissions', slug: 'concepts/auth-and-permissions' },
            { label: 'Multi-tenancy', slug: 'concepts/multi-tenancy' },
            { label: 'The UI', slug: 'concepts/the-ui' },
            { label: 'Levels of control', slug: 'concepts/levels-of-control' },
            { label: 'Project structure', slug: 'concepts/project-structure' },
            { label: 'Environment variables', slug: 'concepts/environment-variables' },
          ],
        },
        {
          label: 'Packages',
          items: [
            { label: 'Overview', slug: 'packages/overview' },
            { label: '@strutvane/framework', slug: 'packages/framework' },
            { label: '@strutvane/auth', slug: 'packages/auth' },
            { label: '@strutvane/ui', slug: 'packages/ui' },
            { label: '@strutvane/logs', slug: 'packages/logs' },
            { label: 'strutvane (CLI)', slug: 'packages/cli' },
            { label: 'create-strutvane', slug: 'packages/create-strutvane' },
            { label: '@strutvane/core', slug: 'packages/core' },
            { label: '@strutvane/contracts', slug: 'packages/contracts' },
            { label: '@strutvane/devkit', slug: 'packages/devkit' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'CLI commands', slug: 'reference/cli' },
            { label: 'Glossary', slug: 'reference/glossary' },
          ],
        },
        {
          label: 'Community',
          items: [
            { label: 'Roadmap', slug: 'community/roadmap' },
            { label: 'FAQ', slug: 'community/faq' },
            { label: 'Contributing', slug: 'community/contributing' },
            { label: 'Docs style guide', slug: 'community/docs-style-guide' },
          ],
        },
      ],
    }),
  ],
});
