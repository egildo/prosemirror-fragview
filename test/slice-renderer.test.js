import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, results;
before(async () => {
  session = await open('test/blank.html');
  results = await session.page.evaluate(async () => (await import('/test/slice-renderer.fixtures.js')).run());
});
after(() => session?.close());

const names = ['marks, whole', 'nested, whole', 'nested, from inside the third-level item', 'nested, from inside the third-level item to inside the quote'];
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

test('a slice from inside a nested item keeps its open ancestors as partial elements', () => {
  assert.match(results[2].html, /^<ul><li><ul><li><ul><li><p>delta<\/p><p>epsilon<\/p><\/li><\/ul><\/li><\/ul><\/li><\/ul><blockquote>/);
  assert.match(results[3].html, /<blockquote><p>quoted<\/p><p><br class="fragview-trailing-break"><\/p><\/blockquote>$/);
});
