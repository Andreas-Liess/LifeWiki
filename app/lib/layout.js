// The HTML around every page: header, page tree on the left, article in the middle.
import fs from 'node:fs';
import { escapeHtml as esc } from './markdown.js';

// The fox logo, drawn inline so it takes the text color (black / white with the theme).
const foxSvg = fs.readFileSync(new URL('../assets/fox.svg', import.meta.url), 'utf8');
const FOX = `<svg class="fox" viewBox="${/viewBox="([^"]+)"/.exec(foxSvg)[1]}" aria-hidden="true"><path fill="currentColor" d="${/ d="([^"]+)"/.exec(foxSvg)[1]}"/></svg>`;

function treeHtml(node, currentUrl) {
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  const pages = [...node.pages].sort((a, b) => a.title.localeCompare(b.title));
  let html = '<ul>';
  for (const f of folders) {
    const open = currentUrl && containsUrl(f, currentUrl) ? ' open' : '';
    html += `<li class="folder"><details${open}><summary>${esc(f.name)}</summary>${treeHtml(f, currentUrl)}</details></li>`;
  }
  for (const p of pages) {
    const cur = p.url === currentUrl ? ' aria-current="page"' : '';
    html += `<li class="leaf" data-find="${esc(p.path.replace(/\.md$/i, '').toLowerCase())}"><a href="${esc(p.url)}"${cur}>${esc(p.title)}</a></li>`;
  }
  return html + '</ul>';
}

function containsUrl(node, url) {
  return node.pages.some((p) => p.url === url) || [...node.folders.values()].some((f) => containsUrl(f, url));
}

export function renderTree(tree, currentUrl) {
  return treeHtml(tree, currentUrl);
}

export function layout({ site, title, crumbs = [], body, backlinks = [], editUrl, discussUrl, currentUrl, tree, showTitle = true, head = '', bodyClass = '' }) {
  const crumbHtml = crumbs.length
    ? `<p class="crumbs">${crumbs.map(esc).join(' <span aria-hidden="true">›</span> ')}</p>`
    : '';
  const backHtml = backlinks.length
    ? `<section class="backlinks"><h2>Linked from</h2><ul>${backlinks
        .map((b) => `<li><a href="${esc(b.url)}">${esc(b.title)}</a></li>`)
        .join('')}</ul></section>`
    : '';
  const footLinks = [
    editUrl && `<a href="${esc(editUrl)}">Edit this page on GitHub</a>`,
    discussUrl && `<a href="${esc(discussUrl)}">Comment on GitHub</a>`,
  ].filter(Boolean);
  const pageTitle = title === site.title ? title : `${title} – ${site.title}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<link rel="icon" href="/assets/fox.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/fonts/serif.css">
<link rel="stylesheet" href="/assets/katex/katex.min.css">
<link rel="stylesheet" href="/assets/style.css">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<script src="/assets/wiki.js" defer></script>
${head}</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<header class="top">
  <a class="brand" href="/">${FOX}${esc(site.title)}</a>
  <div class="tools">
    <a class="graph-link" href="/graph${currentUrl && currentUrl !== '/graph' ? `?from=${encodeURIComponent(currentUrl)}` : ''}" aria-label="Graph of all pages" title="Graph">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M8.1 7.8l2.9 8.2M16.5 7.7l-3.4 8.4M8.2 6.8l7.6-.6"/></svg>
    </a>
    <button class="theme" type="button" aria-label="Switch dark or light mode" title="Dark / light">
      <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>
      <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>
    </button>
    <button class="menu" type="button" aria-controls="nav" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      Pages
    </button>
  </div>
</header>
<div class="layout">
  <nav id="nav" class="sidebar" aria-label="All pages">
    <input id="find" type="search" placeholder="Find a page…" autocomplete="off" aria-label="Find a page">
    ${renderTree(tree, currentUrl)}
    <p class="none" hidden>No page found.</p>
  </nav>
  <main class="page"><div class="page-inner">
    ${crumbHtml}
    ${showTitle ? `<h1 class="title">${esc(title)}</h1>` : ''}
    <article class="content">
${body}
    </article>
    ${backHtml}
    ${footLinks.length ? `<footer class="page-foot">${footLinks.join(' · ')}</footer>` : ''}
  </div></main>
</div>
</body>
</html>
`;
}
