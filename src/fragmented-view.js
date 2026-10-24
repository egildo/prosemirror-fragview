/**
 * `FragmentedView`: an `EditorState` rendered into a chain of fragmentainers, speaking `EditorView`'s protocol to the same plugins.
 *
 * @remarks
 * Constructed as `EditorView` is, with one more prop, `containers`, the `ContainerFactory` the view asks for each fragmentainer. The chain lives in the state through `fragmentsPlugin`; the constructor and `updateState` add the plugin when the state lacks it, so an app's `dispatchTransaction` must apply to `view.state` (`view.updateState(view.state.apply(tr))`), not to a copy of the state it kept.
 *
 * Rendering. After every state, the dirty entries are filled in order through their containers. `fill` writes its DOM before its first wait, so the fragment is rendered inside `updateState`; when its promise settles the view dispatches the `refilled` transaction, and when a fill cut and no entry follows, it asks the factory for the next container and appends its entry. Phase 1 re-renders the whole fragment on every transaction that changes the document; phase 2 patches.
 *
 * Input. Every editing default is the model's: the root element is contenteditable so the browser draws the caret and moves it (arrows, clicks, Shift-extension), but no input is left to the browser's DOM editing. `keydown` asks `handleKeyDown` (the keymap plugins), and an unhandled key goes on to `beforeinput`, whose default is applied to the model and prevented: typed text through `handleTextInput`, Enter as a split, Shift-Enter as a parsed `<br>`, every deletion over the browser's own target range (a grapheme, a word, a join across blocks). The application is synchronous, so a key that arrives while a fill's promise is pending reads a state that already holds the key before it. `paste` goes through `handlePaste` with a slice parsed by the schema's `DOMParser`. `handleDOMEvents` runs first for every event the view listens to.
 *
 * Composition (an IME, a dead key on macOS) is left to the browser, and the view renders nothing while it lasts; at `compositionend` the textblock under the caret is parsed back and diffed against the model. This is the minimum that keeps the text; phase 5 reads it back properly.
 *
 * Decorations. Inline decorations with a class are painted with the CSS Custom Highlight API (one `Highlight` per class, named by the class, so author CSS styles them with `::highlight(name)`), and ignored where the browser lacks it. Widget and node decorations are ignored in phase 1. Highlight names are global to the page: two views painting one class name share one highlight.
 *
 * What the view does not do yet, besides the above: node views, `handleClick` and its kin, a node selection by clicking a leaf, drag and drop (both halves are refused), `scrollIntoView` on a transaction that asks for it, `transformPasted` and its kin, the `attributes` prop, and bidirectional text in `endOfTextblock`.
 *
 * @packageDocumentation
 */

import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { DOMParser as PMDOMParser, DOMSerializer, Slice } from 'prosemirror-model';
import { canSplit } from 'prosemirror-transform';
import { fragmentsPlugin, fragmentsKey, refilled, appended } from './fragments-plugin.js';
import { renderSlice, TRAILING_BREAK } from './slice-renderer.js';

/** @import { EditorState, Transaction, Plugin, PluginView } from 'prosemirror-state' */
/** @import { Node as PMNode } from 'prosemirror-model' */
/** @import { ContainerFactory, ContainerHint, Fragmentainer } from './fragmentainer.js' */
/** @import { Entry } from './fragments-plugin.js' */

/**
 * The props: `EditorView`'s direct props, read through `someProp` as `EditorView` reads them, and the factory.
 * @typedef {{ state: EditorState, containers: ContainerFactory, dispatchTransaction?: (this: FragmentedView, tr: Transaction) => void, [prop: string]: any }} FragmentedViewProps
 */

/** @typedef {{ node: globalThis.Node, offset: number }} DOMPoint */

/** The editing events the view answers itself; every other `beforeinput` is refused. */
const DELETES = /^delete(?!ByDrag)/;

/**
 * Add the chain's plugin to a state that lacks it.
 * @param {EditorState} state
 */
function withFragments(state) {
  return fragmentsKey.get(state) ? state : state.reconfigure({ plugins: [...state.plugins, fragmentsPlugin()] });
}

export class FragmentedView {
  /**
   * @param {HTMLElement | ((dom: HTMLElement) => void) | null} place Where the view's root element goes: appended to an element, or handed to a function.
   * @param {FragmentedViewProps} props
   */
  constructor(place, props) {
    /** @type {FragmentedViewProps} */
    this._props = props;
    /** @type {EditorState} */
    this.state = withFragments(props.state);
    /** The root element holding the fragments; it is the editing host. */
    this.dom = document.createElement('div');
    this.dom.className = 'fragview';
    // The text mechanics prosemirror-view's own stylesheet sets, so a typed space shows and lines wrap as they do there.
    Object.assign(this.dom.style, { whiteSpace: 'break-spaces', overflowWrap: 'break-word', fontVariantLigatures: 'none', fontFeatureSettings: '"liga" 0' });
    if (typeof place === 'function') place(this.dom);
    else if (place) place.appendChild(this.dom);
    this.dispatch = this.dispatch.bind(this);
    /** @type {Map<number, Fragmentainer>} */
    this.containers = new Map();
    /** @type {Map<number, ContainerHint | undefined>} */
    this.hints = new Map();
    /** The fill in flight per entry, so one state is not filled twice. @type {Map<number, { doc: PMNode, from: number }>} */
    this.filling = new Map();
    /** The browser is composing; nothing is rendered until it ends. */
    this.composing = false;
    this.editable = true;
    this.destroyed = false;
    /** @type {[globalThis.Node | null, number, globalThis.Node | null, number] | null} */
    this.lastSelection = null;
    /** @type {Set<string>} */
    this.highlightNames = new Set();
    /** @type {PluginView[]} */
    this.pluginViews = [];
    /** Measured: milliseconds the last `updateState` spent, rendering included. */
    this.lastUpdateMs = 0;

    /** @type {Record<string, (event: any) => void>} */
    this.handlers = {
      keydown: (e) => this.onKeyDown(e),
      beforeinput: (e) => this.onBeforeInput(e),
      paste: (e) => this.onPaste(e),
      compositionstart: (e) => this.onCompositionStart(e),
      compositionend: (e) => this.onCompositionEnd(e),
    };
    for (const [type, handler] of Object.entries(this.handlers)) this.dom.addEventListener(type, handler);
    this.onSelectionChange = () => { if (this.hasFocus()) this.readSelection(); };
    this.dom.ownerDocument.addEventListener('selectionchange', this.onSelectionChange);
    this.update(null);
  }

  /** @returns {ReadonlyArray<Entry & { container: Fragmentainer | undefined }>} */
  get fragments() {
    return /** @type {any} */ (fragmentsKey.getState(this.state)).entries.map((/** @type {Entry} */ e) => ({ ...e, container: this.containers.get(e.key) }));
  }

  /**
   * The fragment that shows `pos`: the first whose range holds it, a position at a cut belonging to the fragment after it.
   * @param {number} pos
   */
  fragmentAt(pos) {
    const all = this.fragments;
    return all.find((e) => pos >= e.from && (e.to == null || pos < e.to)) ?? all.find((e) => e.to === pos) ?? null;
  }

  /** @returns {ReadonlyArray<Entry>} */
  get entries() {
    return /** @type {any} */ (fragmentsKey.getState(this.state)).entries;
  }

  /** @param {Transaction} tr */
  dispatch(tr) {
    const dispatchTransaction = this._props.dispatchTransaction;
    if (dispatchTransaction) dispatchTransaction.call(this, tr);
    else this.updateState(this.state.apply(tr));
  }

  /** @param {EditorState} state */
  updateState(state) {
    const prev = this.state;
    this.state = withFragments(state);
    this.update(prev);
  }

  /** @param {Partial<FragmentedViewProps>} props */
  setProps(props) {
    this._props = { ...this._props, ...props };
    if (props.state) this.updateState(props.state);
    else this.update(this.state);
  }

  /**
   * Walk the direct props, then the state's plugins' props, as `EditorView` does: the first truthy answer of `f` (or the first prop present, when `f` is omitted) wins.
   * @param {string} name
   * @param {(value: any) => any} [f]
   */
  someProp(name, f) {
    const own = this._props[name];
    let value;
    if (own != null && (value = f ? f(own) : own)) return value;
    for (const plugin of this.state.plugins) {
      const prop = /** @type {any} */ (plugin.props)[name];
      if (prop != null && (value = f ? f(prop) : prop)) return value;
    }
    return undefined;
  }

  hasFocus() {
    const active = this.dom.ownerDocument.activeElement;
    return !!active && this.dom.contains(active);
  }

  focus() {
    this.dom.focus({ preventScroll: true });
    this.selectionToDOM();
  }

  /**
   * The state's change reaches the DOM: containers made or released to match the chain, dirty entries filled, the selection and the decorations drawn, the plugin views told.
   * @param {EditorState | null} prev
   */
  update(prev) {
    const started = performance.now();
    const entries = this.entries;
    const keys = new Set(entries.map((e) => e.key));
    for (const [key, container] of this.containers) {
      if (keys.has(key)) continue;
      container.release();
      container.dom.remove();
      this.containers.delete(key);
      this.hints.delete(key);
    }
    entries.forEach((entry, index) => {
      let container = this.containers.get(entry.key);
      if (!container) {
        const before = entries[index - 1];
        container = this._props.containers(index, before && this.hints.get(before.key), entries);
        container.moved.addEventListener('moved', () => {
          const current = this.entries.find((e) => e.key === entry.key);
          if (current && !this.composing) this.fill(current, true);
        });
        this.containers.set(entry.key, container);
      }
      const at = this.dom.children[index];
      if (at !== container.dom) this.dom.insertBefore(container.dom, at ?? null);
    });
    const editable = !this.someProp('editable', (f) => f(this.state) === false);
    if (editable !== this.editable || !prev) this.dom.contentEditable = String((this.editable = editable));
    if (!this.composing) for (const entry of entries) if (entry.dirty) this.fill(entry);
    this.selectionToDOM();
    this.paintDecorations();
    this.updatePluginViews(prev);
    this.lastUpdateMs = performance.now() - started;
  }

  /**
   * Fill one entry's container from its `from`, then record the answer as a transaction.
   * @param {Entry} entry
   * @param {boolean} [force] Fill even when this state is already being filled (late truth from `moved`).
   */
  fill(entry, force = false) {
    const doc = this.state.doc;
    const flight = this.filling.get(entry.key);
    if (!force && flight && flight.doc === doc && flight.from === entry.from) return;
    this.filling.set(entry.key, { doc, from: entry.from });
    const container = /** @type {Fragmentainer} */ (this.containers.get(entry.key));
    container.fill(doc, entry.from, renderSlice).then(({ to, next }) => {
      if (this.filling.get(entry.key)?.doc === doc) this.filling.delete(entry.key);
      if (this.destroyed || this.state.doc !== doc) return; // a later state is being filled
      const entries = this.entries;
      const at = entries.findIndex((e) => e.key === entry.key);
      if (at < 0 || entries[at].from !== entry.from) return;
      this.hints.set(entry.key, next);
      let tr = null;
      if (entries[at].dirty || entries[at].to !== to) tr = refilled(this.state.tr, entry.key, to);
      if (to != null && at === entries.length - 1) tr = appended(tr ?? this.state.tr, to);
      if (tr) this.dispatch(tr);
    }, (error) => {
      this.filling.delete(entry.key);
      queueMicrotask(() => { throw error; });
    });
  }

  /** @param {EditorState | null} prev */
  updatePluginViews(prev) {
    if (!prev || prev.plugins !== this.state.plugins) {
      for (const view of this.pluginViews) view.destroy?.();
      this.pluginViews = this.state.plugins.filter((p) => p.spec.view).map((p) => /** @type {any} */ (p.spec.view)(this));
    } else {
      for (const view of this.pluginViews) view.update?.(/** @type {any} */ (this), prev);
    }
  }

  // ---- Geometry, both ways ----

  /**
   * The DOM point that shows `pos`, or null when no fragment shows it.
   * @param {number} pos
   * @returns {DOMPoint | null}
   */
  pointAt(pos) {
    for (const entry of this.entries) {
      if (pos < entry.from || (entry.to != null && pos > entry.to)) continue;
      const point = this.containers.get(entry.key)?.pointAt(pos);
      if (point) return point;
    }
    return null;
  }

  /**
   * The position a DOM point stands for, or null when the point is not in a fragment.
   * @param {globalThis.Node} node
   * @param {number} offset
   * @returns {number | null}
   */
  posAt(node, offset) {
    if (node === this.dom) {
      const entry = this.entries[offset];
      return entry ? entry.from : this.state.doc.content.size;
    }
    for (const container of this.containers.values()) if (container.dom.contains(node)) return container.posAt(node, offset);
    return null;
  }

  /**
   * @param {number} pos
   * @returns {DOMPoint}
   * @throws {RangeError} When no fragment shows `pos`.
   */
  domAtPos(pos) {
    const point = this.pointAt(pos);
    if (!point) throw new RangeError(`Position ${pos} is not shown by any fragment`);
    return point;
  }

  /**
   * @param {globalThis.Node} node
   * @param {number} offset
   * @returns {number}
   * @throws {RangeError} When the point is not inside a fragment.
   */
  posAtDOM(node, offset) {
    const pos = this.posAt(node, offset);
    if (pos == null) throw new RangeError('DOM position not inside a fragment');
    return pos;
  }

  /**
   * The element that renders the node starting at `pos`; null for a text node, or when no fragment shows it.
   * @param {number} pos
   */
  nodeDOM(pos) {
    const node = this.state.doc.nodeAt(pos);
    const point = node && !node.isText ? this.pointAt(pos) : null;
    const child = point && point.node.nodeType === 1 ? point.node.childNodes[point.offset] : null;
    return child && child.nodeType === 1 ? child : null;
  }

  /**
   * The viewport rectangle of `pos`: a zero-width box at the caret's place, on the side of the character after it when there is one (`side` ≥ 0) and before it otherwise.
   * @param {number} pos
   * @param {number} [side]
   */
  coordsAtPos(pos, side = 1) {
    const { node, offset } = this.domAtPos(pos);
    const range = document.createRange();
    if (node.nodeType === 3) {
      const length = /** @type {Text} */ (node).length;
      if (offset < length && (side >= 0 || offset === 0)) {
        range.setStart(node, offset); range.setEnd(node, offset + 1);
        const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
        return { left: rect.left, right: rect.left, top: rect.top, bottom: rect.bottom };
      }
      if (offset > 0) {
        range.setStart(node, offset - 1); range.setEnd(node, offset);
        const rects = range.getClientRects();
        const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
        return { left: rect.right, right: rect.right, top: rect.top, bottom: rect.bottom };
      }
    }
    const after = node.childNodes[offset], before = node.childNodes[offset - 1];
    const target = after ?? before;
    if (target?.nodeType === 3) {
      range.selectNodeContents(target);
      const rects = range.getClientRects();
      const rect = after ? rects[0] : rects[rects.length - 1];
      if (rect) { const x = after ? rect.left : rect.right; return { left: x, right: x, top: rect.top, bottom: rect.bottom }; }
    }
    const rect = /** @type {Element} */ (target?.nodeType === 1 ? target : node).getBoundingClientRect();
    const x = after || !target ? rect.left : rect.right;
    return { left: x, right: x, top: rect.top, bottom: rect.bottom };
  }

  /**
   * The position at viewport coordinates, through the browser's caret hit test; `inside` is the position of a leaf node under the point, else of the textblock the position lies in, else −1.
   * @param {{ left: number, top: number }} coords
   * @returns {{ pos: number, inside: number } | null}
   */
  posAtCoords({ left, top }) {
    const doc = /** @type {any} */ (this.dom.ownerDocument);
    let node = null, offset = 0;
    if (doc.caretPositionFromPoint) {
      const caret = doc.caretPositionFromPoint(left, top);
      if (caret) { node = caret.offsetNode; offset = caret.offset; }
    } else if (doc.caretRangeFromPoint) {
      const range = doc.caretRangeFromPoint(left, top);
      if (range) { node = range.startContainer; offset = range.startOffset; }
    }
    if (!node || !this.dom.contains(node)) return null;
    const pos = this.posAt(node, offset);
    if (pos == null) return null;
    const hit = doc.elementFromPoint(left, top);
    if (hit && hit !== this.dom && this.dom.contains(hit) && !hit.firstChild && hit.parentNode) {
      const leaf = this.posAt(hit.parentNode, Array.prototype.indexOf.call(hit.parentNode.childNodes, hit));
      if (leaf != null && this.state.doc.nodeAt(leaf)?.isLeaf) return { pos, inside: leaf };
    }
    const $pos = this.state.doc.resolve(pos);
    return { pos, inside: $pos.depth ? $pos.before() : -1 };
  }

  /**
   * Whether the cursor is at the end of its textblock in direction `dir`. Up and down read the rendered lines, as `prosemirror-view` does (a line box above or below the cursor's inside the block means no); the four horizontal directions answer from the model, start or end of the parent, which is `prosemirror-view`'s answer for text without right-to-left characters. Bidirectional text is not handled, and for a `state` whose document is not the rendered one, up and down fall back to the model's answer too.
   * @param {'up' | 'down' | 'left' | 'right' | 'forward' | 'backward'} dir
   * @param {EditorState} [state]
   */
  endOfTextblock(dir, state = this.state) {
    const { selection } = state;
    const vertical = dir === 'up' || dir === 'down';
    const $pos = vertical ? (dir === 'up' ? selection.$from : selection.$to) : selection.$head;
    if (!$pos.parent.isTextblock) return vertical;
    if (vertical && state.doc === this.state.doc) {
      const block = $pos.depth ? this.nodeDOM($pos.before()) : null;
      if (!block) return true;
      const coords = this.coordsAtPos($pos.pos);
      const range = document.createRange();
      range.selectNodeContents(block);
      for (const box of range.getClientRects()) {
        if (box.bottom <= box.top + 1) continue;
        if (dir === 'up' ? coords.top - box.top > (box.bottom - coords.top) * 2 : box.bottom - coords.bottom > (coords.bottom - box.top) * 2) return false;
      }
      return true;
    }
    const atStart = $pos.parentOffset === 0, atEnd = $pos.parentOffset === $pos.parent.content.size;
    return dir === 'left' || dir === 'backward' || dir === 'up' ? atStart : atEnd;
  }

  // ---- Selection ----

  /** Draw the model selection with the browser's own, when the view has focus. */
  selectionToDOM() {
    if (!this.hasFocus() || this.composing) return;
    const { selection } = this.state;
    let anchor, head;
    if (selection instanceof NodeSelection) {
      const dom = this.nodeDOM(selection.from);
      const parent = dom?.parentNode;
      if (!dom || !parent) return;
      const index = Array.prototype.indexOf.call(parent.childNodes, dom);
      anchor = { node: parent, offset: index };
      head = { node: parent, offset: index + 1 };
    } else {
      anchor = this.pointAt(selection.anchor);
      head = this.pointAt(selection.head);
    }
    if (!anchor || !head) return;
    const domSelection = /** @type {Selection} */ (this.dom.ownerDocument.getSelection());
    if (domSelection.anchorNode !== anchor.node || domSelection.anchorOffset !== anchor.offset || domSelection.focusNode !== head.node || domSelection.focusOffset !== head.offset) {
      domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    }
    this.lastSelection = [domSelection.anchorNode, domSelection.anchorOffset, domSelection.focusNode, domSelection.focusOffset];
  }

  /** Read the browser's selection back into the model when the browser moved it (a click, an arrow, a Shift-extension). */
  readSelection() {
    if (this.composing) return;
    const domSelection = this.dom.ownerDocument.getSelection();
    if (!domSelection || !domSelection.anchorNode || !this.dom.contains(domSelection.anchorNode) || !this.dom.contains(domSelection.focusNode)) return;
    const now = [domSelection.anchorNode, domSelection.anchorOffset, domSelection.focusNode, domSelection.focusOffset];
    if (this.lastSelection && now.every((v, i) => v === /** @type {any[]} */ (this.lastSelection)[i])) return;
    this.lastSelection = /** @type {any} */ (now);
    const anchor = this.posAt(domSelection.anchorNode, domSelection.anchorOffset);
    const head = this.posAt(/** @type {globalThis.Node} */ (domSelection.focusNode), domSelection.focusOffset);
    if (anchor == null || head == null) return;
    const { selection, doc } = this.state;
    if (selection.anchor === anchor && selection.head === head) return;
    this.dispatch(this.state.tr.setSelection(TextSelection.between(doc.resolve(anchor), doc.resolve(head))));
  }

  // ---- Decorations ----

  paintDecorations() {
    const highlights = /** @type {any} */ (globalThis).CSS?.highlights;
    if (!highlights) return; // no Custom Highlight API: decorations are ignored
    /** @type {Map<string, Range[]>} */
    const byClass = new Map();
    this.someProp('decorations', (f) => {
      const source = f(this.state);
      const sets = source?.find ? [source] : [];
      source?.forEachSet?.((/** @type {any} */ set) => sets.push(set));
      for (const set of sets) for (const deco of set.find()) {
        const name = deco.inline && deco.type.attrs?.class;
        const start = name && this.pointAt(deco.from), end = name && this.pointAt(deco.to);
        if (!start || !end) continue;
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        for (const cls of name.split(/\s+/).filter(Boolean)) {
          if (!byClass.has(cls)) byClass.set(cls, []);
          /** @type {Range[]} */ (byClass.get(cls)).push(range);
        }
      }
      return false; // every source is read
    });
    for (const name of this.highlightNames) if (!byClass.has(name)) highlights.delete(name);
    for (const [name, ranges] of byClass) highlights.set(name, new /** @type {any} */ (globalThis).Highlight(...ranges));
    this.highlightNames = new Set(byClass.keys());
  }

  // ---- Input ----

  /**
   * Run `handleDOMEvents` for the event; true when a handler took it.
   * @param {Event} event
   */
  custom(event) {
    return !!this.someProp('handleDOMEvents', (handlers) => {
      const handler = handlers[event.type];
      return handler ? handler(this, event) || event.defaultPrevented : false;
    });
  }

  /** @param {KeyboardEvent} event */
  onKeyDown(event) {
    if (this.custom(event) || this.composing || event.isComposing || event.keyCode === 229) return;
    this.readSelection();
    if (this.someProp('handleKeyDown', (f) => f(this, event))) event.preventDefault();
  }

  /** @param {InputEvent} event */
  onBeforeInput(event) {
    if (this.custom(event) || this.composing || event.isComposing) return;
    this.readSelection();
    event.preventDefault();
    if (!this.editable) return;
    const { state } = this;
    const type = event.inputType;
    if (type === 'insertText' || type === 'insertReplacementText') {
      const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
      const range = (type === 'insertReplacementText' && this.targetRange(event)) || state.selection;
      this.insertText(text, range.from, range.to);
    } else if (type === 'insertParagraph') {
      const tr = state.tr.deleteSelection();
      const { $from } = tr.selection;
      if ($from.parent.type.spec.code) tr.insertText('\n');
      else if (canSplit(tr.doc, $from.pos)) tr.split($from.pos);
      this.dispatch(tr.scrollIntoView());
    } else if (type === 'insertLineBreak') {
      const holder = document.createElement('div');
      holder.appendChild(document.createElement('br'));
      const slice = PMDOMParser.fromSchema(state.schema).parseSlice(holder, { context: state.selection.$from });
      if (slice.size) this.dispatch(state.tr.replaceSelection(slice).scrollIntoView());
    } else if (DELETES.test(type)) {
      if (!state.selection.empty) { this.dispatch(state.tr.deleteSelection().scrollIntoView()); return; }
      const range = this.targetRange(event);
      if (range && range.from < range.to) this.dispatch(state.tr.delete(range.from, range.to).scrollIntoView());
    }
    // Everything else (formatting commands, drops, history without the history plugin) is refused: the browser may not edit the fragment's DOM.
  }

  /**
   * The model range of the browser's target range for an input event.
   * @param {InputEvent} event
   */
  targetRange(event) {
    const [range] = event.getTargetRanges();
    if (!range) return null;
    const from = this.posAt(range.startContainer, range.startOffset), to = this.posAt(range.endContainer, range.endOffset);
    return from == null || to == null ? null : { from: Math.min(from, to), to: Math.max(from, to) };
  }

  /**
   * @param {string} text
   * @param {number} from
   * @param {number} to
   */
  insertText(text, from, to) {
    // Typed over a node or the whole document, the selection does not collapse by mapping; the caret goes after the text, as the browser puts it.
    const deflt = () => {
      const tr = this.state.tr.insertText(text, from, to);
      return tr.selection.empty ? tr : tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(to)), -1));
    };
    if (!this.someProp('handleTextInput', (f) => f(this, from, to, text, deflt))) this.dispatch(deflt().scrollIntoView());
  }

  /** @param {ClipboardEvent} event */
  onPaste(event) {
    if (this.custom(event)) return;
    event.preventDefault();
    if (!this.editable || !event.clipboardData) return;
    this.readSelection();
    const { state } = this;
    const $context = state.selection.$from;
    const html = event.clipboardData.getData('text/html'), text = event.clipboardData.getData('text/plain');
    const parser = this.someProp('clipboardParser') || this.someProp('domParser') || PMDOMParser.fromSchema(state.schema);
    let slice;
    if (html) {
      // An inert document: nothing in the pasted markup runs.
      const body = new globalThis.DOMParser().parseFromString(html, 'text/html').body;
      slice = parser.parseSlice(body, { context: $context });
    } else if (text) {
      const textParser = this.someProp('clipboardTextParser');
      if (textParser) slice = textParser(text, $context, false, this);
      else {
        const serializer = DOMSerializer.fromSchema(state.schema);
        const holder = document.createElement('div');
        for (const line of text.split(/(?:\r\n?|\n)+/)) {
          const p = holder.appendChild(document.createElement('p'));
          if (line) p.appendChild(serializer.serializeNode(state.schema.text(line, $context.marks())));
        }
        slice = parser.parseSlice(holder, { context: $context, preserveWhitespace: true });
      }
    } else return;
    slice = Slice.maxOpen(slice.content, true);
    if (this.someProp('handlePaste', (f) => f(this, event, slice))) return;
    const single = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1 ? slice.content.firstChild : null;
    const tr = single ? state.tr.replaceSelectionWith(single) : state.tr.replaceSelection(slice);
    this.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
  }

  /** @param {CompositionEvent} event */
  onCompositionStart(event) {
    if (this.custom(event)) return;
    this.readSelection();
    this.composing = true;
  }

  /** @param {CompositionEvent} event */
  onCompositionEnd(event) {
    const taken = this.custom(event);
    this.composing = false;
    if (!taken) this.readComposition();
    this.update(this.state);
  }

  /** Parse the textblock under the caret back from the DOM, and apply its difference from the model as one replace. */
  readComposition() {
    const domSelection = this.dom.ownerDocument.getSelection();
    const anchor = domSelection?.anchorNode;
    const pos = anchor ? this.posAt(anchor, domSelection.anchorOffset) : null;
    if (pos == null) return;
    const $pos = this.state.doc.resolve(pos);
    const block = $pos.depth && $pos.parent.isTextblock ? this.nodeDOM($pos.before()) : null;
    if (!block) return;
    const holder = document.createElement('div');
    holder.appendChild(block.cloneNode(true));
    const parsed = PMDOMParser.fromSchema(this.state.schema).parseSlice(holder, {
      preserveWhitespace: true,
      ruleFromNode: (dom) => (/** @type {Element} */ (dom).classList?.contains(TRAILING_BREAK) ? { ignore: true } : null),
    });
    const node = parsed.content.firstChild;
    if (!node || node.type !== $pos.parent.type || parsed.content.childCount !== 1) return;
    const before = $pos.parent.content, after = node.content;
    const start = before.findDiffStart(after);
    if (start == null) return;
    let { a: endA, b: endB } = /** @type {{ a: number, b: number }} */ (before.findDiffEnd(after));
    const overlap = start - Math.min(endA, endB);
    if (overlap > 0) { endA += overlap; endB += overlap; }
    const base = $pos.start();
    const tr = this.state.tr.replace(base + start, base + endA, new Slice(after.cut(start, endB), 0, 0));
    tr.setSelection(TextSelection.create(tr.doc, base + endB));
    this.lastSelection = null;
    this.dispatch(tr.scrollIntoView());
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [type, handler] of Object.entries(this.handlers)) this.dom.removeEventListener(type, handler);
    this.dom.ownerDocument.removeEventListener('selectionchange', this.onSelectionChange);
    for (const view of this.pluginViews) view.destroy?.();
    for (const container of this.containers.values()) container.release();
    const highlights = /** @type {any} */ (globalThis).CSS?.highlights;
    for (const name of this.highlightNames) highlights?.delete(name);
    this.containers.clear();
    this.dom.remove();
  }
}
