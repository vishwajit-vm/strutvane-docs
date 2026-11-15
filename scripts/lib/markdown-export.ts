/**
 * Plain-Markdown exports of the docs, for "Copy as Markdown" and for AI tools.
 *
 * Laravel's docs have a "Copy as markdown" button, and many sites now publish `llms.txt`
 * (an index for language models, see https://llmstxt.org) and `llms-full.txt` (every page in
 * one file). We do all three, per version:
 *
 * ```text
 * /docs/0.2.x/installation.md   one page as clean Markdown
 * /docs/0.2.x/llms.txt          the menu, as Markdown links to those .md files
 * /docs/0.2.x/llms-full.txt     every page, in menu order
 * ```
 *
 * The exports must read well without the site's components, so MDX components are turned
 * into their plain-Markdown meaning (tabs become bold labels, asides become quotes,
 * link cards become list items) and relative links become absolute.
 */

/** One page to export. */
export interface ExportPage {
  readonly title: string
  readonly description?: string | undefined
  /** The page source without front matter (Astro's `entry.body`). */
  readonly body: string
  /** The page's absolute URL; relative links are resolved against it. */
  readonly url: string
  /** `true` for `.mdx` files: import lines and component tags are rewritten. */
  readonly isMdx: boolean
  /**
   * Markdown to use in place of self-closing components that render data, for example
   * `{ SupportTable: '| Version | … |' }` for `<SupportTable />`.
   */
  readonly components?: Readonly<Record<string, string>> | undefined
}

const ASIDE_TITLES: Readonly<Record<string, string>> = { note: 'Note', tip: 'Tip', caution: 'Caution', danger: 'Danger' }

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
  return match?.[1]
}

function absolutize(link: string, pageUrl: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(link)) return link
  return new URL(link, pageUrl).href
}

/** Rewrites `[text](relative)` links to absolute URLs (outside inline code is good enough for docs). */
function absolutizeLinks(line: string, pageUrl: string): string {
  return line.replace(/\]\(([^)\s]+)\)/g, (_whole, link: string) => `](${absolutize(link, pageUrl)})`)
}

/**
 * Converts one page to clean, standalone Markdown.
 *
 * What changes (outside code blocks only; code is never touched):
 * - `:::note[Title] … :::` and `<Aside title="…">…</Aside>` become `> **Title**` quotes;
 * - MDX `import` lines are removed; `<TabItem label="Windows">` becomes `**Windows**`;
 *   `<LinkCard title href description />` becomes a list item; other component tags are dropped
 *   but their content is kept;
 * - relative links become absolute, so the file still works when pasted elsewhere.
 *
 * @example
 * ```ts
 * toPlainMarkdown({ title: 'Seeding', body: ':::tip\nRun it twice.\n:::', url: 'https://x.dev/docs/0.2.x/seeding/', isMdx: false })
 * // '# Seeding\n\nSource: https://x.dev/docs/0.2.x/seeding/\n\n> **Tip**\n> Run it twice.\n'
 * ```
 */
export function toPlainMarkdown(page: ExportPage): string {
  const out: string[] = []
  let fence: string | undefined
  let quoting = false
  const emit = (line: string): void => {
    out.push(quoting ? (line.trim() === '' ? '>' : `> ${line}`) : line)
  }

  for (const line of page.body.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim()
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed)
    if (fence !== undefined) {
      emit(line)
      if (fenceMatch !== null && fenceMatch[1]?.[0] === fence[0] && (fenceMatch[1]?.length ?? 0) >= fence.length) fence = undefined
      continue
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1]
      emit(line)
      continue
    }

    // Starlight Markdown asides: :::tip[Optional title] … :::
    const asideStart = /^:::(note|tip|caution|danger)(?:\[(.*)\])?\s*$/.exec(trimmed)
    if (asideStart !== null) {
      const type = asideStart[1] ?? 'note'
      emit('')
      quoting = true
      emit(`**${asideStart[2] ?? ASIDE_TITLES[type] ?? 'Note'}**`)
      continue
    }
    if (trimmed === ':::' && quoting) {
      quoting = false
      emit('')
      continue
    }

    if (page.isMdx) {
      if (/^import\s.+\sfrom\s+['"][^'"]+['"];?$/.test(trimmed)) continue
      if (/^<Aside\b/.test(trimmed)) {
        const type = attribute(trimmed, 'type') ?? 'note'
        emit('')
        quoting = true
        emit(`**${attribute(trimmed, 'title') ?? ASIDE_TITLES[type] ?? 'Note'}**`)
        continue
      }
      if (/^<\/Aside>$/.test(trimmed)) {
        quoting = false
        emit('')
        continue
      }
      const indent = /^\s*/.exec(line)?.[0] ?? ''
      if (/^<TabItem\b/.test(trimmed)) {
        emit(`${indent}**${attribute(trimmed, 'label') ?? 'Option'}**`)
        emit('')
        continue
      }
      if (/^<LinkCard\b/.test(trimmed)) {
        const href = attribute(trimmed, 'href') ?? ''
        const description = attribute(trimmed, 'description')
        emit(`${indent}- [${attribute(trimmed, 'title') ?? href}](${absolutize(href, page.url)})${description === undefined ? '' : `: ${description}`}`)
        continue
      }
      if (/^<Card\b/.test(trimmed)) {
        emit(`${indent}**${attribute(trimmed, 'title') ?? ''}**`)
        continue
      }
      // Data components (<SupportTable />) become the Markdown the caller provides.
      const selfClosing = /^<([A-Z][A-Za-z]*)\b[^>]*\/>$/.exec(trimmed)
      const replacement = selfClosing === null ? undefined : page.components?.[selfClosing[1] ?? '']
      if (replacement !== undefined) {
        for (const replacementLine of replacement.split('\n')) emit(replacementLine)
        continue
      }
      // Any other line that is only a component tag (<Steps>, </Tabs>, <CardGrid>, <Badge … />).
      if (/^<\/?[A-Z][A-Za-z]*\b[^>]*>$/.test(trimmed)) continue
    }
    emit(absolutizeLinks(line, page.url))
  }

  const header = [`# ${page.title}`, '']
  if (page.description !== undefined && page.description !== '') header.push(`> ${page.description}`, '')
  header.push(`Source: ${page.url}`, '')
  return `${[...header, ...out].join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/** One menu group for {@link llmsTxt}. */
export interface LlmsGroup {
  readonly label: string
  readonly pages: ReadonlyArray<{ readonly title: string; readonly description?: string | undefined; readonly markdownUrl: string }>
}

/**
 * The `llms.txt` index of one version: a title, a one-line summary, then the menu as links
 * to the Markdown exports (the format proposed at https://llmstxt.org).
 *
 * @example
 * ```ts
 * llmsTxt('Strutvane 0.2 documentation', 'The TypeScript framework that copies Laravel’s flow.', groups)
 * ```
 */
export function llmsTxt(title: string, summary: string, groups: readonly LlmsGroup[]): string {
  const lines = [`# ${title}`, '', `> ${summary}`, '']
  for (const group of groups) {
    lines.push(`## ${group.label}`, '')
    for (const page of group.pages) {
      lines.push(`- [${page.title}](${page.markdownUrl})${page.description ? `: ${page.description}` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * `llms-full.txt`: every exported page of one version, in menu order, separated by rules.
 *
 * @example
 * ```ts
 * llmsFullTxt('Strutvane 0.2 documentation', pages.map(toPlainMarkdown))
 * ```
 */
export function llmsFullTxt(title: string, pages: readonly string[]): string {
  return `# ${title}\n\n${pages.map((page) => page.trim()).join('\n\n---\n\n')}\n`
}
