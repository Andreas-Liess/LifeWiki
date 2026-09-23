// Markdown -> HTML. Standard Markdown via markdown-it, plus:
//   [[Page]], [[Page|text]], [[Page#Heading]]   links between pages
//   ![[image.png]], ![[image.png|300]]          images
//   $x^2$ and $$ ... $$                          formulas (KaTeX)
// Links are only turned into tokens here. Where they point is decided at render time
// through `env.link(target, heading)` and `env.file(target)`, set by the build.
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import taskLists from 'markdown-it-task-lists';
import katex from 'katex';
import { slugify } from './slug.js';

const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;
const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

// ---------- [[wikilinks]] and ![[embeds]] ----------

function wikilinkRule(state, silent) {
  const src = state.src;
  let pos = state.pos;
  const embed = src.charCodeAt(pos) === 0x21 /* ! */;
  if (embed) pos++;
  if (src.slice(pos, pos + 2) !== '[[') return false;
  const end = src.indexOf(']]', pos + 2);
  if (end === -1) return false;
  const inner = src.slice(pos + 2, end);
  if (!inner.trim() || inner.includes('\n') || inner.includes('[[')) return false;

  if (!silent) {
    // "\|" is how a "|" is written inside tables.
    const clean = inner.replace(/\\\|/g, '|');
    const bar = clean.indexOf('|');
    const target = bar === -1 ? clean : clean.slice(0, bar);
    const label = bar === -1 ? '' : clean.slice(bar + 1).trim();
    const hash = target.indexOf('#');
    const token = state.push('wikilink', '', 0);
    token.meta = {
      embed,
      path: (hash === -1 ? target : target.slice(0, hash)).trim(),
      heading: hash === -1 ? '' : target.slice(hash + 1).split('#').pop().trim(),
      label,
    };
  }
  state.pos = end + 2;
  return true;
}

function sizeAttrs(label) {
  const m = /^(\d+)(?:x(\d+))?$/.exec(label || '');
  if (!m) return '';
  return ` width="${m[1]}"` + (m[2] ? ` height="${m[2]}"` : '');
}

function renderWikilink(tokens, idx, _opts, env) {
  const { embed, path, heading, label } = tokens[idx].meta;

  if (embed && IMAGE.test(path)) {
    const src = env.file ? env.file(path) : null;
    if (!src) return `<span class="broken" title="File not found">${escapeHtml(path)}</span>`;
    const alt = sizeAttrs(label) ? path : label || path;
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${sizeAttrs(label)} loading="lazy">`;
  }

  const text = label || (path ? (heading ? `${path} › ${heading}` : path) : heading);
  const hit = env.link ? env.link(path, heading) : null;
  if (!hit) return `<a class="broken" title="Page does not exist yet">${escapeHtml(text)}</a>`;
  return `<a class="internal" href="${escapeHtml(hit)}">${escapeHtml(text)}</a>`;
}

// ---------- formulas ----------

function mathInline(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;

  // $$ ... $$ inside a line: display formula
  if (src.charCodeAt(start + 1) === 0x24) {
    const end = src.indexOf('$$', start + 2);
    if (end === -1 || end === start + 2) return false;
    if (!silent) {
      const t = state.push('math_block_inline', '', 0);
      t.content = src.slice(start + 2, end);
    }
    state.pos = end + 2;
    return true;
  }

  // $ ... $: no space right after the opening $ or right before the closing $,
  // and no digit right after the closing $ (so "costs $5 and $6" stays text).
  const first = src[start + 1];
  if (!first || /\s/.test(first)) return false;
  let end = start + 1;
  while ((end = src.indexOf('$', end)) !== -1) {
    if (src[end - 1] === '\\') { end++; continue; }
    if (/\s/.test(src[end - 1]) || /\d/.test(src[end + 1] || '')) return false;
    break;
  }
  if (end === -1 || end === start + 1) return false;
  if (!silent) {
    const t = state.push('math_inline', '', 0);
    t.content = src.slice(start + 1, end);
  }
  state.pos = end + 1;
  return true;
}

function mathBlock(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.slice(pos, pos + 2) !== '$$') return false;

  let firstLine = state.src.slice(pos + 2, max);
  let content;
  let line = startLine;

  if (firstLine.trim().endsWith('$$') && firstLine.trim().length >= 2) {
    // $$ ... $$ on one line
    content = firstLine.trim().slice(0, -2);
  } else {
    const parts = [firstLine];
    let found = false;
    while (++line < endLine) {
      pos = state.bMarks[line] + state.tShift[line];
      max = state.eMarks[line];
      if (pos < max && state.sCount[line] < state.blkIndent) break;
      const text = state.src.slice(pos, max);
      if (text.trimEnd().endsWith('$$')) {
        parts.push(text.trimEnd().slice(0, -2));
        found = true;
        break;
      }
      parts.push(text);
    }
    if (!found) return false;
    content = parts.join('\n');
  }
  if (silent) return true;
  state.line = line + 1;
  const t = state.push('math_block', 'div', 0);
  t.block = true;
  t.content = content;
  t.map = [startLine, state.line];
  return true;
}

function tex(content, displayMode) {
  return katex.renderToString(content.trim(), { displayMode, throwOnError: false, strict: 'ignore' });
}

// ---------- heading ids ----------

// Gives every heading a stable id. Used for the page anchors and to resolve [[Page#Heading]].
export function headingIds(tokens) {
  const seen = new Map();
  const list = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const text = tokens[i + 1].content;
    const base = slugify(text) || 'section';
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    const id = n ? `${base}-${n}` : base;
    tokens[i].attrSet('id', id);
    list.push({ text, id, level: Number(tokens[i].tag.slice(1)) });
  }
  return list;
}

// ---------- normal markdown links and images ----------

function internalHref(href) {
  if (!href || EXTERNAL.test(href) || href.startsWith('#')) return null;
  try { return decodeURIComponent(href); } catch { return href; }
}

export function createMarkdown() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false, breaks: true });
  md.use(footnote).use(mark).use(taskLists, { enabled: false });

  md.inline.ruler.before('link', 'wikilink', wikilinkRule);
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.core.ruler.push('heading_ids', (state) => { state.env.headings = headingIds(state.tokens); });

  md.renderer.rules.wikilink = renderWikilink;
  md.renderer.rules.math_inline = (t, i) => tex(t[i].content, false);
  md.renderer.rules.math_block_inline = (t, i) => tex(t[i].content, true);
  md.renderer.rules.math_block = (t, i) => `<div class="math">${tex(t[i].content, true)}</div>\n`;

  const defaultLink = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href');
    if (href && EXTERNAL.test(href)) {
      token.attrJoin('class', 'external');
    } else if (href && href.startsWith('#') && env.link) {
      // [text](#Heading) on the same page
      const hit = env.link('', internalHref(href.slice(1)) || '');
      if (hit) token.attrSet('href', hit);
    } else {
      const raw = internalHref(href);
      if (raw != null && env.link) {
        const hash = raw.indexOf('#');
        const path = hash === -1 ? raw : raw.slice(0, hash);
        const heading = hash === -1 ? '' : raw.slice(hash + 1);
        const isFile = /\.[a-z0-9]+$/i.test(path) && !/\.md$/i.test(path);
        const hit = isFile ? env.file(path) : env.link(path, heading);
        if (hit) {
          token.attrSet('href', hit);
          token.attrJoin('class', 'internal');
        } else {
          token.attrs = token.attrs.filter(([k]) => k !== 'href');
          token.attrSet('class', 'broken');
          token.attrSet('title', 'Page does not exist yet');
        }
      }
    }
    return defaultLink(tokens, idx, opts, env, self);
  };

  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const raw = internalHref(token.attrGet('src'));
    if (raw != null && env.file) {
      const hit = env.file(raw);
      if (hit) token.attrSet('src', hit);
    }
    // ![alt|300](image.png) sets the width, like in Obsidian.
    const alt = self.renderInlineAsText(token.children || [], opts, env);
    const m = /^(.*?)\|(\d+)(?:x(\d+))?$/.exec(alt);
    if (m) {
      const size = ` width="${m[2]}"` + (m[3] ? ` height="${m[3]}"` : '');
      return `<img src="${escapeHtml(token.attrGet('src'))}" alt="${escapeHtml(m[1])}"${size} loading="lazy">`;
    }
    token.attrSet('loading', 'lazy');
    return defaultImage(tokens, idx, opts, env, self);
  };

  return md;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Removes a "---" block at the very top of a file (YAML front matter, used by many editors).
export function stripFrontMatter(text) {
  const m = /^﻿?---\r?\n[\s\S]*?\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/.exec(text);
  return m ? text.slice(m[0].length) : text.replace(/^﻿/, '');
}
