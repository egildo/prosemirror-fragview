import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, r;
before(async () => {
  session = await open('test/blank.html');
  r = await session.page.evaluate(async () => (await import('/test/ripple.fixtures.js')).run());
  console.log(JSON.stringify({ pages: r.pages, frame: r.frame, task: r.task, dispatchMs: r.dispatchMs, settledMs: r.settledMs, total: r.total }));
});
after(() => session?.close());

test('an Enter on page 1 of a long document lets the browser paint before the last page refills', () => {
  assert.ok(r.pages > 40, `${r.pages} pages`);
  assert.ok(r.total > 40, `the Enter moved ${r.total} pages' cuts`);
  assert.ok(r.frame.fills < r.total, `${r.frame.fills} of ${r.total} fills before the first frame`);
  assert.ok(r.frame.dirty > 0, 'pages are still to refill at the first frame');
  assert.ok(r.task < 10, `${r.task} fills before the next task: the pages in view and one more`);
});

test('the settled chain equals a fresh fill of the same document', () => {
  assert.deepEqual(r.after, r.freshCuts);
});

test('a reads loop sees the chain complete only when it is, and never stopped short while it ripples', () => {
  assert.equal(r.stoppedShort, 0);
  assert.equal(r.completeSeen.length, 1);
  assert.deepEqual(r.completeSeen[0], r.freshCuts);
});
