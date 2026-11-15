import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { checkLinks } from '../scripts/lib/link-checker.ts'

const dist = mkdtempSync(join(tmpdir(), 'strutvane-docs-links-'))
after(() => rmSync(dist, { recursive: true, force: true }))

function page(path: string, html: string): void {
  const file = join(dist, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, html)
}

page('docs/0.2.x/a/index.html', `
  <h2 id="ok">OK</h2>
  <a href="../b/">fine</a>
  <a href="../b/#there">fine anchor</a>
  <a href="../b/#nowhere">bad anchor</a>
  <a href="../missing/">bad page</a>
  <a href="/strutvane-docs/docs/0.2.x/a.md">markdown export</a>
  <a href="https://example.com/">external</a>
  <a href="/elsewhere/">outside base</a>
  <select><option value="/strutvane-docs/docs/0.1.x/a/">0.1</option><option value="/strutvane-docs/docs/0.1.x/gone/">bad switcher target</option></select>
  <pre><code>&lt;script src="/build/app.js"&gt; is example code, not a link</code></pre>`)
page('docs/0.2.x/a.md', '# A')
page('docs/0.2.x/b/index.html', '<h2 id="there">There</h2>')
page('docs/0.1.x/a/index.html', '<p>old</p>')

describe('checkLinks', () => {
  it('finds broken pages, anchors, switcher targets and links outside the base, and skips external links', () => {
    const report = checkLinks(dist, '/strutvane-docs/')
    assert.deepEqual(report.broken.map((b) => [b.link, b.reason]).sort(), [
      ['../b/#nowhere', 'anchor #nowhere not found'],
      ['../missing/', 'page or file does not exist'],
      ['/elsewhere/', 'outside the site base "/strutvane-docs/"'],
      ['/strutvane-docs/docs/0.1.x/gone/', 'page or file does not exist'],
    ])
    assert.equal(report.pages, 3)
    assert.equal(report.checked, 8)
  })
})
