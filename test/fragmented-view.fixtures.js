/**
 * The view's invalidation in a real layout: the page side of `fragmented-view.test.js`. A chain of boxes is built at one size, the size changes, and the view is told, once through `invalidate()` and once through `setProps` with a new factory; each time the chain is compared with a fresh view at the new size.
 *
 * @packageDocumentation
 */

import { doc, p, ol, li, img } from 'prosemirror-test-builder';
import { EditorState } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { FragmentedView, OverflowBox, AWAY_SHEET, CONTINUATION_SHEET, openedAt } from '../src/index.js';

const words = 'A change of conditions dirties every entry and every container of the chain '.repeat(4).trim();
const d = doc(...Array.from({ length: 12 }, (_, i) => p(`${i + 1}. ${words}`)));

/**
 * Resolve when no entry is dirty and no fill is in flight.
 * @param {FragmentedView} view
 */
function settled(view) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (view.filling.size === 0 && view.entries.every((e) => !e.dirty)) resolve(undefined);
      else if (performance.now() - started > 5000) reject(new Error('the chain did not settle'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

/** @param {FragmentedView} view */
const cuts = (view) => view.entries.map((e) => [e.from, e.to]);

/** Every entry's box: its size, and whether the factory made it after `old` was taken. @param {FragmentedView} view @param {Set<unknown>} old */
const boxes = (view, old) => view.fragments.map((f) => {
  const r = f.container?.dom.getBoundingClientRect();
  return { size: r ? [r.width, r.height] : null, fresh: !old.has(f.container) };
});

/** The cuts of a fresh view on `state` under boxes of `size`. @param {EditorState} state @param {number[]} size */
async function freshCuts(state, size) {
  const view = new FragmentedView(document.body, { state, containers: () => new OverflowBox({ width: size[0], height: size[1] }) });
  await settled(view);
  const out = cuts(view);
  view.destroy();
  return out;
}

export async function run() {
  document.body.style.font = '16px/20px serif';
  document.adoptedStyleSheets = [AWAY_SHEET, CONTINUATION_SHEET].map((text) => { const sheet = new CSSStyleSheet(); sheet.replaceSync(text); return sheet; });
  const results = {};
  let size = [300, 200];
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: d }), containers: () => new OverflowBox({ width: size[0], height: size[1] }) });
  await settled(view);
  results.before = cuts(view);

  // The door: the factory now makes boxes of another size, and the view is told.
  let old = new Set(view.fragments.map((f) => f.container));
  size = [400, 300];
  view.invalidate();
  await settled(view);
  results.invalidated = { cuts: cuts(view), boxes: boxes(view, old), fresh: await freshCuts(view.state, size), placeholders: view.placeholders.size };

  // Typing still works: a transaction refills the first box, which shows it.
  view.dispatch(view.state.tr.insertText('typed ', 1));
  await settled(view);
  results.typed = view.fragments[0].container?.dom.textContent.slice(0, 12);

  // A new factory through setProps invalidates too.
  old = new Set(view.fragments.map((f) => f.container));
  view.setProps({ containers: () => new OverflowBox({ width: 250, height: 150 }) });
  await settled(view);
  results.setProps = { cuts: cuts(view), boxes: boxes(view, old), fresh: await freshCuts(view.state, [250, 150]) };

  view.destroy();
  results.readOnly = readOnly();
  results.overFill = await redrawDuringFill();
  results.reach = await answeredReach();
  results.foreign = await foreignWrites();
  results.hint = await changedHint();
  results.ordinal = await absorbedBefore();
  results.rejected = await rejectedFill();
  results.lateImage = await lateImageAtTop();
  results.shows = await showsOutside();
  return results;
}

/** The keys a keymap edits with, on a view that is not editable and, as the control, on one that is. */
function readOnly() {
  const press = (editable) => {
    const state = EditorState.create({ doc: doc(p('one two')), plugins: [keymap(baseKeymap)] });
    const view = new FragmentedView(document.body, { state, editable: () => editable, containers: () => new OverflowBox() });
    const before = view.state.doc;
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const unchanged = view.state.doc.eq(before);
    view.destroy();
    return unchanged;
  };
  return { readOnly: press(false), editable: press(true) };
}

/** A box whose fill waits on a gate the fixture opens, so something can arrive while it is in flight. */
function gatedBox(gates, extra = {}) {
  const box = new OverflowBox({ width: 300, height: 200 });
  const fill = box.fill.bind(box);
  box.fill = async (...args) => {
    const answer = await fill(...args);
    await new Promise((resolve) => gates.push(resolve));
    return { ...answer, ...extra };
  };
  return box;
}

/** `redraw` while the page's fill is in flight: the page is filled again and ends clean, not left with the fill older than the ask. */
async function redrawDuringFill() {
  const gates = [];
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: doc(p('short')) }), containers: () => gatedBox(gates) });
  const key = view.entries[0].key;
  const open = async () => { while (gates.length) gates.shift()(); await new Promise((r) => setTimeout(r, 20)); };
  while (!(view.filling.size === 0 && view.entries.every((e) => !e.dirty))) await open();
  view.redraw(1);
  const started = view.fillCount.get(key);
  await new Promise((r) => setTimeout(r, 20));
  view.redraw(1); // the fill in flight began before this ask
  while (!(view.filling.size === 0 && view.entries.every((e) => !e.dirty))) await open();
  const out = { fillsAfterFirstAsk: view.fillCount.get(key) - started, dirty: view.entries[0].dirty };
  view.destroy();
  return out;
}

/** A fill's `reach` reaches the entry, and a change up to it refills the page before. */
async function answeredReach() {
  const gates = [];
  const body = 'A long enough run of words for a second box to hold the rest of it and more '.repeat(12);
  const state = EditorState.create({ doc: doc(p(body)) });
  const view = new FragmentedView(document.body, { state, containers: () => {
    const box = new OverflowBox({ width: 300, height: 100 });
    const fill = box.fill.bind(box);
    box.fill = async (...args) => { const a = await fill(...args); return a.to == null ? a : { ...a, reach: a.to + 40 }; };
    return box;
  } });
  await settled(view);
  const first = view.entries[0];
  const out = { reach: first.reach - first.to };
  const fills = view.fillCount.get(first.key);
  view.dispatch(view.state.tr.insertText('x', first.to + 30));
  out.dirtyPastTheWord = view.entries[0].dirty;
  await settled(view);
  out.refilled = view.fillCount.get(first.key) - fills;
  view.destroy();
  return out;
}

/** A refill that answers the same `to` under another hint: the next fragment was cut under the old one, so it is filled again, and a same hint ends the ripple. */
async function changedHint() {
  let hint = { carried: 1 };
  /** The hint each fill of the second box was handed. @type {any[]} */
  const handed = [];
  let made = 0;
  const body = 'A long enough run of words for a second box to hold the rest of it and more '.repeat(12);
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: doc(p(body)) }), containers: () => {
    const box = new OverflowBox({ width: 300, height: 100 });
    const fill = box.fill.bind(box);
    const index = made++;
    box.fill = async (...args) => { if (index === 1) handed.push(args[3]); const a = await fill(...args); return a.to == null ? a : { ...a, next: hint }; };
    return box;
  } });
  await settled(view);
  const [first, second, third] = view.entries;
  const counts = () => [first, second, third].map((e) => view.fillCount.get(e.key));
  const round = async () => {
    const before = counts();
    view.redraw(first.from + 1);
    await settled(view);
    return counts().map((n, i) => n - before[i]);
  };
  const out = { same: await round() };
  hint = { carried: 2 };
  out.changed = await round();
  out.handed = handed.map((h) => h?.carried ?? null);
  view.destroy();
  return out;
}

/** Writes that reach the fragment's text without passing the model are drawn over from the model; the view's own fills are not taken for them. */
async function foreignWrites() {
  const out = {};
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: doc(p('alpha beta gamma'), p('delta')) }), containers: () => new OverflowBox({ width: 300, height: 200 }) });
  await settled(view);
  const text = () => view.fragments[0].container.dom.textContent;
  const quiet = async () => { await new Promise((r) => setTimeout(r, 30)); await settled(view); };
  const key = view.entries[0].key;
  const count = () => view.fillCount.get(key);

  out.optOut = ['translate', 'data-gramm', 'data-gramm_editor', 'data-enable-grammarly', 'data-lt-active'].map((a) => view.dom.getAttribute(a));

  // The view's own fills count for nothing: a typed character is one fill, and idling after it none.
  let at = count();
  view.dispatch(view.state.tr.insertText('X', 1));
  await quiet();
  out.ownFills = count() - at;
  at = count();
  await quiet();
  out.idleFills = count() - at;

  // Text changed in place, at the same height.
  view.dom.querySelector('p').firstChild.data = 'Xalpha beta gammb';
  await quiet();
  out.inPlace = text();

  // execCommand reaches the DOM with no beforeinput the view could prevent.
  const node = view.dom.querySelector('p').firstChild;
  view.focus();
  const selection = view.dom.ownerDocument.getSelection();
  selection.setBaseAndExtent(node, 1, node, 1);
  view.dom.ownerDocument.execCommand('insertText', false, 'ZZ');
  out.execWrote = text().includes('ZZ');
  await quiet();
  out.execCommand = text();
  out.modelText = view.state.doc.textContent;

  // A later document gives the budget back.
  view.dispatch(view.state.tr.insertText('Y', 1));
  await quiet();
  view.dispatch(view.state.tr.delete(1, 2));
  await quiet();

  // A new text node, and text taken away.
  view.dom.querySelector('p').appendChild(view.dom.ownerDocument.createTextNode(' added'));
  await quiet();
  out.added = text();
  view.dom.querySelector('p').firstChild.remove();
  await quiet();
  out.removed = text();

  view.dispatch(view.state.tr.insertText('Y', 1));
  await quiet();
  view.dispatch(view.state.tr.delete(1, 2));
  await quiet();

  // Whole elements: execCommand's insertHTML, a span an extension adds, a block an extension removes. Each document is a new one, so the budget never runs out here.
  const fresh = async () => { view.dispatch(view.state.tr.insertText('Y', 1)); await quiet(); view.dispatch(view.state.tr.delete(1, 2)); await quiet(); };
  const first = view.dom.querySelector('p').firstChild;
  view.focus();
  selection.setBaseAndExtent(first, first.data.length, first, first.data.length);
  view.dom.ownerDocument.execCommand('insertHTML', false, '<b>bold</b>');
  out.htmlWrote = text().includes('bold');
  await quiet();
  out.insertHTML = text();
  await fresh();
  const span = view.dom.ownerDocument.createElement('span');
  span.append('span');
  view.dom.querySelector('p').append(span);
  await quiet();
  out.elementAdded = text();
  await fresh();
  view.dom.querySelectorAll('p')[1].remove();
  await quiet();
  out.blockRemoved = text();
  await fresh();

  // A writer that answers every redraw with another write stops being answered: the budget, per entry and per document.
  at = count();
  const writer = new MutationObserver(() => { const n = view.dom.querySelector('p')?.firstChild; if (n && !n.data.endsWith('!')) n.data += '!'; });
  writer.observe(view.dom, { childList: true, characterData: true, subtree: true });
  const warned = console.warn;
  let warnings = 0;
  console.warn = () => { warnings++; };
  view.dom.querySelector('p').firstChild.data += '!';
  await new Promise((r) => setTimeout(r, 200));
  console.warn = warned;
  writer.disconnect();
  out.loop = { fills: count() - at, warnings };
  view.destroy();
  return out;
}

/** A box of no foot that cuts before the first text starting with `cut`: a forced break, so an edit before it is absorbed by the page and the cut stays where it was. */
class ForcedBox extends OverflowBox {
  /** @param {any} doc @param {number} from @param {any} render */
  async fill(doc, from, render) {
    let to = null;
    doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => { if (to == null && pos > from && node.isText && node.text.startsWith('cut')) to = pos; });
    this.show(render(doc, from, to == null ? null : openedAt(doc, to), this.content.ownerDocument));
    this.to = to;
    return { to };
  }
}

/** A list cut by a forced break, and an item inserted before the cut, which the first page absorbs: the second page's ordinal and away siblings, against a fresh view's. */
async function absorbedBefore() {
  const make = (state) => new FragmentedView(document.body, { state, containers: () => new ForcedBox() });
  /** The second page's first displayed item's `value`, and the count of the items put away before it. @param {FragmentedView} view */
  const second = (view) => {
    const ol = view.fragments[1].container.dom.querySelector('ol');
    return { value: ol.querySelector('li:not([data-fragview~="away"])')?.getAttribute('value'), away: ol.querySelectorAll(':scope > [data-fragview~="away"]').length };
  };
  const d = doc(ol(li(p('one')), li(p('two')), li(p('three')), li(p('cut four')), li(p('five'))));
  const view = make(EditorState.create({ doc: d }));
  await settled(view);
  const before = second(view);
  view.dispatch(view.state.tr.insert(1, li(p('new'))));
  await settled(view);
  const after = second(view);
  const fresh = make(view.state.reconfigure({ plugins: [] }));
  await settled(fresh);
  const out = { before, after, fresh: second(fresh) };
  fresh.destroy();
  view.destroy();
  return out;
}

/** The second box's first fill rejects; `handleFillRejected` answers with the box filled again, and the chain goes on past it as a fresh view's does. */
async function rejectedFill() {
  const state = EditorState.create({ doc: d });
  /** @type {any[]} */
  const asked = [];
  let made = 0;
  const view = new FragmentedView(document.body, {
    state,
    containers: () => {
      const box = new OverflowBox({ width: 300, height: 200 });
      const fill = box.fill.bind(box);
      let failed = made++ !== 1;
      box.fill = (...args) => { if (!failed) { failed = true; return Promise.reject(new Error('the engine fell over')); } return fill(...args); };
      return box;
    },
    handleFillRejected: (/** @type {any} */ v, /** @type {any} */ error, /** @type {any} */ container, /** @type {number} */ from) => { asked.push([error.message, v === view || v instanceof FragmentedView]); return container.fill(v.state.doc, from, v.render); },
  });
  await settled(view);
  const out = { asked, cuts: cuts(view), fresh: await freshCuts(state, [300, 200]) };
  view.destroy();
  return out;
}

/** A box that cuts before the first image after its `from` and watches its height as `OverflowBox` does, so the image opens the next page. */
class ImageBox extends OverflowBox {
  /** @param {any} doc @param {number} from @param {any} render */
  async fill(doc, from, render) {
    let to = null;
    doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => { if (to == null && node.type.name === 'image' && openedAt(doc, pos) > from) to = openedAt(doc, pos); });
    this.show(render(doc, from, to, this.content.ownerDocument));
    this.to = to;
    this.filledHeight = this.content.getBoundingClientRect().height;
    this.observer?.observe(this.content);
    return { to };
  }
}

/** Late truth at a page's top: the image that opens the second page grows after its fill, and the page before is cut again with it, since a cut there may move back. */
async function lateImageAtTop() {
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: doc(p('alpha beta'), p(img({ src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }), 'tail')) }), containers: () => new ImageBox({ width: 300, height: 400 }) });
  await settled(view);
  const [first, second] = view.entries.map((e) => e.key);
  const before = [view.fillCount.get(first), view.fillCount.get(second)];
  const moved = new Promise((resolve) => { view.containers.get(second).moved.addEventListener('moved', resolve); setTimeout(resolve, 500); });
  view.containers.get(second).content.querySelector('img').style.height = '80px';
  await moved;
  await new Promise((r) => setTimeout(r, 30));
  await settled(view);
  const out = { pages: view.entries.length, before: view.fillCount.get(first) - before[0], itself: view.fillCount.get(second) - before[1] };
  view.destroy();
  return out;
}

/**
 * The second box answers that it shows a run lying inside the first box's range, as a page after a cut through a row shows an earlier item's rest, and the first box says it does not show that run. A mark there and a same-length replacement there refill the second box, and a caret there belongs to it; a position the first box shows stays the first's.
 */
async function showsOutside() {
  const body = 'A long enough run of words for a second box to hold the rest of it and more '.repeat(12);
  const state = EditorState.create({ doc: doc(p(body)) });
  const run = { from: 5, to: 15 };
  let made = 0;
  const view = new FragmentedView(document.body, { state, containers: () => {
    const box = new OverflowBox({ width: 300, height: 100 });
    const fill = box.fill.bind(box);
    const pointAt = box.pointAt.bind(box);
    const index = made++;
    if (index === 0) box.pointAt = (pos) => (pos >= run.from && pos < run.to ? null : pointAt(pos));
    if (index === 1) {
      box.fill = async (...args) => ({ ...(await fill(...args)), shows: { from: run.from, to: null } });
      box.pointAt = (pos) => (pos >= run.from && pos < run.to ? { node: box.dom, offset: 0 } : pointAt(pos));
    }
    return box;
  } });
  await settled(view);
  const [, second] = view.entries;
  const out = { shows: second.shows ?? null, indexInRun: view.indexAt(run.from + 2), indexBefore: view.indexAt(run.from - 2), indexAfterRun: view.indexAt(run.to + 2) };
  let fills = view.fillCount.get(second.key);
  view.dispatch(view.state.tr.addMark(run.from + 1, run.from + 4, view.state.schema.marks.em.create()));
  out.markDirtied = view.entries[1].dirty;
  await settled(view);
  out.markRefills = view.fillCount.get(second.key) - fills;
  fills = view.fillCount.get(second.key);
  view.dispatch(view.state.tr.insertText('XYZ', run.from + 1, run.from + 4));
  out.replaceDirtied = view.entries[1].dirty;
  await settled(view);
  out.replaceRefills = view.fillCount.get(second.key) - fills;
  view.destroy();
  return out;
}
