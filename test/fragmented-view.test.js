import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, r;
before(async () => {
  session = await open('test/blank.html');
  r = await session.page.evaluate(async () => (await import('/test/fragmented-view.fixtures.js')).run());
});
after(() => session?.close());

test('invalidate refills the chain from the first in new containers, every one of the new size, cut as a fresh view cuts', () => {
  assert.ok(r.before.length > 2, `${r.before.length} boxes at the first size`);
  assert.deepEqual(r.invalidated.cuts, r.invalidated.fresh);
  assert.notDeepEqual(r.invalidated.cuts, r.before);
  for (const box of r.invalidated.boxes) assert.deepEqual(box, { size: [400, 300], fresh: true });
  assert.equal(r.invalidated.placeholders, 0);
});

test('after an invalidation a transaction still refills', () => {
  assert.equal(r.typed, 'typed 1. A c');
});

test('setProps with a new factory invalidates', () => {
  assert.deepEqual(r.setProps.cuts, r.setProps.fresh);
  for (const box of r.setProps.boxes) assert.deepEqual(box, { size: [250, 150], fresh: true });
});
