/**
 * The pointer and the selection across pages: the page side of `selection.test.js`. Paragraphs in narrow boxes, so a selection can span several pages; a press of the secondary button, a triple click, and a plugin's `createSelectionBetween`.
 *
 * @packageDocumentation
 */

import { doc, p } from 'prosemirror-test-builder';
import { EditorState, Plugin, Selection, TextSelection } from 'prosemirror-state';
import { FragmentedView, OverflowBox } from '../src/index.js';

const words = 'A paragraph long enough to wrap over several lines of a narrow box, and to be cut across two of them now and then. ';
const d = doc(...Array.from({ length: 12 }, () => p(words + words)));

/** @type {FragmentedView | null} */
let view = null;
/** The positions `createSelectionBetween` was asked for, and whether the plugin answers. */
const asked = /** @type {number[][]} */ ([]);
let answer = false;
const plugin = new Plugin({ props: { createSelectionBetween: (_v, $anchor, $head) => { asked.push([$anchor.pos, $head.pos]); return answer ? TextSelection.create($head.doc, $head.pos, $head.pos) : null; } } });

const settled = () => {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const v = /** @type {FragmentedView} */ (view);
      if (v.filling.size === 0 && !v.rippling && v.entries.every((e) => !e.dirty)) resolve(undefined);
      else if (performance.now() - started > 5000) reject(new Error('the chain did not settle'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
};
const quiet = async () => { await new Promise((r) => setTimeout(r, 30)); await settled(); };

async function fresh() {
  view?.destroy();
  asked.length = 0; answer = false;
  document.body.style.font = '16px/20px serif';
  view = new FragmentedView(document.body, { state: EditorState.create({ doc: d, plugins: [plugin] }), containers: () => new OverflowBox({ width: 300, height: 200 }) });
  await settled();
  view.focus();
  await quiet();
  return { entries: view.entries.length };
}

/** Select from `anchor` to `head` in the model and let the view draw it. */
async function select(/** @type {number} */ anchor, /** @type {number} */ head) {
  const v = /** @type {FragmentedView} */ (view);
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, anchor, head)));
  await quiet();
}

/** A mouse event over the text at `pos`. */
function press(/** @type {number} */ pos, /** @type {Record<string, any>} */ init) {
  const v = /** @type {FragmentedView} */ (view);
  const at = v.coordsAtPos(pos);
  const target = document.elementFromPoint(at.left + 1, (at.top + at.bottom) / 2) ?? v.dom;
  target.dispatchEvent(new MouseEvent('mousedown', { clientX: at.left + 1, clientY: (at.top + at.bottom) / 2, bubbles: true, cancelable: true, ...init }));
}

const read = async () => { await new Promise((r) => setTimeout(r, 100)); const s = /** @type {FragmentedView} */ (view).state.selection; return { anchor: s.anchor, head: s.head }; };

/** The first positions of the first and third paragraphs, and the layout facts. */
function spots() {
  const v = /** @type {FragmentedView} */ (view);
  const starts = [];
  v.state.doc.forEach((n, pos) => starts.push(pos + 1));
  return { starts, size: v.state.doc.content.size };
}

export async function rightClick() {
  const { starts } = spots();
  const anchor = starts[1] + 5, head = starts[6] + 5;
  await select(anchor, head);
  const v = /** @type {FragmentedView} */ (view);
  const spans = v.indexAt(anchor) !== v.indexAt(head);
  press(starts[3] + 5, { button: 2, buttons: 2, detail: 1 });
  await quiet();
  return { spans, anchor, head };
}

export async function triple() {
  const { starts } = spots();
  await select(starts[2], starts[2]);
  press(starts[4] + 10, { button: 0, buttons: 1, detail: 3 });
  await quiet();
  const v = /** @type {FragmentedView} */ (view);
  return { ...(await read()), start: starts[4], end: v.state.doc.resolve(starts[4]).end() };
}

export async function between() {
  const { starts } = spots();
  const v = /** @type {FragmentedView} */ (view);
  asked.length = 0; answer = true;
  // The pointer sets the head in the model, as a drag does.
  v.dom.dispatchEvent(new Event('focus'));
  press(starts[2] + 5, { button: 0, buttons: 1, detail: 1 });
  const at = v.coordsAtPos(starts[2] + 20);
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: at.left + 1, clientY: (at.top + at.bottom) / 2, buttons: 1, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { clientX: at.left + 1, clientY: (at.top + at.bottom) / 2, bubbles: true }));
  await quiet();
  return { asked: asked.length, ...(await read()) };
}

window.fixture = { fresh, spots, select, read, rightClick, triple, between };
