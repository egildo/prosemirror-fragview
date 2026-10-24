/**
 * The parity harness: one document mounted twice side by side, in an `EditorView` on the left and in a `FragmentedView` with one infinite `OverflowBox` on the right, each with its own state and the same plugin list. `window.harness` is what `scripts/parity.mjs` drives.
 *
 * @packageDocumentation
 */

import { Schema, DOMParser } from 'prosemirror-model';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { schema as basic } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { inputRules, wrappingInputRule } from 'prosemirror-inputrules';
import 'prosemirror-view/style/prosemirror.css';
import { FragmentedView, OverflowBox } from '../src/index.js';
import docHtml from './doc.html?raw';

const schema = new Schema({ nodes: addListNodes(basic.spec.nodes, 'paragraph block*', 'block'), marks: basic.spec.marks });

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
  keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo, 'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em) }),
  keymap(baseKeymap),
  inputRules({ rules: [wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote)] }),
  highlightWord,
];

function freshDoc() {
  const holder = document.createElement('div');
  holder.innerHTML = docHtml;
  return DOMParser.fromSchema(schema).parse(holder);
}
const freshState = () => EditorState.create({ doc: freshDoc(), plugins });

/** Milliseconds from a keydown to the end of the `updateState` of the first transaction that changed the document after it, per side; and the FragmentedView's own update time per such transaction. */
const timings = { left: [], right: [], rightUpdate: [] };
const pending = { left: null, right: null };

function instrument(side) {
  return function dispatchTransaction(tr) {
    this.updateState(this.state.apply(tr));
    if (tr.docChanged && pending[side] != null) {
      timings[side].push(performance.now() - pending[side]);
      if (side === 'right') timings.rightUpdate.push(this.lastUpdateMs);
      pending[side] = null;
    }
    paintToolbar();
  };
}

const left = new EditorView(document.getElementById('left'), { state: freshState(), dispatchTransaction: instrument('left') });
const right = new FragmentedView(document.getElementById('right'), { state: freshState(), containers: () => new OverflowBox(), dispatchTransaction: instrument('right') });
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

const fixed = freshDoc();

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
  left, right, timings, find, hash,
  reset() {
    left.updateState(freshState());
    right.updateState(freshState());
    timings.left.length = timings.right.length = timings.rightUpdate.length = 0;
    paintToolbar();
  },
  view: (side) => (side === 'left' ? left : right),
  snapshot: (side) => {
    const { state } = side === 'left' ? left : right;
    return { doc: state.doc.toJSON(), selection: state.selection.toJSON() };
  },
};
