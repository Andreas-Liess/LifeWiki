import test from 'node:test';
import assert from 'node:assert/strict';
import { createResolver } from '../app/lib/resolve.js';

const resolve = createResolver([
  'index.md',
  'Mathematik/Maßtheorie.md',
  'Analysis/Maßtheorie.md',
  'Mathematik/Analysis/Integral.md',
  'Notes/Links test.md',
  'attachments/Diagramm 1.png',
]);

test('finds a page by name, with or without .md', () => {
  assert.equal(resolve('Integral', 'index.md'), 'Mathematik/Analysis/Integral.md');
  assert.equal(resolve('Integral.md', 'index.md'), 'Mathematik/Analysis/Integral.md');
});

test('ignores upper and lower case', () => {
  assert.equal(resolve('integral', 'index.md'), 'Mathematik/Analysis/Integral.md');
});

test('full path picks the right one of two files with the same name', () => {
  assert.equal(resolve('Mathematik/Maßtheorie', 'index.md'), 'Mathematik/Maßtheorie.md');
  assert.equal(resolve('Analysis/Maßtheorie', 'index.md'), 'Analysis/Maßtheorie.md');
});

test('same name: a file in the same folder wins', () => {
  assert.equal(resolve('Maßtheorie', 'Mathematik/Other.md'), 'Mathematik/Maßtheorie.md');
});

test('same name: otherwise the shortest path wins', () => {
  assert.equal(resolve('Maßtheorie', 'index.md'), 'Analysis/Maßtheorie.md');
});

test('relative paths work', () => {
  assert.equal(resolve('../Maßtheorie', 'Mathematik/Analysis/Integral.md'), 'Mathematik/Maßtheorie.md');
  assert.equal(resolve('../attachments/Diagramm 1.png', 'Notes/Links test.md'), 'attachments/Diagramm 1.png');
});

test('finds attachments by name', () => {
  assert.equal(resolve('Diagramm 1.png', 'Notes/Links test.md'), 'attachments/Diagramm 1.png');
});

test('handles different unicode forms of the same name (macOS)', () => {
  assert.equal(resolve('Maßtheorie'.normalize('NFD'), 'index.md'), 'Analysis/Maßtheorie.md');
  const r = createResolver(['Über.md']);
  assert.equal(r('Über'.normalize('NFD'), ''), 'Über.md');
});

test('returns null for missing pages and paths outside the wiki', () => {
  assert.equal(resolve('Nope', 'index.md'), null);
  assert.equal(resolve('../../index', 'index.md'), null);
});
