// The HTML around every page: header, page tree on the left, article in the middle.
import { escapeHtml as esc } from './markdown.js';

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

export function layout({ site, title, crumbs = [], body, backlinks = [], editUrl, discussUrl, currentUrl, tree, showTitle = true }) {
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
<link rel="stylesheet" href="/assets/katex/katex.min.css">
<link rel="stylesheet" href="/assets/style.css">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<script src="/assets/wiki.js" defer></script>
</head>
<body>
<header class="top">
  <a class="brand" href="/">${esc(site.title)}</a>
  <div class="tools">
    <button class="theme" type="button" aria-label="Switch dark or light mode">Dark / Light</button>
    <button class="menu" type="button" aria-controls="nav" aria-expanded="false">Pages</button>
  </div>
</header>
<div class="layout">
  <nav id="nav" class="sidebar" aria-label="All pages">
    <input id="find" type="search" placeholder="Find a page…" autocomplete="off" aria-label="Find a page">
    ${renderTree(tree, currentUrl)}
    <p class="none" hidden>No page found.</p>
  </nav>
  <main class="page">
    ${crumbHtml}
    ${showTitle ? `<h1 class="title">${esc(title)}</h1>` : ''}
    <article class="content">
${body}
    </article>
    ${backHtml}
    ${footLinks.length ? `<footer class="page-foot">${footLinks.join(' · ')}</footer>` : ''}
  </main>
</div>
</body>
</html>
`;
}
