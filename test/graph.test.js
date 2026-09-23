// The graph page: built from the test wiki, with every page and link.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSite } from '../app/build.js';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lifewiki-graph-'));
buildSite({
  contentDir: new URL('./fixtures/vault', import.meta.url).pathname,
  outDir: out,
  config: { title: 'LifeWiki', repo: '', branch: 'main', contentPath: 'content' },
});
const html = fs.readFileSync(path.join(out, 'graph.html'), 'utf8');
const data = JSON.parse(/<script type="application\/json" id="graph-data">([\s\S]*?)<\/script>/.exec(html)[1]);

test('graph page lists every page', () => {
  assert.equal(data.nodes.length, 5);
  assert.ok(data.nodes.some((n) => n.url === '/mathematik/masstheorie'));
});

test('graph has each link once, in both directions merged', () => {
  const idx = (url) => data.nodes.findIndex((n) => n.url === url);
  const a = idx('/mathematik/masstheorie'), b = idx('/mathematik/analysis/integral');
  const between = data.links.filter(([x, y]) => (x === a && y === b) || (x === b && y === a));
  assert.equal(between.length, 1);
  const keys = data.links.map(([x, y]) => [Math.min(x, y), Math.max(x, y)].join());
  assert.equal(new Set(keys).size, keys.length);
});

test('graph viewer files are copied and every page links to the graph', () => {
  assert.ok(fs.existsSync(path.join(out, 'assets/graph/graph-view.js')));
  assert.ok(fs.existsSync(path.join(out, 'assets/graph/graph.css')));
  assert.match(fs.readFileSync(path.join(out, 'notes/links-test.html'), 'utf8'), /href="\/graph\?from=%2Fnotes%2Flinks-test"/);
});
