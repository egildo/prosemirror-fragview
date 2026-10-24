/**
 * The parity harness: one document mounted twice side by side, in an `EditorView` on the left and in a `FragmentedView` on the right, each with its own state and the same plugin list. `window.harness` is what `scripts/parity.mjs` and `scripts/chain.mjs` drive.
 *
 * The query string sets the right-hand side: `boxes=320x480` gives it a chain of `OverflowBox`es of that width and height (one infinite box without it), `window=near` builds only the boxes near the viewport, `long=1` mounts the document ten times over (4 240 words) on both sides, and `late=1` adds an image whose `src` (`late.svg`) arrives after the fill. `schema=generic` mounts the studio's schema lab under its generic schema instead (`generic.js`), with `marks=structured` (the default) or `marks=nodes`; `long` and `late` do not apply to it.
 *
 * The view takes the default words registry, since no sheet here selects on a paginator's words (the lab's own select on none), and the page adopts the renderer's two sheets for it, `AWAY_SHEET` and `CONTINUATION_SHEET`, and under the generic schema the lab's own. `harness.words` is the registry, for the scripts that read the words.
 *
 * @packageDocumentation
 */

import { Schema, DOMParser } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { schema as basic } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { inputRules, wrappingInputRule } from 'prosemirror-inputrules';
import 'prosemirror-view/style/prosemirror.css';
import { FragmentedView, OverflowBox, fragmentsKey, DEFAULT_WORDS, AWAY_SHEET, CONTINUATION_SHEET } from '../src/index.js';
import docHtml from './doc.html?raw';

const query = new URLSearchParams(location.search);
const boxes = query.get('boxes')?.split('x').map(Number) ?? null;
const near = query.get('window') === 'near';
const defaultTimes = query.get('long') === '1' ? 10 : 1;
const late = query.get('late') === '1';
if (boxes) document.body.classList.add('boxes');
const generic = query.get('schema') === 'generic' ? await (await import('./generic.js')).setup(query.get('marks') === 'nodes' ? 'nodes' : 'structured') : null;
if (generic) document.body.classList.add('generic');
document.adoptedStyleSheets = [AWAY_SHEET, CONTINUATION_SHEET, ...(generic ? [generic.css] : [])].map((text) => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
});

const schema = generic?.schema ?? new Schema({ nodes: addListNodes(basic.spec.nodes, 'paragraph block*', 'block'), marks: basic.spec.marks });
/** Bold and Italic: ProseMirror's toggle on the basic schema, the studio's instance toggle under structured marks, none under inline nodes. */
const toggle = (name) => (!schema.marks[name] ? () => false : generic ? generic.g.toggleStructured(schema.marks[name]) : toggleMark(schema.marks[name]));

/** Every occurrence of the word "fragment" as an inline decoration: the left draws spans, the right paints a highlight. */
const highlightWord = new Plugin({
  props: {
    decorations(state) {
      const found = [];
      state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        for (const m of node.text.matchAll(/fragment/g)) found.push(Decoration.inline(pos + m.index, pos + m.index + m[0].length, { class: 'hl-word' }));
      });
      return DecorationSet.create(state.doc, found);
    },
  },
});

const plugins = [
  history(),
  keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo, 'Mod-b': toggle('strong'), 'Mod-i': toggle('em') }),
  keymap(baseKeymap),
  ...(generic ? [] : [inputRules({ rules: [wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote)] })]),
  highlightWord,
];

/** The fixed document, or its content `times` over for the scaling measure; under the generic schema, the lab parsed once (a doc is immutable, and one parse keeps the instances the same on both sides). */
function freshDoc(times = defaultTimes) {
  if (generic) return generic.doc;
  const holder = document.createElement('div');
  holder.innerHTML = docHtml.repeat(times);
  // The late image, in the second paragraph, so its arrival moves the first box's cut.
  if (late) holder.querySelectorAll('p')[1].insertAdjacentHTML('afterbegin', '<img src="late.svg" alt="A late figure" title="late"> ');
  return DOMParser.fromSchema(schema).parse(holder);
}
const freshState = (times = defaultTimes) => EditorState.create({ doc: freshDoc(times), plugins });

/** Milliseconds from a keydown to the end of the `updateState` of the first transaction that changed the document after it, with the layout forced, per side; and the FragmentedView's own update time per such transaction. */
const timings = { left: [], right: [], rightUpdate: [], rightSettled: [] };
const pending = { left: null, right: null };
let settling = null;

/** Every fill of a box on the right, in order: the box's index in the chain, the `from` and `to`, and the milliseconds to its answer. */
const fills = [];
/** Every transaction on the right: when, whether it changed the document, its chain meta, and the chain it left before any fill. */
const transactions = [];
function logged(box) {
  const fill = box.fill.bind(box);
  box.fill = async (doc, from, render) => {
    const t = performance.now();
    const index = box.dom.parentNode ? Array.prototype.indexOf.call(box.dom.parentNode.children, box.dom) : -1;
    const result = await fill(doc, from, render);
    fills.push({ index, from, to: result.to, ms: performance.now() - t });
    return result;
  };
  return box;
}
const containers = () => logged(boxes ? new OverflowBox({ width: boxes[0], height: boxes[1] }) : new OverflowBox());

function instrument(side) {
  return function dispatchTransaction(tr) {
    const state = this.state.apply(tr);
    // The chain as the transaction left it, before the update fills anything: the mapped entries.
    if (side === 'right') transactions.push({ at: performance.now(), edit: tr.docChanged, meta: tr.getMeta(fragmentsKey) ?? null, chain: fragmentsKey.getState(state).entries.map(({ key, from, to, dirty }) => ({ key, from, to, dirty })) });
    this.updateState(state);
    if (tr.docChanged && pending[side] != null) {
      void this.dom.offsetHeight; // force the layout, so the time is the DOM's change laid out, on both sides
      timings[side].push(performance.now() - pending[side]);
      if (side === 'right') { timings.rightUpdate.push(this.lastUpdateMs); settling = pending.right; }
      pending[side] = null;
    }
    // The chain settled: the key's transaction and every refill it rippled into are rendered, and no fill is in flight.
    if (side === 'right' && settling != null && this.filling.size === 0) {
      void this.dom.offsetHeight;
      timings.rightSettled.push(performance.now() - settling);
      settling = null;
    }
    paintToolbar();
  };
}

const left = new EditorView(document.getElementById('left'), { state: freshState(), dispatchTransaction: instrument('left') });
const words = DEFAULT_WORDS;
const right = new FragmentedView(document.getElementById('right'), { state: freshState(), containers, words, window: near ? { build: 'near', margin: 1 } : { build: 'all' }, dispatchTransaction: instrument('right') });
for (const [side, view] of [['left', left], ['right', right]]) view.dom.addEventListener('keydown', () => { pending[side] = performance.now(); }, true);

function hash(value) {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function paintToolbar() {
  if (!left || !right) return;
  const a = hash(left.state.doc.toJSON()), b = hash(right.state.doc.toJSON());
  const bar = document.getElementById('toolbar');
  bar.innerHTML = `EditorView ${a} · FragmentedView ${b} · <span class="${a === b ? 'equal' : 'differ'}">${a === b ? 'equal' : 'differ'}</span>`;
}
paintToolbar();

const fixed = freshDoc(1);

/** The model position where `text` starts in the fixed document, in the `occurrence`-th text node holding it (0-based); both views start every act from that document. */
function find(text, occurrence = 0) {
  let found = null, seen = 0;
  fixed.descendants((node, pos) => {
    if (found != null || !node.isText) return found == null;
    const at = node.text.indexOf(text);
    if (at >= 0 && seen++ === occurrence) found = pos + at;
    return false;
  });
  if (found == null) throw new Error(`text not found: ${text}`);
  return found;
}

window.harness = {
  left, right, timings, find, hash, fills, transactions, generic, words,
  /** The chain as numbers: each entry's `from`, `to`, dirtiness and whether its fragment is built. */
  chain: () => right.fragments.map((e) => ({ key: e.key, from: e.from, to: e.to, dirty: e.dirty, built: !!e.container })),
  reset(times = defaultTimes) {
    left.updateState(freshState(times));
    right.updateState(freshState(times));
    timings.left.length = timings.right.length = timings.rightUpdate.length = timings.rightSettled.length = 0;
    fills.length = transactions.length = 0;
    paintToolbar();
  },
  /** Mount a document of the harness's schema on both sides, with the same plugins. */
  mount(doc) {
    left.updateState(EditorState.create({ doc, plugins }));
    right.updateState(EditorState.create({ doc, plugins }));
    fills.length = transactions.length = 0;
    paintToolbar();
  },
  view: (side) => (side === 'left' ? left : right),
  /** Focus a side and set its selection from `anchor` to `head`. */
  select(side, anchor, head) {
    const view = side === 'left' ? left : right;
    view.focus();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
  },
  snapshot: (side) => {
    const { state } = side === 'left' ? left : right;
    return { doc: state.doc.toJSON(), selection: state.selection.toJSON() };
  },
};
