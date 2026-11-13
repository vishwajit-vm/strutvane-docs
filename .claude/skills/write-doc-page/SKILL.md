---
name: write-doc-page
description: Write or rewrite a Strutvane docs page in the house style (friendly, plain words, an example everywhere, accurate to the blueprint), then verify it builds with zero broken links.
---

# write-doc-page

## Before writing

1. Read `CLAUDE.md` and `src/content/docs/community/docs-style-guide.mdx`.
2. Read the blueprint sections in `../../docs/` that cover the topic. They are the source of truth: never invent behaviour that contradicts them.
3. Look at two existing pages in the same section and match their structure.

## Write

1. Pick the location: the folder path becomes the URL (`concepts/x.mdx` → `/concepts/x/`).
2. Use the template from the style guide:
   - frontmatter (`title`, one-sentence `description`)
   - the "What you'll learn" bullets
   - a "Planned, not available yet" caution aside (while Strutvane is unreleased)
   - a plain explanation, with an analogy if it helps
   - at least one concrete example (code with `title=`, a table, or a scenario)
   - details and options as tables
   - "Next steps" with 2 LinkCards
3. Explain every technical term on first use, or link to `reference/glossary/`. Add missing terms to the glossary.
4. Use relative links only (`../page/`, `../../section/page/`).
5. Add the page to the sidebar in `astro.config.mjs`.

## Verify

1. `corepack pnpm check` must report 0 errors.
2. `corepack pnpm build` must succeed, and the link checker must report all links valid.
3. Read the page out loud. Split any sentence you run out of breath in.
4. Ask the `docs-friendliness-reviewer` agent to review the page, then fix what it finds.
