/**
 * Two views in one document, each with a `highlightScope`: the page side of `highlight-scope.test.js`. Both decorate a range with the same class and select a range; each must paint its own highlights, and destroying one leaves the other's.
 *
 * @packageDocumentation
 */

import { doc, p } from 'prosemirror-test-builder';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { FragmentedView, OverflowBox } from '../src/index.js';

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

const textOf = (/** @type {Highlight | undefined} */ h) => h ? [...h].map((r) => { const range = document.createRange(); range.setStart(r.startContainer, r.startOffset); range.setEnd(r.endContainer, r.endOffset); return range.toString(); }).join('') : null;

export async function run() {
  document.body.style.font = '16px/20px serif';
  const make = async (scope, word) => {
    const host = document.body.appendChild(document.createElement('div'));
    const d = doc(p(`${word} alpha ${word} beta`));
    const comments = new Plugin({ props: { decorations: (state) => DecorationSet.create(state.doc, [Decoration.inline(1, 1 + word.length, { class: 'mark' })]) } });
    const state = EditorState.create({ doc: d, plugins: [comments] });
    const view = new FragmentedView(host, { state: state.apply(state.tr.setSelection(TextSelection.create(d, 3, 8))), containers: () => new OverflowBox({ width: 300, height: 200 }), highlightScope: scope });
    await settled(view);
    await new Promise((r) => requestAnimationFrame(r));
    return view;
  };
  const a = await make('a', 'Apple');
  const b = await make('b', 'Banana');
  const names = [...CSS.highlights.keys()].sort();
  const result = {
    names,
    markA: textOf(CSS.highlights.get('mark-a')), markB: textOf(CSS.highlights.get('mark-b')),
    selA: textOf(CSS.highlights.get('fragview-selection-a')), selB: textOf(CSS.highlights.get('fragview-selection-b')),
    bare: CSS.highlights.has('mark') || CSS.highlights.has('fragview-selection'),
    styled: ['a', 'b'].map((s) => !!document.querySelector(`style[data-fragview="${s}"]`)),
  };
  a.destroy();
  result.afterDestroy = [...CSS.highlights.keys()].sort();
  b.destroy();
  result.afterBoth = [...CSS.highlights.keys()].sort();
  return result;
}
