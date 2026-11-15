import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { supportRows, supportTableMarkdown } from '../scripts/lib/support-table.ts'
import type { SupportTable } from '../scripts/lib/versions.ts'
import { supportTable } from './fixtures.ts'

describe('support table', () => {
  it('shows null dates in words and marks the line being read', () => {
    assert.deepEqual(supportRows(supportTable, '0.1'), [
      { version: '0.2', node: '24.3+', release: 'Not released yet', bugFixesUntil: 'Release of the next line', securityUntil: 'Next line’s release + 6 months', status: 'active', statusLabel: 'Bug and security fixes', reading: false },
      { version: '0.1', node: '24+', release: 'Pre-releases only', bugFixesUntil: '—', securityUntil: '—', status: 'eol', statusLabel: 'End of life', reading: true },
    ])
  })

  it('shows real dates once versions.json has them', () => {
    const first = supportTable.lines[0]
    assert.ok(first)
    const released: SupportTable = {
      current: '0.3',
      lines: [
        { ...first, line: '0.3', branch: '0.3.x', docs: '/docs/0.3.x/', released: '2027-04-01' },
        { ...first, released: '2027-01-12', securityUntil: '2027-10-01', status: 'security' },
      ],
    }
    const [, old] = supportRows(released, undefined)
    assert.deepEqual([old?.release, old?.bugFixesUntil, old?.securityUntil, old?.statusLabel], ['2027-01-12', '—', '2027-10-01', 'Security fixes only'])
  })

  it('renders as a Markdown table for the exports', () => {
    const lines = supportTableMarkdown(supportTable, '0.2').split('\n')
    assert.equal(lines[0], '| Version | Node | Release | Bug fixes until | Security fixes until | Status |')
    assert.equal(lines[2], '| **0.2** (you are reading these docs) | 24.3+ | Not released yet | Release of the next line | Next line’s release + 6 months | Bug and security fixes |')
    assert.equal(lines.length, 4)
  })
})
