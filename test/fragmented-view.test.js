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

test('in read-only mode no key reaches the keymaps', () => {
  assert.deepEqual(r.readOnly, { readOnly: true, editable: false });
});

test('a redraw during a fill is not lost: the page is filled again after the fill in flight, once, and ends clean', () => {
  assert.equal(r.overFill.dirty, false);
  assert.equal(r.overFill.fillsAfterFirstAsk, 1);
});

test('a reach answered by a fill reaches the entry, and a change past the first word and inside it refills the page', () => {
  assert.equal(r.reach.reach, 40);
  assert.equal(r.reach.dirtyPastTheWord, true);
  assert.ok(r.reach.refilled >= 1);
});

test('the view opts out of the writers that would edit around the model', () => {
  assert.deepEqual(r.foreign.optOut, ['no', 'false', 'false', 'false', 'false']);
});

test('the view takes none of its own fills for a foreign write', () => {
  assert.equal(r.foreign.ownFills, 1);
  assert.equal(r.foreign.idleFills, 0);
});

test('a foreign write at the same height is drawn over from the model, and the model is untouched', () => {
  assert.equal(r.foreign.execWrote, true, 'execCommand reached the DOM');
  const model = r.foreign.modelText;
  assert.equal(model, 'Xalpha beta gammadelta');
  for (const shown of [r.foreign.inPlace, r.foreign.execCommand, r.foreign.added, r.foreign.removed]) assert.equal(shown.replace(/\s+/g, ''), model.replace(/\s+/g, ''));
});

test('a writer that answers every redraw stops being answered, with one warning', () => {
  assert.ok(r.foreign.loop.fills <= 4, `${r.foreign.loop.fills} fills`);
  assert.equal(r.foreign.loop.warnings, 1);
});

test('a refill that keeps its to but changes its hint fills the next fragment, and a same hint does not', () => {
  assert.deepEqual(r.hint.same, [1, 0, 0]);
  assert.deepEqual(r.hint.changed.slice(0, 2), [1, 1], 'the changed hint reached the next fragment');
});

test('every fill is handed the hint the fragment before it answered, a refill the latest one', () => {
  assert.equal(r.hint.handed[0], 1);
  assert.equal(r.hint.handed.at(-1), 2);
});

test('an item inserted before a cut that the earlier page absorbs renumbers the later page, as a fresh view numbers it', () => {
  assert.deepEqual(r.ordinal.before, { value: '4', away: 3 });
  assert.deepEqual(r.ordinal.after, r.ordinal.fresh);
  assert.deepEqual(r.ordinal.fresh, { value: '5', away: 4 });
});

test('a fill that rejects is answered by handleFillRejected, and the pages after it are cut as a fresh view cuts them', () => {
  assert.deepEqual(r.rejected.asked, [['the engine fell over', true]]);
  assert.deepEqual(r.rejected.cuts, r.rejected.fresh);
  assert.ok(r.rejected.cuts.length > 2, `${r.rejected.cuts.length} boxes`);
});
