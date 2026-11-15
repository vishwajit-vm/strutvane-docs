import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { notFoundRescueScript, planRedirects, redirectHtml } from '../scripts/lib/redirects.ts'
import { manifest } from './fixtures.ts'

describe('planRedirects', () => {
  const redirects = new Map(planRedirects(manifest()).map((r) => [r.from, r.to]))

  it('sends the site root, /docs/ and /docs/latest/ to the current home page', () => {
    for (const from of ['', 'docs/', 'docs/latest/']) assert.equal(redirects.get(from), '/strutvane-docs/docs/0.2.x/introduction/')
  })

  it('maps /docs/latest/<page>/ and /docs/<page>/ to the current version, for every current page', () => {
    for (const slug of manifest().versions[0]?.pages ?? []) {
      assert.equal(redirects.get(`docs/latest/${slug}/`), `/strutvane-docs/docs/0.2.x/${slug}/`)
      assert.equal(redirects.get(`docs/${slug}/`), `/strutvane-docs/docs/0.2.x/${slug}/`)
    }
  })

  it('sends /docs/<version>/ to that version’s home', () => {
    assert.equal(redirects.get('docs/0.1.x/'), '/strutvane-docs/docs/0.1.x/introduction/')
  })

  it('never lets a page shortcut hide a version folder or latest', () => {
    const versions = manifest().versions.map((v) => (v.role === 'current' ? { ...v, pages: [...v.pages, 'latest', '0.1.x'] } : v))
    const plan = planRedirects(manifest({ versions }))
    assert.equal(plan.filter((r) => r.from === 'docs/0.1.x/').length, 1)
    assert.equal(plan.find((r) => r.from === 'docs/0.1.x/')?.to, '/strutvane-docs/docs/0.1.x/introduction/')
    assert.equal(plan.filter((r) => r.from === 'docs/latest/').length, 1)
  })
})

describe('redirect pages', () => {
  it('forward with JavaScript (keeping #anchors), meta refresh and a visible link, and are not indexed', () => {
    const html = redirectHtml('/strutvane-docs/docs/0.2.x/installation/')
    assert.match(html, /location\.replace\("\/strutvane-docs\/docs\/0\.2\.x\/installation\/" \+ location\.search \+ location\.hash\)/)
    assert.match(html, /<meta http-equiv="refresh" content="0; url=\/strutvane-docs\/docs\/0\.2\.x\/installation\/">/)
    assert.match(html, /<a href="\/strutvane-docs\/docs\/0\.2\.x\/installation\/">/)
    assert.match(html, /<meta name="robots" content="noindex">/)
  })

  it('escapes the target', () => {
    const html = redirectHtml('/a"><script>alert(1)</script>')
    assert.ok(!html.includes('"><script>alert'))
  })

  it('the 404 rescue script rewrites /docs/latest/ to the current version', () => {
    assert.match(notFoundRescueScript(manifest()), /"\/strutvane-docs\/docs\/latest\/".*"\/strutvane-docs\/docs\/0\.2\.x\/"/)
  })
})
