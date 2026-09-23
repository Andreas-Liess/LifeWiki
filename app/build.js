// Builds the wiki: reads every file in content/, writes a static website to dist/.
// Run: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdown, stripFrontMatter } from './lib/markdown.js';
import { createResolver } from './lib/resolve.js';
import { slugify } from './lib/slug.js';
import { layout, renderTree } from './lib/layout.js';

const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(APP);

// ---------- reading content/ ----------

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip hidden things like .obsidian/, .git/, .DS_Store
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel.normalize('NFC'));
  }
  return out;
}

const isNote = (p) => /\.md$/i.test(p);
const baseName = (p) => p.slice(p.lastIndexOf('/') + 1);
const titleOf = (p) => baseName(p).replace(/\.md$/i, '');
const folderParts = (p) => p.split('/').slice(0, -1);

// Gives each file a unique, clean URL.
function assignUrls(notes, files) {
  const taken = new Set();
  const unique = (url) => {
    let u = url;
    for (let n = 2; taken.has(u.toLowerCase()); n++) u = `${url}-${n}`;
    taken.add(u.toLowerCase());
    return u;
  };
  const urls = new Map();
  const home = notes.find((p) => p.toLowerCase() === 'index.md');
  if (home) { urls.set(home, '/'); taken.add('/'); }
  taken.add('/files'); taken.add('/assets'); taken.add('/404');

  for (const p of notes) {
    if (p === home) continue;
    const parts = p.replace(/\.md$/i, '').split('/').map((s) => slugify(s) || 'page');
    urls.set(p, unique('/' + parts.join('/')));
  }
  for (const p of files) {
    const dot = p.lastIndexOf('.');
    const ext = dot > p.lastIndexOf('/') ? p.slice(dot).toLowerCase() : '';
    const stem = ext ? p.slice(0, dot) : p;
    const parts = stem.split('/').map((s) => slugify(s) || 'file');
    urls.set(p, unique('/files/' + parts.join('/')) + ext);
  }
  return { urls, home };
}

function buildTree(notes, urls, home) {
  const root = { name: '', folders: new Map(), pages: [] };
  for (const p of notes) {
    if (p === home) continue;
    let node = root;
    for (const part of folderParts(p)) {
      if (!node.folders.has(part)) node.folders.set(part, { name: part, folders: new Map(), pages: [] });
      node = node.folders.get(part);
    }
    node.pages.push({ title: titleOf(p), url: urls.get(p), path: p });
  }
  return root;
}

function loadConfig(root) {
  const file = path.join(root, 'site.config.json');
  const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  // On Vercel the repository is known automatically.
  const envRepo = process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}` : '';
  return {
    title: cfg.title || 'Live Wiki',
    repo: cfg.repo || envRepo,
    branch: cfg.branch || process.env.VERCEL_GIT_COMMIT_REF || 'main',
    contentPath: cfg.contentPath || 'content',
  };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function writeFile(outDir, url, content) {
  const file = path.join(outDir, url === '/' ? 'index.html' : `${url.slice(1)}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// ---------- the build ----------

export function buildSite({ contentDir, outDir, config }) {
  const warnings = [];
  const all = fs.existsSync(contentDir) ? listFiles(contentDir) : [];
  const notes = all.filter(isNote);
  const files = all.filter((p) => !isNote(p));
  const { urls, home } = assignUrls(notes, files);
  const resolve = createResolver(all);
  const md = createMarkdown();
  const tree = buildTree(notes, urls, home);

  // Pass 1: read every note and collect its headings (needed for [[Page#Heading]]).
  const info = new Map();
  for (const p of notes) {
    const src = stripFrontMatter(fs.readFileSync(path.join(contentDir, p), 'utf8'));
    const env = {};
    const tokens = md.parse(src, env);
    const firstH1 = tokens[0] && tokens[0].type === 'heading_open' && tokens[0].tag === 'h1';
    info.set(p, { src, headings: env.headings || [], firstH1, backlinks: new Set() });
  }

  const byName = new Map();
  for (const p of notes) {
    const k = titleOf(p).toLowerCase();
    byName.set(k, (byName.get(k) || 0) + 1);
  }

  // Pass 2: render every note.
  const bodies = new Map();
  for (const p of notes) {
    const env = {
      link(target, heading) {
        const dest = target ? resolve(target, p) : p;
        if (!dest) {
          warnings.push(`${p}: link to "${target}" – page does not exist`);
          return null;
        }
        if (!isNote(dest)) return urls.get(dest);
        if (target && !target.includes('/') && byName.get(titleOf(dest).toLowerCase()) > 1) {
          warnings.push(`${p}: [[${target}]] matches several pages, using "${dest}". Write [[${dest.replace(/\.md$/i, '')}]] to be sure.`);
        }
        if (dest !== p) info.get(dest).backlinks.add(p);
        let anchor = '';
        if (heading && !heading.startsWith('^')) {
          const want = slugify(heading);
          const h = info.get(dest).headings.find((x) => slugify(x.text) === want);
          if (h) anchor = `#${h.id}`;
          else warnings.push(`${p}: heading "${heading}" not found in "${dest}"`);
        }
        return dest === p && anchor ? anchor : urls.get(dest) + anchor;
      },
      file(target) {
        const dest = resolve(target, p);
        if (!dest) warnings.push(`${p}: file "${target}" not found`);
        return dest ? urls.get(dest) : null;
      },
    };
    bodies.set(p, md.render(info.get(p).src, env));
  }

  // Write everything.
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const pageLinks = (p) => {
    if (!config.repo) return {};
    const filePath = `${config.contentPath}/${p}`.split('/').map(encodeURIComponent).join('/');
    const title = encodeURIComponent(`Comment: ${p.replace(/\.md$/i, '')}`);
    return {
      editUrl: `https://github.com/${config.repo}/edit/${config.branch}/${filePath}`,
      discussUrl: `https://github.com/${config.repo}/issues/new?title=${title}`,
    };
  };

  for (const p of notes) {
    const { firstH1, backlinks } = info.get(p);
    const url = urls.get(p);
    writeFile(outDir, url, layout({
      site: config,
      title: p === home ? config.title : titleOf(p),
      crumbs: folderParts(p),
      body: bodies.get(p),
      backlinks: [...backlinks].sort().map((b) => ({ title: b === home ? config.title : titleOf(b), url: urls.get(b) })),
      currentUrl: url,
      tree,
      showTitle: !firstH1 && p !== home,
      ...pageLinks(p),
    }));
  }

  if (!home) {
    const body = notes.length
      ? `<p>All pages in this wiki:</p>\n<div class="index-tree">${renderTree(tree, null)}</div>`
      : '<p>This wiki is empty. Add Markdown files to the <code>content/</code> folder.</p>';
    writeFile(outDir, '/', layout({ site: config, title: config.title, body, currentUrl: '/', tree }));
  }
  writeFile(outDir, '/404', layout({
    site: config, title: 'Page not found', currentUrl: null, tree,
    body: '<p>This page does not exist. <a href="/">Go to the start page</a> or find a page in the list.</p>',
  }));

  for (const p of files) {
    const dest = path.join(outDir, urls.get(p).slice(1));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(contentDir, p), dest);
  }

  copyDir(path.join(APP, 'assets'), path.join(outDir, 'assets'));
  const katexDir = path.join(ROOT, 'node_modules', 'katex', 'dist');
  fs.mkdirSync(path.join(outDir, 'assets', 'katex'), { recursive: true });
  fs.copyFileSync(path.join(katexDir, 'katex.min.css'), path.join(outDir, 'assets', 'katex', 'katex.min.css'));
  copyDir(path.join(katexDir, 'fonts'), path.join(outDir, 'assets', 'katex', 'fonts'));

  return { notes, files, urls, warnings: [...new Set(warnings)] };
}

// Run directly: node app/build.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig(ROOT);
  const result = buildSite({
    contentDir: path.join(ROOT, config.contentPath),
    outDir: path.join(ROOT, 'dist'),
    config,
  });
  console.log(`Built ${result.notes.length} pages and ${result.files.length} files into dist/`);
  if (result.warnings.length) {
    console.log(`\n${result.warnings.length} warning(s):`);
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
}
