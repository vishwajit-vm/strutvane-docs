/**
 * `npm run preview`: serves the merged `dist/` exactly as GitHub Pages would.
 *
 * ```bash
 * npm run build && npm run preview   # http://localhost:4321/strutvane-docs/
 * ```
 *
 * Why our own tiny server instead of `astro preview`: the merged site is several Astro builds
 * plus redirect pages, and GitHub Pages rules apply (folders serve `index.html`, unknown paths
 * get `/404.html` with status 404). Only GET/HEAD are served, and only files inside `dist/`.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSiteLocation } from './lib/build-settings.ts'
import { readFlag, runMain } from './lib/cli.ts'
import { DocsBuildError } from './lib/errors.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const distDir = resolve(root, 'dist')

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pf_meta': 'application/octet-stream',
}

/** Maps a URL path to a file in dist/, or undefined when it doesn't exist or escapes dist/. */
function fileFor(pathname: string, base: string): string | undefined {
  if (!pathname.startsWith(base)) return undefined
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname.slice(base.length))
  } catch {
    return undefined
  }
  const candidate = resolve(distDir, decoded)
  if (candidate !== distDir && !candidate.startsWith(distDir + sep)) return undefined
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  const index = join(candidate, 'index.html')
  return existsSync(index) ? index : undefined
}

runMain(async () => {
  if (!existsSync(distDir)) throw new DocsBuildError('dist/ was not found.', 'Build the site first: npm run build')
  const { base } = resolveSiteLocation(process.env)
  const port = Number(readFlag(process.argv.slice(2), 'port') ?? '4321')
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    // Like GitHub Pages: /strutvane-docs (no slash) → /strutvane-docs/
    if (`${url.pathname}/` === base) {
      response.writeHead(301, { Location: base }).end()
      return
    }
    const file = fileFor(url.pathname, base)
    const status = file === undefined ? 404 : 200
    const served = file ?? join(distDir, '404.html')
    response.writeHead(status, { 'Content-Type': TYPES[extname(served)] ?? 'application/octet-stream' })
    if (request.method === 'HEAD') response.end()
    else createReadStream(served).pipe(response)
  })
  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done))
  console.log(`\n  Strutvane docs (all versions): http://localhost:${port}${base}`)
  console.log('  Press Ctrl+C to stop.\n')
})
