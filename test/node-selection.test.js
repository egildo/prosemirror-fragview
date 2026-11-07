import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, r;
before(async () => {
  session = await open('test/blank.html');
  r = await session.page.evaluate(async () => (await import('/test/node-selection.fixtures.js')).run());
});
after(() => session?.close());

test('a selected block divided across boxes carries ProseMirror-selectednode on every shown piece, and keeps it through a refill', () => {
  assert.ok(r.quoteBoxes > 1, `${r.quoteBoxes} boxes show the quote`);
  assert.deepEqual(r.quote, Array(r.quoteBoxes).fill('BLOCKQUOTE'));
  assert.deepEqual(r.afterEdit, r.quote);
});

test('a selected rule or image carries ProseMirror-selectednode, and a text selection leaves none', () => {
  assert.deepEqual(r.rule, ['HR']);
  assert.deepEqual(r.image, ['IMG']);
  assert.deepEqual(r.text, []);
});

test('a selection of several ranges paints each, and an invisible one paints none', () => {
  assert.equal(r.twoRanges, 2);
  assert.equal(r.invisible, 0);
});

test('a node decoration puts its class on every shown piece of its node, and takes it off when it goes', () => {
  assert.equal(r.decorated, r.quoteBoxes);
  assert.equal(r.undecorated, 0);
});
