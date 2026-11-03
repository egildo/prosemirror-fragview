import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, r;
before(async () => {
  session = await open('test/blank.html');
  r = await session.page.evaluate(async () => (await import('/test/owner-document.fixtures.js')).run());
});
after(() => session?.close());

test('a view mounted in an iframe makes no node and no range in the main document', () => {
  assert.deepEqual(r.calls, []);
  assert.equal(r.foreign, 0);
});

test('in the iframe the view fills, keeps placeholders and takes input', () => {
  assert.ok(r.built > 0, `${r.built} boxes built`);
  assert.ok(r.placeholders > 0, `${r.placeholders} placeholders`);
  assert.match(r.text, /^1\. Apasted/);
});
