/**
 * Elements inside a page that keep their own focus and events: the page side of `input.test.js`. The schema has one inline atom, `leaf`, whose `toDOM` draws what its `kind` names: a plain form control, a control inside a span, a nested editing host, a custom element holding an input in its shadow root, an element that stops its own events, an element that writes text to itself, a focusable element with no input of its own, and text.
 *
 * @packageDocumentation
 */

import { Schema } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';
import { EditorState, TextSelection } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { FragmentedView, OverflowBox } from '../src/index.js';

customElements.define('x-shadow', class extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' }).innerHTML = '<input class="in-shadow">';
  }
});

/** @type {Record<string, () => any>} */
const DRAWINGS = {
  // A fixed height, since a fallback font's glyph grows an `<input>` and a box that changes height is refilled, the control with it.
  input: () => ['input', { class: 'k-input', type: 'text', style: 'height: 24px; box-sizing: border-box' }],
  wrapped: () => ['span', { class: 'k-wrapped' }, ['input', { class: 'k-wrapped-input', type: 'text', style: 'height: 24px; box-sizing: border-box' }]],
  textarea: () => ['textarea', { class: 'k-textarea' }],
  select: () => ['select', { class: 'k-select' }, ['option', { value: 'a' }, 'a'], ['option', { value: 'b' }, 'b']],
  button: () => ['button', { class: 'k-button', type: 'button' }, ['span', { class: 'k-button-face' }, 'press']],
  nested: () => ['span', { class: 'k-nested' }, ['span', { class: 'k-nested-host', contenteditable: 'true' }, 'edit']],
  shadow: () => ['x-shadow', { class: 'k-shadow' }],
  stopper: () => {
    const el = document.createElement('span');
    el.className = 'k-stopper';
    el.tabIndex = 0;
    el.textContent = 'stops';
    for (const type of ['keydown', 'mousedown']) el.addEventListener(type, (e) => e.stopPropagation());
    return el;
  },
  writer: () => ['x-writer', { class: 'k-writer' }],
  focusable: () => ['span', { class: 'k-focusable', tabindex: '0' }, 'focusable'],
  link: () => ['a', { class: 'k-link', href: '#nowhere' }, 'link'],
  text: () => ['dm-variable', { class: 'k-text' }, 'Rome'],
};

const leaf = { group: 'inline', inline: true, atom: true, selectable: true, attrs: { kind: {} }, toDOM: (/** @type {any} */ n) => DRAWINGS[n.attrs.kind]() };
/** Focusable elements that hold the document's own text: a mark, a block with a content hole, a hole that is an editing host inside an uneditable wrapper, and a hole beside a button. */
const holders = {
  tabblock: { group: 'block', content: 'inline*', toDOM: () => ['div', { class: 'k-tabblock', tabindex: '0' }, 0] },
  captioned: { group: 'block', content: 'inline*', toDOM: () => ['figure', { contenteditable: 'false' }, ['figcaption', { class: 'k-caption', contenteditable: 'true' }, 0]] },
  buttoned: { group: 'block', content: 'inline*', toDOM: () => ['div', ['button', { class: 'k-beside', type: 'button' }, 'press'], ['div', { class: 'k-beside-hole' }, 0]] },
};
const schema = new Schema({
  nodes: basic.spec.nodes.addToEnd('leaf', leaf).append(holders),
  marks: basic.spec.marks.addToEnd('tab', { toDOM: () => ['span', { class: 'k-tab', tabindex: '0' }, 0] }),
});
const p = (/** @type {any[]} */ ...content) => schema.node('paragraph', null, content.map((c) => (typeof c === 'string' ? schema.text(c) : schema.node('leaf', { kind: c.kind }))));

/** A paragraph before a paragraph that starts with the leaf: Backspace at that leaf's position would join the two. */
const docWith = (/** @type {string} */ kind) => schema.node('doc', null, [p('The paragraph before it.'), p({ kind }, ' and some text after it.'), p('The paragraph after it.')]);

const TEXTS = { '.k-tab': 'mark text one', '.k-tab-two': 'mark text two', '.k-tabblock': 'block with a tabindex', '.k-caption': 'caption in a host', '.k-beside-hole': 'hole beside a button', '.k-plain': 'a plain paragraph' };
const tabbed = (/** @type {string} */ t) => schema.text(t, [schema.marks.tab.create()]);
const holdersDoc = () => schema.node('doc', null, [
  schema.node('paragraph', null, [schema.text('Some words, then '), tabbed(TEXTS['.k-tab']), schema.text(' and more words.')]),
  schema.node('tabblock', null, schema.text(TEXTS['.k-tabblock'])),
  schema.node('captioned', null, schema.text(TEXTS['.k-caption'])),
  schema.node('buttoned', null, schema.text(TEXTS['.k-beside-hole'])),
  schema.node('paragraph', null, schema.text(TEXTS['.k-plain'])),
  p({ kind: 'input' }, ' and text after the control.'),
  schema.node('paragraph', null, [schema.text('Other words, then '), tabbed(TEXTS['.k-tab-two']), schema.text('.')]),
]);

/** A box with a shadow root that slots its light children, as a page does. */
class ShadowBox extends OverflowBox {
  /** @param {any} options */
  constructor(options) {
    super(options);
    /** @type {ShadowRoot} */ (this.dom.attachShadow({ mode: 'open' })).innerHTML = '<div class="sheet"><slot></slot></div>';
  }
}

/** @type {FragmentedView | null} */
let view = null;
let writes = 0;
const write = Selection.prototype.setBaseAndExtent;
Selection.prototype.setBaseAndExtent = function (...args) { writes++; return write.apply(this, args); };

const settled = () => {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const v = /** @type {FragmentedView} */ (view);
      if (v.filling.size === 0 && v.entries.every((e) => !e.dirty || !v.containers.has(e.key))) resolve(undefined);
      else if (performance.now() - started > 5000) reject(new Error('the chain did not settle'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
};

const quiet = async () => { await new Promise((r) => setTimeout(r, 30)); await settled(); };

const describe = (/** @type {Element | null} */ el) => (!el ? null : el === view?.dom ? 'root' : el.className || el.nodeName);

/** What the tests read: the model, the focus, the browser's selection writes and the fills. */
function read() {
  const v = /** @type {FragmentedView} */ (view);
  const { selection } = v.state;
  return {
    doc: JSON.stringify(v.state.doc.toJSON()),
    text: v.state.doc.textContent,
    selection: `${selection.constructor.name} ${selection.from}-${selection.to}`,
    active: describe(document.activeElement),
    shadowActive: describe(document.activeElement?.shadowRoot?.activeElement ?? null),
    hasFocus: v.hasFocus(),
    composing: v.composing,
    pointer: !!v.pointer,
    writes,
    fills: [...v.fillCount.values()].reduce((a, b) => a + b, 0),
    html: v.dom.textContent,
  };
}

/**
 * A view on a document with one leaf of `kind`, in a box of a page's shape when `shadow`.
 * @param {string} kind
 * @param {{ shadow?: boolean }} [options]
 */
async function fresh(kind, { shadow = false } = {}) {
  view?.destroy();
  document.body.style.font = '16px/20px serif';
  const Box = shadow ? ShadowBox : OverflowBox;
  view = new FragmentedView(document.body, { state: EditorState.create({ doc: docWith(kind), plugins: [keymap(baseKeymap)] }), containers: () => new Box({ width: 500, height: 400 }) });
  await settled();
  view.focus();
  await quiet();
  writes = 0;
  return read();
}

/** A view on a document whose focusable elements hold its own text. */
async function freshHolders() {
  view?.destroy();
  document.body.style.font = '16px/20px serif';
  view = new FragmentedView(document.body, { state: EditorState.create({ doc: holdersDoc(), plugins: [keymap(baseKeymap)] }), containers: () => new OverflowBox({ width: 500, height: 600 }) });
  await settled();
  document.querySelector('.fragview p')?.setAttribute('class', '');
  view.dom.querySelectorAll('.k-tab')[1]?.classList.add('k-tab-two');
  view.dom.querySelectorAll('p')[1]?.classList.add('k-plain');
  return read();
}

/**
 * Where a click lands on the fifth character of the text a selector holds, and the model position of that character's start.
 * @param {keyof typeof TEXTS} selector
 */
function charOf(selector) {
  const v = /** @type {FragmentedView} */ (view);
  const walker = document.createTreeWalker(/** @type {Element} */ (v.dom.querySelector(selector)), NodeFilter.SHOW_TEXT);
  let text = /** @type {Text | null} */ (walker.nextNode());
  while (text && text.data !== TEXTS[selector]) text = /** @type {Text | null} */ (walker.nextNode());
  if (!text) throw new Error(`no text under ${selector}`);
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 5);
  const r = range.getBoundingClientRect();
  let start = -1;
  v.state.doc.descendants((n, pos) => { if (n.isText && n.text === TEXTS[selector]) start = pos; });
  return { x: r.left + 1, y: (r.top + r.bottom) / 2, pos: start + 4, typed: `${TEXTS[selector].slice(0, 4)}Z${TEXTS[selector].slice(4)}` };
}

/**
 * A model selection set by a transaction, as a remote peer or a plugin sets one.
 * @param {number} from
 * @param {number} [to]
 */
function select(from, to = from) {
  const v = /** @type {FragmentedView} */ (view);
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, from, to)));
  return read();
}

/** Bounding box of the middle of a run of text in the paragraph after the leaf. */
function pointInText() {
  const v = /** @type {FragmentedView} */ (view);
  const text = /** @type {Text} */ (v.dom.querySelectorAll('p')[2].firstChild);
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 5);
  const r = range.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: (r.top + r.bottom) / 2 };
}

/**
 * A clipboard event on an element, as the browser sends one; whether it was prevented and what was written to it.
 * @param {string} selector
 * @param {'copy' | 'cut' | 'paste'} type
 */
function clipboard(selector, type) {
  const data = new DataTransfer();
  if (type === 'paste') data.setData('text/plain', 'pasted');
  const event = new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true, composed: true });
  /** @type {Element} */ (document.querySelector(selector)).dispatchEvent(event);
  return { prevented: event.defaultPrevented, written: type === 'paste' ? '' : data.getData('text/plain'), ...read() };
}

/**
 * Text appended to the element itself, a few times over, as a component renders.
 * @param {string} selector
 */
async function selfWrites(selector) {
  const warned = console.warn;
  let warnings = 0;
  console.warn = () => { warnings++; };
  const el = /** @type {Element} */ (document.querySelector(selector));
  const before = read().fills;
  for (let i = 0; i < 6; i++) { el.append(`tick ${i} `); await quiet(); }
  console.warn = warned;
  return { fills: read().fills - before, warnings, shown: document.querySelector(selector)?.textContent };
}

/** Text changed in place in the atom's drawing. */
async function atomTextWrite() {
  const before = read().fills;
  /** @type {Text} */ (/** @type {Element} */ (document.querySelector('.k-text')).firstChild).data = 'Tiber';
  await quiet();
  return { fills: read().fills - before, shown: document.querySelector('.k-text')?.textContent };
}

/** A foreign write into ordinary text, in the paragraph that holds the leaf and in the one after. */
async function foreignWrite() {
  const v = /** @type {FragmentedView} */ (view);
  const model = v.state.doc.textContent;
  const before = read().fills;
  const paragraphs = v.dom.querySelectorAll('p');
  /** @type {Text} */ (paragraphs[1].lastChild).data = ' and written over.';
  await quiet();
  const beside = { fills: read().fills - before, drawn: v.dom.querySelectorAll('p')[1].textContent };
  const again = read().fills;
  v.dom.querySelectorAll('p')[2].append(' added by a stranger');
  await quiet();
  return { model, beside, added: { fills: read().fills - again, drawn: v.dom.querySelectorAll('p')[2].textContent } };
}

/** A deletion of most of the document, with the last page still answering its old positions: what the walk answers for its text in that window, and whether a foreign write there is an error and is drawn over. */
async function staleWindow() {
  const v = /** @type {FragmentedView} */ (view);
  /** @type {string[]} */
  const errors = [];
  const onError = (/** @type {ErrorEvent} */ e) => { errors.push(e.message); e.preventDefault(); };
  window.addEventListener('error', onError);
  const text = /** @type {Text} */ ([...v.dom.querySelectorAll('p')].at(-1)?.firstChild);
  const rect = /** @type {Element} */ (text.parentNode).getBoundingClientRect();
  const size = v.state.doc.content.size;
  v.dispatch(v.state.tr.delete(8, size - 2));
  const out = { connected: text.isConnected, size: v.state.doc.content.size, stale: /** @type {any} */ (null), leaf: /** @type {any} */ (null), coords: /** @type {any} */ (null), read: /** @type {any} */ (undefined), target: /** @type {any} */ (undefined) };
  out.stale = v.posAt(text, 0);
  try { out.leaf = v.leafAround(text); } catch (e) { out.leaf = String(e); }
  try { out.coords = v.posAtCoords({ left: rect.left + 2, top: rect.top + 5 }); } catch (e) { out.coords = String(e); }
  // The browser's selection read back from the stale page, and an input's target range there.
  v.focus();
  document.getSelection()?.setBaseAndExtent(text, 0, text, 1);
  try { v.readSelection(); out.read = null; } catch (e) { out.read = String(e); }
  const range = new StaticRange({ startContainer: text, startOffset: 0, endContainer: text, endOffset: 1 });
  out.target = v.targetRange(/** @type {any} */ ({ getTargetRanges: () => [range] }));
  text.data += ' written by a stranger';
  await new Promise((r) => setTimeout(r, 0));
  await quiet();
  window.removeEventListener('error', onError);
  return { ...out, errors, model: v.state.doc.textContent, shown: v.dom.textContent };
}

/** A long document, for `staleWindow`. */
async function freshLong() {
  view?.destroy();
  document.body.style.font = '16px/20px serif';
  const paragraphs = Array.from({ length: 12 }, (_, i) => p(`${i + 1}. A paragraph long enough to wrap over a few lines of a narrow box.`));
  // ponytail: the box's `fill` runs on a late promise here, so the last page is still drawn when the transaction returns.
  class LateBox extends OverflowBox {
    /** @param {any[]} args */
    fill(...args) { return new Promise((r) => setTimeout(r, 20)).then(() => /** @type {any} */ (OverflowBox.prototype.fill).apply(this, args)); }
  }
  view = new FragmentedView(document.body, { state: EditorState.create({ doc: schema.node('doc', null, paragraphs) }), containers: () => new LateBox({ width: 300, height: 200 }) });
  await settled();
  await quiet();
  return view.entries.length;
}

/** The members `EditorView` has and an ecosystem plugin reads at construction, on a view inside an open shadow root, alive and destroyed. */
function members() {
  view?.destroy();
  const host = document.body.appendChild(document.createElement('div'));
  const shadow = host.attachShadow({ mode: 'open' });
  const state = EditorState.create({ doc: docWith('text') });
  const v = new FragmentedView(shadow, { state, containers: () => new OverflowBox({ width: 300 }) });
  v.focus();
  const next = v.state.apply(v.state.tr.insertText('x', 1));
  v.updateState(next);
  const out = { root: v.root === shadow, aliased: v._root === v.root, focus: v.hasFocus(), props: v.props.state === next && v.props.containers != null, dragging: v.dragging, alive: v.isDestroyed };
  v.destroy();
  host.remove();
  return { ...out, destroyed: v.isDestroyed, detached: new FragmentedView(null, { state, containers: () => new OverflowBox() }).root === document };
}

/** `docView` while the view lives and after. */
function docViewLife() {
  const v = /** @type {FragmentedView} */ (view);
  const alive = !!/** @type {any} */ (v).docView;
  v.destroy();
  const gone = /** @type {any} */ (v).docView;
  view = null;
  return { alive, gone };
}

Object.assign(window, { fixture: { fresh, freshHolders, charOf, freshLong, staleWindow, read, select, pointInText, clipboard, selfWrites, atomTextWrite, foreignWrite, docViewLife, members, quiet } });
