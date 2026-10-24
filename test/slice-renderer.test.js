import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, results;
before(async () => {
  session = await open('test/blank.html');
  results = await session.page.evaluate(async () => (await import('/test/slice-renderer.fixtures.js')).run());
});
after(() => session?.close());

const names = ['marks, whole', 'nested, whole', 'nested, from inside the third-level item', 'nested, from inside the third-level item to inside the quote', 'lists, from the third item of a reversed list with a value', 'lists, from the third item of a list that starts at 4', 'lists, from the second item of a reversed list', 'structured marks, whole', 'structured marks, from inside the inner run'];
for (const [i, name] of names.entries()) {
  test(`${name}: every text node starts at its model position`, () => {
    assert.deepEqual(results[i].actual, results[i].expected);
  });
  test(`${name}: every position comes back through pointAt and posAt`, () => {
    assert.deepEqual(results[i].misses, []);
  });
  test(`${name}: a position outside the slice has no point`, () => {
    assert.deepEqual(results[i].outside, [null, null]);
  });
}

test('a slice from inside a nested item keeps its open ancestors as partial elements, its earlier siblings put away, and the words of a divided box', () => {
  assert.match(results[2].html, /^<ul data-beltype="split end fragment"><li data-beltype="split end"><p data-beltype="away"><\/p><ul data-beltype="split end"><li data-beltype="split end"><p data-beltype="away"><\/p><ul data-beltype="split end"><li data-beltype="split end"><p data-beltype="split end">delta<\/p><p>epsilon<\/p><\/li><\/ul><\/li><\/ul><\/li><\/ul><blockquote>/);
  assert.match(results[3].html, /<blockquote data-beltype="split start fragment"><p>quoted<\/p><p data-beltype="split start"><br class="fragview-trailing-break"><\/p><\/blockquote>$/);
});

test('the first displayed item of an opened list gets its ordinal as value, by HTML\'s algorithm; the nodes opening at the cut adjoin it', () => {
  assert.match(results[4].html, /^<ol reversed="" data-beltype="split end fragment"><li data-beltype="away"><\/li><li value="7" data-beltype="away"><\/li><li data-beltype="adjoin" value="6"><p data-beltype="adjoin">c<\/p>/);
  assert.match(results[5].html, /<ol start="4" data-beltype="split end fragment"><li data-beltype="away"><\/li><li data-beltype="away"><\/li><li data-beltype="adjoin" value="6">/);
  assert.match(results[6].html, /<ol reversed="" data-beltype="split end fragment"><li data-beltype="away"><\/li><li data-beltype="adjoin" value="2">/);
});

test('structured marks nest by their parent pointers, not by rank, and each element carries its instance', () => {
  assert.equal(results[7].html, '<p><strong data-txt-i="s1"><em data-txt-i="e1">ab</em>cd</strong><em data-txt-i="e2">ef</em></p>');
  assert.equal(results[8].html, '<p data-beltype="split end fragment"><strong data-txt-i="s1"><em data-txt-i="e1">b</em>cd</strong><em data-txt-i="e2">ef</em></p>');
});
