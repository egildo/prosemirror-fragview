import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, r;
before(async () => {
  session = await open('test/blank.html');
  r = await session.page.evaluate(async () => (await import('/test/decorations.fixtures.js')).run());
});
after(() => session?.close());

test('a decoration present from the first state is painted once a container that writes late has settled', () => {
  assert.ok(r.boxes > 1, `${r.boxes} boxes`);
  assert.equal(r.painted, 1);
  assert.equal(r.text, r.expected);
});
