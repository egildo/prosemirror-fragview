import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';
import { awaySheet, continuationSheet, AWAY_SHEET, CONTINUATION_SHEET } from '../src/slice-renderer.js';

let session, results;
before(async () => {
  session = await open('test/blank.html');
  results = await session.page.evaluate(async () => (await import('/test/slice-renderer.fixtures.js')).run());
});
after(() => session?.close());

const names = ['marks, whole', 'nested, whole', 'nested, from inside the third-level item', 'nested, from inside the third-level item to inside the quote', 'lists, from the third item of a reversed list with a value', 'lists, from the third item of a list that starts at 4', 'lists, from the second item of a reversed list', 'lists, a reversed list cut before its third item', 'structured marks, whole', 'structured marks, from inside the inner run', 'lists, from the third item of a reversed list with a value, under another registry'];
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
  assert.match(results[2].html, /^<ul data-fragview="split end fragment"><li data-fragview="split end"><p data-fragview="away"><\/p><ul data-fragview="split end"><li data-fragview="split end"><p data-fragview="away"><\/p><ul data-fragview="split end"><li data-fragview="split end"><p data-fragview="split end">delta<\/p><p>epsilon<\/p><\/li><\/ul><\/li><\/ul><\/li><\/ul><blockquote>/);
  assert.match(results[3].html, /<blockquote data-fragview="split start fragment"><p>quoted<\/p><p data-fragview="split start"><br class="fragview-trailing-break"><\/p><\/blockquote>$/);
});

test('the first displayed item of an opened list gets its ordinal as value, by HTML\'s algorithm; the nodes opening at the cut adjoin it', () => {
  assert.match(results[4].html, /^<ol reversed="" data-fragview="split end fragment"><li data-fragview="away"><\/li><li value="7" data-fragview="away"><\/li><li data-fragview="adjoin" value="6"><p data-fragview="adjoin">c<\/p>/);
  assert.match(results[5].html, /<ol start="4" data-fragview="split end fragment"><li data-fragview="away"><\/li><li data-fragview="away"><\/li><li data-fragview="adjoin" value="6">/);
  assert.match(results[6].html, /<ol reversed="" data-fragview="split end fragment"><li data-fragview="away"><\/li><li data-fragview="adjoin" value="2">/);
  assert.equal(results[7].html, '<ol reversed="" data-fragview="split start fragment"><li value="4"><p>a</p></li><li value="7"><p>b</p></li></ol>');
});

test('structured marks nest by their parent pointers, not by rank, and each element carries its instance', () => {
  assert.equal(results[8].html, '<p><strong data-txt-i="s1"><em data-txt-i="e1">ab</em>cd</strong><em data-txt-i="e2">ef</em></p>');
  assert.equal(results[9].html, '<p data-fragview="split end fragment"><strong data-txt-i="s1"><em data-txt-i="e1">b</em>cd</strong><em data-txt-i="e2">ef</em></p>');
});

test('a renderer made for another registry writes its attribute and spellings, and still numbers past the siblings it put away', () => {
  assert.match(results[10].html, /^<ol reversed="" data-pager="cut end fragment"><li data-pager="gone"><\/li><li value="7" data-pager="gone"><\/li><li data-pager="adjoin" value="6"><p data-pager="adjoin">c<\/p>/);
  assert.ok(!results[10].html.includes('data-fragview'));
});

test('the two sheets are functions of the registry, and the constants are the default\'s', () => {
  assert.equal(AWAY_SHEET, '[data-fragview~="away"] { display: none !important; }');
  assert.equal(awaySheet({ attribute: 'data-pager', away: 'gone' }), '[data-pager~="gone"] { display: none !important; }');
  assert.equal(continuationSheet(), CONTINUATION_SHEET);
  assert.ok(continuationSheet({ attribute: 'data-pager', split: 'cut' }).startsWith('[data-pager~="cut"]:not([data-pager~="start"]) {'));
});
