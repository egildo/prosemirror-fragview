/**
 * Home and End on a caret in a wrapped paragraph: the page side of `home-end.test.js`. Long paragraphs in narrow boxes, so every paragraph wraps and some are cut across boxes, and the boxes stack taller than the window, so the window scrolls.
 *
 * @packageDocumentation
 */

import { doc, p, img } from 'prosemirror-test-builder';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { FragmentedView, OverflowBox } from '../src/index.js';

const words = 'A paragraph long enough to wrap over several lines of a narrow box, and to be cut across two of them now and then. ';
const d = doc(p('Before.'), ...Array.from({ length: 30 }, () => p(words + words)), p('An image ', img(), ' here.'));

/** @type {FragmentedView | null} */
let view = null;
/** Whether the last Home or End keydown was prevented once every listener had run. */
let prevented = /** @type {boolean | null} */ (null);
window.addEventListener('keydown', (e) => { if (e.key === 'Home' || e.key === 'End') prevented = e.defaultPrevented; });

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
  document.body.style.font = '16px/20px serif';
  view = new FragmentedView(document.body, { state: EditorState.create({ doc: d }), containers: () => new OverflowBox({ width: 300, height: 200 }) });
  await settled();
  view.focus();
  await quiet();
}

/**
 * The visual line that holds `pos`: the positions of its textblock whose character after them (`coordsAtPos`'s side) stands in the same fragment at the same top.
 * @param {number} pos
 */
function lineOf(pos) {
  const v = /** @type {FragmentedView} */ (view);
  const $pos = v.state.doc.resolve(pos);
  const key = (/** @type {number} */ q) => `${v.indexAt(q)}:${Math.round(v.coordsAtPos(q).top)}`;
  const at = key(pos);
  const on = [];
  for (let q = $pos.start(); q <= $pos.end(); q++) if (key(q) === at) on.push(q);
  return { first: on[0], last: on[on.length - 1] };
}

/** The lines of the textblock that starts at `start` + 1, in order, each by its first and last position. */
function lines(/** @type {number} */ start) {
  const v = /** @type {FragmentedView} */ (view);
  const end = v.state.doc.resolve(start + 1).end();
  const out = [];
  for (let q = start + 1; q <= end;) { const line = lineOf(q); out.push(line); q = line.last + 1; }
  return out;
}

/** A paragraph that no cut divides, below the first screen so the window can scroll both ways, by its second line; and the first cut inside a paragraph, by the line before it and the entry that shows that line. */
function cases() {
  const v = /** @type {FragmentedView} */ (view);
  const { doc } = v.state;
  const entries = v.entries;
  const page = entries.findIndex((e, i) => i > 0 && e.to != null && doc.resolve(e.to).parent.isTextblock && doc.resolve(e.to).parentOffset > 0);
  const cut = /** @type {number} */ (entries[page].to);
  let whole = -1;
  doc.forEach((n, pos) => { if (whole < 0 && pos > /** @type {number} */ (entries[6].to) && entries.every((e) => e.to == null || e.to <= pos || e.to >= pos + n.nodeSize)) whole = pos; });
  return { wrapped: lines(whole)[1], cut, page, lastOfPage: lineOf(cut - 1) };
}

/**
 * Put a caret at `pos` (with an anchor, a range) and scroll the window so it stands in the middle.
 * @param {number} pos
 * @param {number} [anchor]
 */
async function place(pos, anchor = pos) {
  const v = /** @type {FragmentedView} */ (view);
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, anchor, pos)));
  await quiet();
  const { top } = v.coordsAtPos(pos);
  window.scrollBy(0, top - innerHeight / 2);
  await quiet();
  prevented = null;
  return read();
}

async function selectImage() {
  const v = /** @type {FragmentedView} */ (view);
  let image = -1;
  v.state.doc.descendants((n, pos) => { if (n.type.name === 'image') image = pos; });
  v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, image)));
  await quiet();
  v.dom.ownerDocument.defaultView?.scrollTo(0, 0);
  window.scrollBy(0, v.coordsAtPos(image).top - innerHeight / 2);
  await quiet();
  prevented = null;
  return read();
}

/** The model selection, the window's scroll, the last Home or End's prevention and the entry whose box holds the browser's caret. */
function read() {
  const v = /** @type {FragmentedView} */ (view);
  const { selection } = v.state;
  const focus = document.getSelection()?.focusNode ?? null;
  const box = v.entries.findIndex((e) => focus && v.containers.get(e.key)?.dom.contains(focus));
  return { kind: selection.constructor.name, anchor: selection.anchor, head: selection.head, scrollTop: document.scrollingElement?.scrollTop ?? 0, prevented, box, headBox: v.indexAt(selection.head) };
}

Object.assign(window, { fixture: { fresh, cases, place, selectImage, read: () => quiet().then(read) } });
