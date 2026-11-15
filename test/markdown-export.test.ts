import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { llmsFullTxt, llmsTxt, toPlainMarkdown } from '../scripts/lib/markdown-export.ts'

const url = 'https://docs.test/docs/0.2.x/installation/'

describe('toPlainMarkdown', () => {
  it('adds a title, description and source line', () => {
    assert.equal(
      toPlainMarkdown({ title: 'Seeding', description: 'Fill tables.', body: 'Hello.', url, isMdx: false }),
      '# Seeding\n\n> Fill tables.\n\nSource: https://docs.test/docs/0.2.x/installation/\n\nHello.\n',
    )
  })

  it('turns Starlight asides into quotes', () => {
    const out = toPlainMarkdown({ title: 'T', body: ':::tip[Teams on MySQL]\nOne line.\n\nTwo.\n:::\nAfter.', url, isMdx: false })
    assert.match(out, /> \*\*Teams on MySQL\*\*\n> One line\.\n>\n> Two\.\n\nAfter\./)
    assert.match(toPlainMarkdown({ title: 'T', body: ':::danger\nNo.\n:::', url, isMdx: false }), /> \*\*Danger\*\*/)
  })

  it('rewrites MDX components and drops imports, keeping their content', () => {
    const body = [
      "import { Tabs, TabItem } from '@astrojs/starlight/components'",
      '',
      '<Tabs syncKey="os">',
      '  <TabItem label="Windows (PowerShell)">',
      'Use npm.cmd.',
      '  </TabItem>',
      '</Tabs>',
      '<Aside type="caution" title="Careful">',
      'Read this.',
      '</Aside>',
      '<LinkCard title="Next" description="Go on." href="../first-crud/" />',
      '<SupportTable />',
    ].join('\n')
    const out = toPlainMarkdown({ title: 'T', body, url, isMdx: true, components: { SupportTable: '| a |\n|---|' } })
    assert.ok(!out.includes('import '))
    assert.ok(!out.includes('<Tabs') && !out.includes('</TabItem>'))
    assert.match(out, /\*\*Windows \(PowerShell\)\*\*\n\nUse npm\.cmd\./)
    assert.match(out, /> \*\*Careful\*\*\n> Read this\./)
    assert.match(out, /- \[Next\]\(https:\/\/docs\.test\/docs\/0\.2\.x\/first-crud\/\): Go on\./)
    assert.match(out, /\| a \|\n\|---\|/)
  })

  it('makes relative links absolute but leaves code blocks untouched', () => {
    const body = 'See [Migrations](../migrations/#columns) and [Node](https://nodejs.org).\n\n```md\n[keep](../as-is/)\n:::tip\n```'
    const out = toPlainMarkdown({ title: 'T', body, url, isMdx: false })
    assert.match(out, /\[Migrations\]\(https:\/\/docs\.test\/docs\/0\.2\.x\/migrations\/#columns\)/)
    assert.match(out, /\[Node\]\(https:\/\/nodejs\.org\)/)
    assert.match(out, /```md\n\[keep\]\(\.\.\/as-is\/\)\n:::tip\n```/)
  })

  it('does not treat component-like lines as components in plain .md files', () => {
    assert.match(toPlainMarkdown({ title: 'T', body: '<Steps>', url, isMdx: false }), /<Steps>/)
  })
})

describe('llms.txt', () => {
  it('lists the menu as links to the Markdown exports', () => {
    const out = llmsTxt('Strutvane 0.2 documentation', 'A framework.', [
      { label: 'Getting Started', pages: [{ title: 'Installation', description: 'Create an app.', markdownUrl: 'https://docs.test/docs/0.2.x/installation.md' }] },
    ])
    assert.equal(out, '# Strutvane 0.2 documentation\n\n> A framework.\n\n## Getting Started\n\n- [Installation](https://docs.test/docs/0.2.x/installation.md): Create an app.\n')
  })

  it('llms-full.txt joins pages with rules', () => {
    assert.equal(llmsFullTxt('Docs', ['# A\n', '# B\n']), '# Docs\n\n# A\n\n---\n\n# B\n')
  })
})
