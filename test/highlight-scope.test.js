import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, r;
before(async () => {
  session = await open('test/blank.html');
  r = await session.page.evaluate(async () => (await import('/test/highlight-scope.fixtures.js')).run());
});
after(() => session?.close());

test('two views with a highlightScope paint their own decorations and selection under names suffixed with it', () => {
  assert.equal(r.markA, 'Apple');
  assert.equal(r.markB, 'Banana');
  assert.ok(r.selA && r.selB, 'each paints its selection');
  assert.equal(r.bare, false, 'no unsuffixed name is taken');
  assert.deepEqual(r.styled, [true, true], 'each scope has its default look');
});

test('destroying one view releases its highlights and leaves the other\'s', () => {
  assert.deepEqual(r.afterDestroy, ['fragview-selection-b', 'mark-b']);
  assert.deepEqual(r.afterBoth, []);
});
