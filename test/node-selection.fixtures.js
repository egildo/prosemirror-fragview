/**
 * What a node selection, a selection of several ranges and a node decoration show: the page side of `node-selection.test.js`. A blockquote long enough to be divided across boxes, a rule and an image are selected in turn, and the elements that carry `ProseMirror-selectednode` are counted against the boxes that show the node.
 *
 * @packageDocumentation
 */

import { doc, p, blockquote, hr, img } from 'prosemirror-test-builder';
import { EditorState, NodeSelection, Plugin, Selection, SelectionRange, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { FragmentedView, OverflowBox } from '../src/index.js';

/** A selection of two ranges, as a cell selection is, its visibility chosen. */
class TwoRanges extends Selection {
  constructor(/** @type {any} */ $a, /** @type {any} */ $b, /** @type {any} */ $c, /** @type {any} */ $d, visible = true) {
    super($a, $d, [new SelectionRange($a, $b), new SelectionRange($c, $d)]);
    this.shown = visible;
  }
  get visible() { return this.shown; }
  map(/** @type {any} */ d, /** @type {any} */ m) { return TextSelection.create(d, m.map(this.from), m.map(this.to)); }
  eq(/** @type {any} */ other) { return other === this; }
  toJSON() { return { type: 'two' }; }
}

const words = 'A quoted paragraph long enough to wrap over a few lines of a narrow box. ';
const d = doc(p('Before.'), blockquote(...Array.from({ length: 8 }, () => p(words))), hr(), p('An image ', img(), ' here.'), p('The last paragraph.'));

/** @param {FragmentedView} view */
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

export async function run() {
  document.body.style.font = '16px/20px serif';
  let decorated = null;
  const decorations = new Plugin({ props: { decorations: (state) => (decorated == null ? null : DecorationSet.create(state.doc, [Decoration.node(decorated, decorated + state.doc.nodeAt(decorated).nodeSize, { class: 'test-node' })])) } });
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: d, plugins: [decorations] }), containers: () => new OverflowBox({ width: 300, height: 200 }) });
  await settled(view);
  const quote = 9; // after 'Before.'
  const selected = () => [...document.querySelectorAll('.ProseMirror-selectednode')].map((el) => el.nodeName);
  const select = async (/** @type {any} */ sel) => { view.dispatch(view.state.tr.setSelection(sel)); await settled(view); };
  const r = {};
  const quoteEnd = quote + view.state.doc.nodeAt(quote).nodeSize;
  r.quoteBoxes = view.entries.filter((e) => e.from < quoteEnd && (e.to ?? Infinity) > quote).length;
  await select(NodeSelection.create(view.state.doc, quote));
  r.quote = selected();
  // A refill under the selection keeps the class on the new DOM.
  view.dispatch(view.state.tr.insertText('x', quote + 2));
  await settled(view);
  r.afterEdit = selected();
  const rule = quoteEnd + 1;
  await select(NodeSelection.create(view.state.doc, rule));
  r.rule = selected();
  let image = -1;
  view.state.doc.descendants((n, pos) => { if (n.type.name === 'image') image = pos; });
  await select(NodeSelection.create(view.state.doc, image));
  r.image = selected();
  await select(TextSelection.create(view.state.doc, 2));
  r.text = selected();

  const $ = (/** @type {number} */ pos) => view.state.doc.resolve(pos);
  const ranges = () => CSS.highlights.get('fragview-selection')?.size ?? 0;
  await select(new TwoRanges($(2), $(4), $(quote + 2), $(quote + 6)));
  r.twoRanges = ranges();
  await select(new TwoRanges($(2), $(4), $(quote + 2), $(quote + 6), false));
  r.invisible = ranges();

  decorated = quote;
  view.dispatch(view.state.tr);
  await settled(view);
  r.decorated = document.querySelectorAll('.test-node').length;
  decorated = null;
  view.dispatch(view.state.tr);
  await settled(view);
  r.undecorated = document.querySelectorAll('.test-node').length;
  view.destroy();
  return r;
}
