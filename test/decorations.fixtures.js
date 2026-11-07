/**
 * Decorations painted under a container that writes its DOM late: the page side of `decorations.test.js`. Each box waits before it fills, as a page the engine cuts does, and an inline decoration on the second box exists from the first state; once the chain has settled, its class must be painted.
 *
 * @packageDocumentation
 */

import { doc, p } from 'prosemirror-test-builder';
import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { FragmentedView, OverflowBox } from '../src/index.js';

const d = doc(...Array.from({ length: 12 }, (_, i) => p(`${i + 1}. A paragraph long enough to wrap over a few lines of a narrow box.`)));

/** @param {FragmentedView} view */
function settled(view) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (view.filling.size === 0 && !view.rippling && view.entries.every((e) => !e.dirty || !view.containers.has(e.key))) resolve(undefined);
      else if (performance.now() - started > 5000) reject(new Error('the chain did not settle'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

/** A box that waits before it fills, so its DOM is written after the fill has started. */
function lateBox() {
  const box = new OverflowBox({ width: 300, height: 200 });
  const fill = box.fill.bind(box);
  box.fill = async (doc, from, render) => { await new Promise((r) => setTimeout(r, 30)); return fill(doc, from, render); };
  return box;
}

export async function run() {
  document.body.style.font = '16px/20px serif';
  // A paragraph well inside the second box, found after a first chain is cut.
  const probe = new FragmentedView(document.body, { state: EditorState.create({ doc: d }), containers: () => new OverflowBox({ width: 300, height: 200 }) });
  await settled(probe);
  const second = probe.entries[1];
  const from = second.from + 10, to = from + 20;
  probe.destroy();
  probe.dom.remove();

  const comments = new Plugin({ props: { decorations: (state) => DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: 'test-comment' })]) } });
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: d, plugins: [comments] }), containers: lateBox });
  await settled(view);
  await new Promise((r) => requestAnimationFrame(r));
  const highlight = CSS.highlights.get('test-comment');
  const result = { boxes: view.entries.length, painted: highlight ? highlight.size : 0, text: highlight ? [...highlight].map((r) => { const range = document.createRange(); range.setStart(r.startContainer, r.startOffset); range.setEnd(r.endContainer, r.endOffset); return range.toString(); }).join('') : '', expected: view.state.doc.textBetween(from, to) };
  view.destroy();
  return result;
}
