import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, r;
before(async () => {
  session = await open('test/blank.html');
  r = await session.page.evaluate(async () => (await import('/test/overflow-box.fixtures.js')).run());
});
after(() => session?.close());

test('an infinite box never cuts', () => {
  assert.equal(r.infinite, null);
});

test('a finite box cuts at the start of the first line that passes its foot, and shows only what it holds', () => {
  assert.ok(r.to > 0);
  assert.ok(r.lineAtCut.bottom > 130, `line at the cut ends at ${r.lineAtCut.bottom}`);
  assert.ok(r.lineBeforeCut.bottom <= 130, `line before the cut ends at ${r.lineBeforeCut.bottom}`);
  assert.equal(r.shownEnd, r.to);
});

test('the next box continues from the cut', () => {
  assert.ok(r.next > r.to);
  assert.equal(r.nextFirstText, r.fullFirstAfterCut);
});

test('a height change after the fill dispatches moved', () => {
  assert.equal(r.moved, true);
});

test('a box shorter than its first line still takes that line, and a chain of such boxes advances to the end', () => {
  assert.ok(r.forced.to > 1, `the cut at ${r.forced.to}`);
  assert.equal(r.forced.shown, r.forced.firstLine);
  assert.ok(r.chain.every((from, i) => i === 0 || from > r.chain[i - 1]), 'every cut is past the one before');
  assert.ok(r.chain.length > 10 && r.chain.length < 500, `${r.chain.length} boxes`);
});
