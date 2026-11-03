/**
 * Atoms that render text, and a redraw by position: the page side of `atoms.test.js`. The schema has an inline atom, `variable`, whose text is not in the node: its `toDOM` reads the value from a store by the node's `id`, as a host's variables do. A click on the variable's text must select it, and a value changed in the store must show after `redraw` at the variable's position, refilling only the fragment that shows it.
 *
 * @packageDocumentation
 */

import { Schema } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';
import { EditorState, TextSelection } from 'prosemirror-state';
import { FragmentedView, OverflowBox } from '../src/index.js';

const values = new Map([['a', 'Rome'], ['b', 'Tiber']]);
const variable = { group: 'inline', inline: true, atom: true, selectable: true, attrs: { id: {} }, toDOM: (/** @type {any} */ n) => ['dm-variable', { 'data-id': n.attrs.id }, values.get(n.attrs.id) ?? '—'] };
const schema = new Schema({ nodes: basic.spec.nodes.addToEnd('variable', variable), marks: basic.spec.marks });
const para = (/** @type {string} */ t) => schema.node('paragraph', null, schema.text(t));
const d = schema.node('doc', null, [
  ...Array.from({ length: 12 }, (_, i) => para(`${i + 1}. A paragraph long enough to wrap over a few lines of a narrow box.`)),
  schema.node('paragraph', null, [schema.text('The city is '), schema.node('variable', { id: 'a' }), schema.text(' today, by '), schema.text('the river ', [schema.marks.strong.create()]), schema.node('variable', { id: 'b' }), schema.text('.')]),
]);

/** @param {FragmentedView} view */
function settled(view) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (view.filling.size === 0 && view.entries.every((e) => !e.dirty || !view.containers.has(e.key))) resolve(undefined);
      else if (performance.now() - started > 5000) reject(new Error('the chain did not settle'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

export async function run() {
  document.body.style.font = '16px/20px serif';
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: d }), containers: () => new OverflowBox({ width: 300, height: 200 }) });
  await settled(view);
  let at = -1;
  /** @type {number[]} */
  const vars = [];
  view.state.doc.descendants((n, pos) => { if (n.type.name === 'variable') vars.push(pos); });
  at = vars[0];
  const results = {};
  const el = /** @type {HTMLElement} */ (view.dom.querySelector('dm-variable'));
  results.editable = el.getAttribute('contenteditable');
  // `nodeDOM` of each variable: one after plain text, one after text in a mark.
  results.nodeDOM = vars.map((p) => view.nodeDOM(p)?.getAttribute('data-id') ?? null);

  // A click in the middle of the variable's text.
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
  el.scrollIntoView({ block: 'center' });
  const range = document.createRange();
  range.setStart(/** @type {Text} */ (el.firstChild), 2);
  range.setEnd(/** @type {Text} */ (el.firstChild), 3);
  const r = range.getBoundingClientRect();
  const point = { clientX: r.left, clientY: (r.top + r.bottom) / 2, bubbles: true, cancelable: true, button: 0, detail: 1 };
  el.dispatchEvent(new MouseEvent('mousedown', point));
  el.dispatchEvent(new MouseEvent('mouseup', point));
  const s = view.state.selection;
  results.clicked = `${s.constructor.name} ${s.from}-${s.to}`;
  results.at = at;

  // A longer value, redrawn at the variable's position only.
  const keys = view.entries.map((e) => e.key);
  const containers = keys.map((k) => view.containers.get(k));
  const fills = new Map(keys.map((k) => [k, view.fillCount.get(k)]));
  const holder = view.entries[view.indexAt(at)].key;
  values.set('a', 'the Eternal City, which was not built in a day');
  view.redraw(at);
  await settled(view);
  results.text = view.dom.querySelector('dm-variable')?.textContent;
  results.refilled = keys.filter((k) => view.fillCount.get(k) !== fills.get(k));
  results.holder = holder;
  results.kept = keys.every((k, i) => view.containers.get(k) === containers[i]);
  view.destroy();
  return results;
}
