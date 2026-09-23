// Builds the test wiki in test/fixtures/vault and checks the resulting website.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSite } from '../app/build.js';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'live-wiki-'));
const result = buildSite({
  contentDir: new URL('./fixtures/vault', import.meta.url).pathname,
  outDir: out,
  config: { title: 'Live Wiki', repo: 'owner/repo', branch: 'main', contentPath: 'content' },
});
const page = (url) => fs.readFileSync(path.join(out, url === '/' ? 'index.html' : `${url.slice(1)}.html`), 'utf8');
const links = page('/notes/links-test');

test('finds every Markdown file and skips hidden folders', () => {
  assert.equal(result.notes.length, 5);
  assert.ok(!result.notes.some((p) => p.includes('.obsidian')));
  assert.ok(!fs.existsSync(path.join(out, 'files', 'obsidian')));
});

test('keeps the folder structure', () => {
  for (const url of ['/', '/mathematik/masstheorie', '/mathematik/analysis/integral', '/analysis/masstheorie', '/notes/links-test']) {
    assert.ok(page(url).includes('<main'), url);
  }
  assert.match(page('/mathematik/analysis/integral'), /<p class="crumbs">Mathematik <span aria-hidden="true">›<\/span> Analysis<\/p>/);
});

test('[[Page]], [[Folder/Page]], [[Page|text]]', () => {
  assert.match(links, /Simple: <a class="internal" href="\/mathematik\/analysis\/integral">Integral<\/a>/);
  assert.match(links, /Path: <a class="internal" href="\/mathematik\/masstheorie">/);
  assert.match(links, /Alias: <a class="internal" href="\/mathematik\/analysis\/integral">this concept<\/a>/);
  assert.match(links, /Case: <a class="internal" href="\/mathematik\/analysis\/integral">/);
});

test('[[Page#Heading]] jumps to the heading', () => {
  assert.match(links, /href="\/mathematik\/masstheorie#definition">Definition<\/a>/);
  assert.match(links, /Same page: <a class="internal" href="#table">/);
  const m = page('/mathematik/masstheorie');
  assert.match(m, /<h2 id="definition">/);
  assert.match(m, /<h2 id="definition-1">/);
});

test('normal Markdown links to .md files', () => {
  assert.match(links, /<a href="\/mathematik\/masstheorie" class="internal">Maßtheorie<\/a>/);
  assert.match(links, /<a href="\/mathematik\/analysis\/integral#integral" class="internal">/);
  assert.match(links, /class="external">Wikipedia/);
});

test('two files with the same name stay separate', () => {
  assert.match(page('/'), /href="\/mathematik\/masstheorie">the maths one/);
  assert.match(page('/'), /href="\/analysis\/masstheorie">Maßtheorie/);
  assert.match(page('/mathematik/masstheorie'), /studies measures/);
  assert.match(page('/analysis/masstheorie'), /Analysis version/);
  assert.ok(result.warnings.some((w) => w.includes('matches several pages')));
});

test('missing links show in red and do not break the page', () => {
  assert.match(links, /<a class="broken" title="Page does not exist yet">Does not exist<\/a>/);
  assert.match(links, /<span class="broken" title="File not found">missing.png<\/span>/);
  assert.ok(result.warnings.some((w) => w.includes('Does not exist')));
});

test('images: ![[file]], ![[file|width]] and ![alt](path)', () => {
  assert.match(links, /<img src="\/files\/attachments\/diagramm-1.png" alt="Diagramm 1.png" loading="lazy">/);
  assert.match(links, /width="120"/);
  assert.match(links, /alt="Plot"/);
  assert.ok(fs.existsSync(path.join(out, 'files/attachments/diagramm-1.png')));
});

test('formulas are rendered, prices are not', () => {
  const m = page('/mathematik/masstheorie');
  assert.match(m, /class="katex"/);
  assert.match(m, /class="katex-display"/);
  assert.match(links, /\$5 and \$6/);
  assert.ok(fs.existsSync(path.join(out, 'assets/katex/katex.min.css')));
});

test('no links inside code', () => {
  assert.match(links, /<code>\[\[Not a link\]\]<\/code>/);
  assert.match(links, /\[\[Also not a link\]\]/);
});

test('front matter is hidden', () => {
  assert.doesNotMatch(page('/mathematik/masstheorie'), /aliases/);
});

test('every internal link on every page leads to an existing page or file', () => {
  for (const url of result.urls.values()) {
    if (url.startsWith('/files/')) continue;
    for (const [, href] of page(url).matchAll(/href="(\/[^"#]*)/g)) {
      const target = href === '/' ? 'index.html' : href.startsWith('/files/') || href.startsWith('/assets/') ? href.slice(1) : `${href.slice(1)}.html`;
      assert.ok(fs.existsSync(path.join(out, target)), `${url} -> ${href}`);
    }
  }
});

test('backlinks, edit and comment links', () => {
  const m = page('/mathematik/masstheorie');
  assert.match(m, /Linked from/);
  assert.match(m, /https:\/\/github.com\/owner\/repo\/edit\/main\/content\/Mathematik\/Ma%C3%9Ftheorie.md/);
  assert.match(m, /https:\/\/github.com\/owner\/repo\/issues\/new\?title=/);
});

test('works without an index.md and with an empty wiki', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'live-wiki-empty-'));
  const o = path.join(empty, 'out');
  buildSite({ contentDir: path.join(empty, 'nothing'), outDir: o, config: { title: 'W' } });
  assert.match(fs.readFileSync(path.join(o, 'index.html'), 'utf8'), /This wiki is empty/);
});
