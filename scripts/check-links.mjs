#!/usr/bin/env node
/**
 * Post-build link checker for the Strutvane docs.
 *
 * Why: content uses RELATIVE links (so the site works under any base path),
 * and starlight-links-validator does not verify relative links. This script
 * checks the final HTML in dist/, which is what readers actually get.
 *
 * It verifies, for every <a href> and src/href asset on every page:
 *   - internal page links resolve to an existing dist file (dir/index.html or file)
 *   - #anchors exist on the target page (id="..." or name="...")
 * External links (http:, https:, mailto:, etc.) are skipped: they are not under our control
 * and checking them in CI makes builds flaky.
 *
 * Usage: node scripts/check-links.mjs [distDir] [basePath]
 * Exit code 1 if any broken link is found.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const distDir = process.argv[2] ?? 'dist';
const base = normalizeBase(process.argv[3] ?? process.env.DOCS_BASE ?? '/strutvane-docs');

function normalizeBase(b) {
  if (!b || b === '/') return '/';
  return `/${b.replace(/^\/+|\/+$/g, '')}/`;
}

/** Recursively list all .html files under dir. */
function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** The public URL path of a dist file, e.g. dist/concepts/x/index.html -> /strutvane-docs/concepts/x/ */
function urlOf(file) {
  let rel = relative(distDir, file).split(sep).join('/');
  rel = rel.endsWith('index.html') ? rel.slice(0, -'index.html'.length) : rel;
  return base + rel;
}

/** Map a URL path (already resolved, absolute) to a dist file, or null if outside the site. */
function fileOf(pathname) {
  if (!pathname.startsWith(base)) return null;
  const rel = decodeURIComponent(pathname.slice(base.length));
  const direct = join(distDir, rel);
  if (rel === '' || rel.endsWith('/')) return join(direct, 'index.html');
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  return join(direct, 'index.html');
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    const ids = new Set();
    for (const m of html.matchAll(/\s(?:id|name)="([^"]+)"/g)) ids.add(m[1]);
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

if (!existsSync(distDir)) {
  console.error(`✘ ${distDir}/ not found. Run the build first.`);
  process.exit(1);
}

const pages = htmlFiles(distDir);
const broken = [];
let checked = 0;

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const pageUrl = new URL(urlOf(page), 'https://docs.invalid');
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const raw = m[1].replaceAll('&amp;', '&');
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue; // external, mailto:, data:, etc.
    const target = new URL(raw, pageUrl);
    const file = fileOf(target.pathname);
    checked++;
    if (file === null) {
      broken.push({ page: urlOf(page), link: raw, reason: `outside the site base "${base}"` });
      continue;
    }
    if (!existsSync(file)) {
      broken.push({ page: urlOf(page), link: raw, reason: 'page or file does not exist' });
      continue;
    }
    const hash = decodeURIComponent(target.hash.slice(1));
    if (hash && file.endsWith('.html') && !idsOf(file).has(hash)) {
      broken.push({ page: urlOf(page), link: raw, reason: `anchor #${hash} not found` });
    }
  }
}

if (broken.length) {
  console.error(`✘ ${broken.length} broken link(s) found (checked ${checked} internal links on ${pages.length} pages):\n`);
  for (const b of broken) console.error(`  ${b.page}\n    → ${b.link}  (${b.reason})`);
  process.exit(1);
}
console.log(`✔ All ${checked} internal links and anchors are valid (${pages.length} pages, base "${base}").`);
