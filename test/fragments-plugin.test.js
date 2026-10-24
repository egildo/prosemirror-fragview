import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from 'prosemirror-state';
import { doc, p, ul, li, schema } from 'prosemirror-test-builder';
import { fragmentsPlugin, fragmentsKey, refilled, appended, dirtied } from '../src/fragments-plugin.js';

/** A state whose chain is two clean entries cut at tag `<cut>`. */
function twoEntries(d) {
  let state = EditorState.create({ doc: d, plugins: [fragmentsPlugin()] });
  state = state.apply(appended(refilled(state.tr, 0, d.tag.cut), d.tag.cut));
  state = state.apply(refilled(state.tr, 1, null));
  return state;
}
const entries = (state) => fragmentsKey.getState(state).entries;

test('a new state starts with one dirty entry over the whole document', () => {
  const state = EditorState.create({ doc: doc(p('one')), plugins: [fragmentsPlugin()] });
  assert.deepEqual(entries(state), [{ key: 0, from: 0, to: null, dirty: true }]);
});

test('refilled sets to and clears dirty, appended adds a dirty entry, and neither enters the history', () => {
  const d = doc(p('one'), p('<cut>two'));
  let state = EditorState.create({ doc: d, plugins: [fragmentsPlugin()] });
  const tr = appended(refilled(state.tr, 0, d.tag.cut), d.tag.cut);
  assert.equal(tr.getMeta('addToHistory'), false);
  state = state.apply(tr);
  assert.deepEqual(entries(state), [{ key: 0, from: 0, to: 6, dirty: false }, { key: 1, from: 6, to: null, dirty: true }]);
  state = state.apply(refilled(state.tr, 1, null));
  assert.deepEqual(entries(state).map((e) => e.dirty), [false, false]);
});

test('an insert before an entry moves both its ends and leaves it clean', () => {
  const state = twoEntries(doc(p('o<a>ne'), p('two'), p('<cut>three'), p('four')));
  const next = state.apply(state.tr.insertText('XYZ', state.doc.tag.a));
  const [first, second] = entries(next);
  assert.equal(first.dirty, true);
  assert.deepEqual(second, { key: 1, from: state.doc.tag.cut + 3, to: null, dirty: false });
  // The finite first entry: an insert inside it moves its `to` and the second's `from` alike.
  assert.equal(first.to, state.doc.tag.cut + 3);
});

test('a refill whose `to` moved dirties the next entry and moves its `from`', () => {
  const state = twoEntries(doc(p('one'), p('two'), p('<cut>three')));
  const next = state.apply(refilled(state.tr, 0, 5));
  assert.deepEqual(entries(next)[1], { key: 1, from: 5, to: null, dirty: true });
  const ended = state.apply(refilled(state.tr, 0, null));
  assert.equal(entries(ended).length, 1);
});

test('a delete across an entry\'s end marks it dirty', () => {
  const state = twoEntries(doc(p('one'), p('t<a>wo'), p('<cut>th<b>ree')));
  const next = state.apply(state.tr.delete(state.doc.tag.a, state.doc.tag.b));
  const [first, second] = entries(next);
  assert.equal(first.dirty, true);
  assert.equal(second.dirty, true);
  assert.equal(first.to, state.doc.tag.a);
});

test('a delete wholly inside the second entry leaves the first clean and unmoved', () => {
  const state = twoEntries(doc(p('one'), ul(li(p('<cut>two')), li(p('th<a>re<b>e')))));
  const next = state.apply(state.tr.delete(state.doc.tag.a, state.doc.tag.b));
  assert.equal(entries(next)[0], entries(state)[0]);
  assert.equal(entries(next)[1].dirty, true);
});

test('a transaction that leaves the document alone changes nothing', () => {
  const state = twoEntries(doc(p('o<a>ne'), p('<cut>two')));
  const next = state.apply(state.tr.setMeta('anything', true).scrollIntoView());
  assert.equal(fragmentsKey.getState(next), fragmentsKey.getState(state));
});

test('undo maps the chain back', async () => {
  const { history, undo } = await import('prosemirror-history');
  const d = doc(p('o<a>ne'), p('<cut>two'));
  let state = EditorState.create({ doc: d, plugins: [history(), fragmentsPlugin()] });
  state = state.apply(appended(refilled(state.tr, 0, d.tag.cut), d.tag.cut));
  state = state.apply(state.tr.insertText('XY', d.tag.a));
  assert.equal(entries(state)[1].from, d.tag.cut + 2);
  undo(state, (tr) => { state = state.apply(tr); });
  assert.equal(entries(state)[1].from, d.tag.cut);
  assert.equal(state.doc.eq(d), true);
});

test('dirtied marks one entry dirty, with no step and outside the history', () => {
  const state = twoEntries(doc(p('one'), p('<cut>two')));
  const tr = dirtied(state.tr, 1);
  assert.equal(tr.getMeta('addToHistory'), false);
  assert.deepEqual(entries(state.apply(tr)).map((e) => e.dirty), [false, true]);
});

test('a change in the first word after a cut dirties the entry before it, and one past that word does not', () => {
  const d = doc(p('one two <cut>three<a> four <b>five'));
  const state = twoEntries(d);
  assert.deepEqual(entries(state.apply(state.tr.insertText('x', d.tag.a))).map((e) => e.dirty), [true, true]);
  assert.deepEqual(entries(state.apply(state.tr.delete(d.tag.cut, d.tag.cut + 2))).map((e) => e.dirty), [true, true]);
  assert.deepEqual(entries(state.apply(state.tr.insertText('x', d.tag.b))).map((e) => e.dirty), [false, true]);
});

test('an entry whose from reaches the end of the document is dropped, and the one before runs to the end', () => {
  const d = doc(p('one'), p('two <cut>three'));
  const state = twoEntries(d);
  const next = state.apply(state.tr.delete(d.tag.cut, d.content.size - 1));
  assert.deepEqual(entries(next), [{ key: 0, from: 0, to: null, dirty: true }]);
});

test('a mark added inside an entry marks it dirty, though its step map moves nothing, and leaves the other clean', () => {
  const state = twoEntries(doc(p('o<a>ne t<b>wo'), p('<cut>three')));
  const next = state.apply(state.tr.addMark(state.doc.tag.a, state.doc.tag.b, schema.marks.strong.create()));
  assert.deepEqual(entries(next).map((e) => [e.from, e.to, e.dirty]), [[0, state.doc.tag.cut, true], [state.doc.tag.cut, null, false]]);
});
