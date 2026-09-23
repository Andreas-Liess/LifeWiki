// Graph view – build side. Writes /graph.html and copies the viewer files.
// Everything about the graph lives in this folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../lib/layout.js';
import { escapeHtml as esc } from '../lib/markdown.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// pages: [{ url, title, folder }], links: [[fromIndex, toIndex], ...]
export function writeGraph({ outDir, config, tree, pages, links }) {
  const seen = new Set();
  const unique = [];
  for (const [a, b] of links) {
    if (a < 0 || b < 0 || a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!seen.has(key)) { seen.add(key); unique.push([a, b]); }
  }

  // "<" is escaped so page titles can never close the <script> tag.
  const data = JSON.stringify({
    nodes: pages.map((p) => ({ url: p.url, title: p.title, folder: p.folder })),
    links: unique,
  }).replace(/</g, '\\u003c');

  const list = pages
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => `<li><a href="${esc(p.url)}">${esc(p.title)}</a></li>`)
    .join('');

  const body = `<div class="graph" data-empty="${pages.length ? 'false' : 'true'}">
  <canvas role="img" aria-label="Graph of all ${pages.length} pages and how they link to each other"></canvas>
  <p class="graph-hint" aria-hidden="true">
    <span class="graph-hint-mouse">Drag dots · Scroll to zoom · Click to open</span>
    <span class="graph-hint-touch">Drag dots · Pinch to zoom · Tap twice to open</span>
  </p>
  <button class="graph-fit" type="button" aria-label="Show whole graph" title="Show whole graph">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg>
  </button>
  <p class="graph-count" aria-hidden="true">${pages.length} pages · ${unique.length} links</p>
</div>
<script type="application/json" id="graph-data">${data}</script>
<nav class="graph-list" aria-label="All pages"><ul>${list}</ul></nav>`;

  const html = layout({
    site: config,
    title: 'Graph',
    body,
    currentUrl: '/graph',
    tree,
    showTitle: false,
    bodyClass: 'graph-page',
    head: '<link rel="stylesheet" href="/assets/graph/graph.css">\n<script src="/assets/graph/graph-view.js" defer></script>\n',
  });

  fs.writeFileSync(path.join(outDir, 'graph.html'), html);
  fs.mkdirSync(path.join(outDir, 'assets', 'graph'), { recursive: true });
  for (const f of ['graph-view.js', 'graph.css']) {
    fs.copyFileSync(path.join(HERE, f), path.join(outDir, 'assets', 'graph', f));
  }
  return { nodes: pages.length, links: unique.length };
}
