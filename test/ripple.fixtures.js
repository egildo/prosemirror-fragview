/**
 * The ripple's pace in a real layout: the page side of `ripple.test.js`. A long flowing document of a few hundred paragraphs in fixed-height boxes, an Enter at the end of the first paragraph, and what the browser could paint before the ripple ended: the fills made before the next animation frame, the time to that frame, and the chain once settled against a fresh fill.
 *
 * @packageDocumentation
 */

import { doc, p } from 'prosemirror-test-builder';
import { EditorState, Plugin } from 'prosemirror-state';
import { FragmentedView, OverflowBox } from '../src/index.js';

const words = 'An edit that moves a cut refills every later page, and the reader should see the keystroke before the tail is done. ';
const d = doc(...Array.from({ length: 400 }, (_, i) => p(`${i + 1}. ${words.repeat(2).trim()}`)));

/**
 * Resolve when no entry is dirty and no fill is in flight.
 * @param {FragmentedView} view
 */
function settled(view) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (view.filling.size === 0 && view.entries.every((e) => !e.dirty)) resolve(undefined);
      else if (performance.now() - started > 20000) reject(new Error('the chain did not settle'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

/** @param {FragmentedView} view */
const cuts = (view) => view.entries.map((e) => [e.from, e.to]);

export async function run() {
  document.body.style.font = '16px/20px serif';
  let fills = 0;
  const containers = () => {
    const box = new OverflowBox({ width: 500, height: 400 });
    const fill = box.fill.bind(box);
    box.fill = (...args) => { fills++; return fill(...args); };
    return box;
  };
  // What a reads loop sees at every update: complete (no dirty entry, the last running to the end), or stopped short by its rule (a dirty entry, no fill in flight, no ripple pending).
  const seen = { complete: [], stoppedShort: 0, updates: 0 };
  const watch = new Plugin({
    view: () => ({
      update(view) {
        seen.updates++;
        const entries = view.entries;
        const dirty = entries.some((e) => e.dirty);
        if (!dirty && entries.at(-1).to == null) seen.complete.push({ doc: view.state.doc, cuts: cuts(view) });
        else if (dirty && view.filling.size === 0 && !view.rippling) seen.stoppedShort++;
      },
    }),
  });
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: d, plugins: [watch] }), containers });
  await settled(view);
  const pages = view.entries.length;

  // Enter at the end of the first paragraph: every cut after it moves.
  fills = 0;
  seen.complete.length = 0;
  seen.stoppedShort = 0;
  const t0 = performance.now();
  let frame = null;
  const framed = new Promise((resolve) => requestAnimationFrame(() => { frame = { fills, ms: performance.now() - t0, dirty: view.entries.filter((e) => e.dirty).length }; resolve(undefined); }));
  let task = null;
  setTimeout(() => { task = fills; }, 0);
  view.dispatch(view.state.tr.split(view.state.doc.child(0).nodeSize - 1));
  const dispatchMs = performance.now() - t0;
  await framed;
  await settled(view);
  const settledMs = performance.now() - t0;
  const total = fills;
  const after = cuts(view);
  const doc2 = view.state.doc;
  const completeSeen = seen.complete.filter((c) => c.doc === doc2).map((c) => c.cuts);

  const fresh = new FragmentedView(document.body, { state: EditorState.create({ doc: doc2 }), containers });
  await settled(fresh);
  const freshCuts = cuts(fresh);
  fresh.destroy();
  view.destroy();
  return { pages, frame, task, dispatchMs, settledMs, total, after, freshCuts, completeSeen, stoppedShort: seen.stoppedShort };
}
