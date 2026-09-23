// Finds the file a link points to, the same way Obsidian does:
//   1. relative to the folder of the note that contains the link
//   2. as a full path from the vault root
//   3. by file name; if several files match, the one with the shortest path wins
// Matching ignores upper/lower case. ".md" may be left out.

const nfc = (s) => s.normalize('NFC');
const lower = (s) => nfc(s).toLowerCase();

function dirname(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

// Resolves "." and ".." parts. Returns null if the path leaves the vault.
function normalize(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

export function createResolver(paths) {
  const exact = new Set(paths.map(nfc));
  const byLower = new Map();
  const byName = new Map();
  for (const p of paths) {
    const key = lower(p);
    if (!byLower.has(key)) byLower.set(key, nfc(p));
    const name = key.slice(key.lastIndexOf('/') + 1);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(nfc(p));
  }

  function lookup(p) {
    if (p == null || p === '') return null;
    for (const cand of [p, p + '.md']) {
      if (exact.has(cand)) return cand;
      const hit = byLower.get(lower(cand));
      if (hit) return hit;
    }
    return null;
  }

  return function resolve(linkpath, sourcePath = '') {
    let link = nfc(String(linkpath).trim()).replace(/\\/g, '/');
    if (link === '') return sourcePath ? nfc(sourcePath) : null;
    const absolute = link.startsWith('/');
    link = link.replace(/^\/+/, '');

    if (!absolute) {
      const rel = lookup(normalize(`${dirname(nfc(sourcePath))}/${link}`));
      if (rel) return rel;
    }
    const abs = lookup(normalize(link));
    if (abs) return abs;

    const want = lower(link);
    const name = want.slice(want.lastIndexOf('/') + 1);
    const candidates = [...(byName.get(name) || []), ...(byName.get(name + '.md') || [])].filter((p) => {
      const l = lower(p);
      return [want, want + '.md'].some((w) => l === w || l.endsWith('/' + w));
    });
    candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
    return candidates[0] || null;
  };
}
