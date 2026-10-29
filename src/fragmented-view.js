/**
 * `FragmentedView`: an `EditorState` rendered into a chain of fragmentainers, speaking `EditorView`'s protocol to the same plugins.
 *
 * @remarks
 * Constructed as `EditorView` is, with two more props: `containers`, the `ContainerFactory` the view asks for each fragmentainer, and `words`, the words registry of the slice renderer it hands every fill (`sliceRenderer(words)`, built once; this package's own words when omitted). The plugin and the containers never see the registry: a container receives the renderer. The chain lives in the state through `fragmentsPlugin`; the constructor and `updateState` add the plugin when the state lacks it, so an app's `dispatchTransaction` must apply to `view.state` (`view.updateState(view.state.apply(tr))`), not to a copy of the state it kept.
 *
 * Rendering. After every state the view fills the first dirty entry, and only that one: `fill` writes its DOM before its first wait, so the fragment is rendered inside `updateState`, and when its promise settles the view dispatches the `refilled` transaction. That transaction is the ripple: an entry whose `to` lands where the mapping put it leaves the next entry as it was and the work ends; one whose `to` moved sets the next entry's `from` and marks it dirty, and the next update fills it. A fill that cut with no entry after it appends one, through the factory; an entry that comes to run to the end drops the ones after it. A fragment whose entry is clean keeps its DOM, rendered when its `from` was another number: the view translates its positions by the difference, which is uniform because no step touched the fragment's range.
 *
 * Invalidation. `invalidate()` says the conditions every fill was made under have changed (a page size, a stylesheet, a face that arrived late): every built container is released and its element removed, every placeholder and hint dropped, and every entry marked dirty by a `dirtied` transaction with no key, so the next update asks the factory for new containers and refills the chain from the first. The dirtiness goes through the plugin as every other chain change does, outside the history like the refills; the containers are the view's and are released on the view alone. The entries keep their keys and their ranges, which the ripple corrects. `setProps` invalidates when it is given a new `containers` or `words`.
 *
 * The window policy. `window: { build: 'all' }`, the default, builds every fragment. `window: { build: 'near', margin: 1 }` builds the fragments whose elements meet the browser's viewport, `margin` more on each side, and the one holding the selection's head; the others are entries with a placeholder in their place, as tall as the last built box, and the last entry, when it is unbuilt and runs to the end, stands for the rest of the document: as many boxes as the positions left divided by the mean span of the built ones. A dirty entry is filled when it is near or when a near entry follows it (the ripple must pass it to know where the near one starts), and a fragment filled only to be passed is unbuilt again. An `IntersectionObserver` on the placeholders asks for a new pass when one comes into view. `coordsAtPos` for a position in an unbuilt fragment answers an estimate, a point in the placeholder's box at the position's share of the entry's range, marked `estimate: true`, rather than building the fragment, because a geometry query that wrote DOM would let a read cause a fill, and the fill's answer arrives in a promise; `domAtPos` throws for it.
 *
 * Input. Every editing default is the model's: the root element is contenteditable so the browser draws the caret and moves it (arrows, clicks, Shift-extension), but no input is left to the browser's DOM editing. `keydown` asks `handleKeyDown` (the keymap plugins), and an unhandled key goes on to `beforeinput`, whose default is applied to the model and prevented: typed text through `handleTextInput`, Enter as a split, Shift-Enter as a parsed `<br>`, every deletion over the browser's own target range (a grapheme, a word, a join across blocks). The application is synchronous, so a key that arrives while a fill's promise is pending reads a state that already holds the key before it. `paste` goes through `handlePaste` with a slice parsed by the schema's `DOMParser`; `copy` and `cut` write the model's selection (the browser's holds only the head's fragment) as `prosemirror-view`'s clipboard does: `transformCopied`, `clipboardSerializer` and `clipboardTextSerializer` applied, and the slice's open depths and context in the first element's `data-pm-slice`; `paste` does not read that attribute yet. The arrow keys whose move involves a node selection are `prosemirror-view`'s own (`captureKeyDown`'s `selectHorizontally` and `selectVertically`): into and out of a block atom, over an inline one, and a click on a selectable atom selects it; every other arrow is the browser's. `handleDOMEvents` runs first for every event the view listens to.
 *
 * The selection. The model's selection is the truth, painted with the CSS Custom Highlight API as one `Highlight` named `fragview-selection`, one `StaticRange` per built fragment it crosses; the browser's own selection is made transparent inside the view and stays inside the fragment that holds the head, its anchor drawn at that fragment's edge when the model's anchor lies outside it. The browser still moves the head (arrows, Shift-extension, Shift-click across boxes, since every box is in one editing host), and a read-back takes the drawn edge for the model's anchor. A node selection the browser drops (it clears a range drawn around an uneditable block that holds no caret position, once layout changes under it) stands, since nothing but input moves one: no change of the browser's selection is read after it until the next draw or a press of the pointer. A position at a cut belongs to the next fragment: the caret stands at the start of the next box. ArrowLeft from there is the view's own move, one character back into the previous box, because the browser's move would land on the end of the previous box, the same position. The pointer is the view's own too: a single press records the model position it selects from (the model's anchor, with Shift), a move with the button held, or a scroll under it, sets the head to the position under the pointer, and nothing is read from the browser's own drag, which cannot cross a cut or survive a scrolled pane; a double or triple click is left to the browser.
 *
 * Composition (an IME, a dead key on macOS) is left to the browser, and the view renders nothing while it lasts; at `compositionend` the text it committed is inserted at the selection held since `compositionstart` (or since the first `insertCompositionText`, when no `compositionstart` reached the view), as a typed key's text is, and the fragment it was composed in is drawn again from the model. Nothing is read back from the DOM, as Slate and Lexical apply a composition. A composition set over a replacement range replaces it, since Chromium selects the range before `compositionstart`; an input method that recomposes text before the caret without selecting it (Android's keyboards set a composing region over the word with the selection collapsed) is not followed: its commit is inserted at the caret and the word it meant to replace stays. That case is reasoned, not measured: no CDP command sets such a region.
 *
 * Scrolling. A transaction that asks for it (`scrollIntoView`) scrolls the head's rectangle into the view of every scrolling ancestor, as `EditorView` does, with `scrollThreshold`, `scrollMargin` and `handleScrollToSelection` read as it reads them. The head may stand in a fragment still to be filled when the transaction is applied, so the scroll is made again at each update until the chain has settled up to the head.

Decorations. Inline decorations with a class are painted with the CSS Custom Highlight API (one `Highlight` per class, named by the class, so author CSS styles them with `::highlight(name)`), clipped to each built fragment, and ignored where the browser lacks the API. A fragment keeps its ranges while its DOM and the decorations over its range are unchanged, so a key repaints only what it refilled. Widget and node decorations are ignored. Highlight names are global to the page: two views painting one class name share one highlight, the selection's included.
 *
 * What the view does not do yet, besides the above: node views, `handleClick` and its kin, drag and drop (both halves are refused), `transformPasted` and its kin, the `attributes` prop, and bidirectional text in `endOfTextblock`.
 *
 * @packageDocumentation
 */

import { AllSelection, NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { DOMParser as PMDOMParser, DOMSerializer, Slice } from 'prosemirror-model';
import { canSplit } from 'prosemirror-transform';
import { fragmentsPlugin, fragmentsKey, refilled, appended, dirtied } from './fragments-plugin.js';
import { sliceRenderer, openedAt } from './slice-renderer.js';

/** @import { EditorState, Transaction, Plugin, PluginView } from 'prosemirror-state' */
/** @import { Node as PMNode } from 'prosemirror-model' */
/** @import { ContainerFactory, ContainerHint, Fragmentainer, SliceRenderer } from './fragmentainer.js' */
/** @import { Words } from './slice-renderer.js' */
/** @import { Entry } from './fragments-plugin.js' */

/**
 * Which fragments to build: every one, or those near the viewport.
 * @typedef {{ build: 'all' } | { build: 'near', margin?: number }} WindowPolicy
 */

/**
 * The props: `EditorView`'s direct props, read through `someProp` as `EditorView` reads them, the factory, the words registry and the window policy.
 * @typedef {{ state: EditorState, containers: ContainerFactory, words?: Partial<Words>, window?: WindowPolicy, dispatchTransaction?: (this: FragmentedView, tr: Transaction) => void, [prop: string]: any }} FragmentedViewProps
 */

/** @typedef {{ node: globalThis.Node, offset: number }} DOMPoint */

/** Whether the platform is a Mac, where Cmd plus an arrow moves by the line and not by a character. */
const MAC = /Mac/.test(globalThis.navigator?.platform ?? '');

/** The editing events the view answers itself; every other `beforeinput` is refused. */
const DELETES = /^delete(?!ByDrag)/;

/** The events that are the user acting on the view, counted to tell a selection change the user caused from one the browser made alone. */
const INPUTS = ['keydown', 'mousedown', 'touchstart', 'beforeinput', 'compositionstart', 'cut', 'paste', 'dragstart'];

/** The name of the highlight that paints the model's selection. */
export const SELECTION_HIGHLIGHT = 'fragview-selection';

/**
 * The view's default look for the selection, inserted first in the document's head so an author's sheet overrides it: the highlight painted, the browser's own selection transparent inside the view.
 * @param {Document} doc
 */
function installSelectionStyle(doc) {
  if (!(/** @type {any} */ (globalThis).CSS?.highlights) || doc.querySelector('style[data-fragview]')) return;
  const style = doc.createElement('style');
  style.dataset.fragview = '';
  style.textContent = `::highlight(${SELECTION_HIGHLIGHT}) { background-color: #b4d5fe; }\n.fragview ::selection { background-color: transparent; }`;
  doc.head.prepend(style);
}

/**
 * A `StaticRange` between two DOM points, for a highlight. A live `Range` would be updated by the browser on every DOM mutation for as long as its highlight holds it, a cost that grows with the ranges painted; the view repaints after every change, so nothing needs them live.
 * @param {DOMPoint} start
 * @param {DOMPoint} end
 */
function staticRange(start, end) {
  return new StaticRange({ startContainer: start.node, startOffset: start.offset, endContainer: end.node, endOffset: end.offset });
}

/**
 * Add the chain's plugin to a state that lacks it.
 * @param {EditorState} state
 */
function withFragments(state) {
  return fragmentsKey.get(state) ? state : state.reconfigure({ plugins: [...state.plugins, fragmentsPlugin()] });
}

/** The elements the clipboard's HTML needs a parent for, or `<tr>` and `<td>` copied alone are dropped when pasted: `prosemirror-view`'s wrapMap. @type {Record<string, string[]>} */
const WRAP = { thead: ['table'], tbody: ['table'], tfoot: ['table'], caption: ['table'], colgroup: ['table'], col: ['table', 'colgroup'], tr: ['table', 'tbody'], td: ['table', 'tbody', 'tr'], th: ['table', 'tbody', 'tr'] };

/**
 * A slice as the clipboard carries it, as `prosemirror-view`'s `serializeForClipboard` writes it: `transformCopied` applied, the slice's single-child levels that are open at both ends taken off the markup and listed in the first element's `data-pm-slice` (with the open depths) so that a ProseMirror editor pasting it puts it back where it came from, the content serialized by `clipboardSerializer` or the schema's, and the text by `clipboardTextSerializer` or the slice's, a blank line between blocks.
 * @param {FragmentedView} view
 * @param {Slice} slice
 */
function serializeForClipboard(view, slice) {
  view.someProp('transformCopied', (f) => { slice = f(slice, view); });
  let { content, openStart, openEnd } = slice;
  const context = [];
  while (openStart > 1 && openEnd > 1 && content.childCount === 1 && /** @type {PMNode} */ (content.firstChild).childCount === 1) {
    openStart--;
    openEnd--;
    const node = /** @type {PMNode} */ (content.firstChild);
    context.push(node.type.name, node.attrs !== node.type.defaultAttrs ? node.attrs : null);
    content = node.content;
  }
  const serializer = view.someProp('clipboardSerializer') || DOMSerializer.fromSchema(view.state.schema);
  const doc = document.implementation.createHTMLDocument('title'), wrap = doc.createElement('div');
  wrap.appendChild(serializer.serializeFragment(content, { document: doc }));
  let first = wrap.firstChild, wrappers = 0, needs;
  while (first && first.nodeType === 1 && (needs = WRAP[first.nodeName.toLowerCase()])) {
    for (let i = needs.length - 1; i >= 0; i--) {
      const wrapper = doc.createElement(needs[i]);
      while (wrap.firstChild) wrapper.appendChild(wrap.firstChild);
      wrap.appendChild(wrapper);
      wrappers++;
    }
    first = wrap.firstChild;
  }
  if (first && first.nodeType === 1) /** @type {Element} */ (first).setAttribute('data-pm-slice', `${openStart} ${openEnd}${wrappers ? ` -${wrappers}` : ''} ${JSON.stringify(context)}`);
  const text = view.someProp('clipboardTextSerializer', (f) => f(slice, view)) || slice.content.textBetween(0, slice.content.size, '\n\n', '\ufffc');
  return { html: wrap.innerHTML, text };
}

/**
 * The parent of a node for scrolling, through slots and shadow roots as `prosemirror-view`'s `parentNode` goes.
 * @param {globalThis.Node} node
 * @returns {globalThis.Node | null}
 */
function parentNode(node) {
  const parent = /** @type {any} */ (node).assignedSlot || node.parentNode;
  return parent && parent.nodeType === 11 ? parent.host : parent;
}

/**
 * Scroll every scrolling ancestor of `startDOM`, and the window, until `rect` (viewport coordinates) is inside it, as `prosemirror-view`'s `scrollRectIntoView` does, with the same `scrollThreshold` and `scrollMargin` props (a margin of 5 by default).
 * @param {FragmentedView} view
 * @param {{ left: number, right: number, top: number, bottom: number }} rect
 * @param {globalThis.Node} startDOM
 */
function scrollRectIntoView(view, rect, startDOM) {
  if (!(rect.top < rect.bottom || rect.left < rect.right) && rect.left === 0) return; // no CSS box
  const side = (/** @type {any} */ value, /** @type {'top' | 'right' | 'bottom' | 'left'} */ name) => (typeof value === 'number' ? value : value[name]);
  const threshold = view.someProp('scrollThreshold') || 0, margin = view.someProp('scrollMargin') || 5;
  const doc = view.dom.ownerDocument;
  for (let parent = /** @type {globalThis.Node | null} */ (startDOM); parent;) {
    if (parent.nodeType !== 1) { parent = parentNode(parent); continue; }
    const el = /** @type {HTMLElement} */ (parent);
    const atTop = el === doc.body;
    const bounding = atTop
      ? { left: 0, top: 0, right: doc.defaultView?.visualViewport?.width ?? doc.documentElement.clientWidth, bottom: doc.defaultView?.visualViewport?.height ?? doc.documentElement.clientHeight }
      : (() => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.left + el.clientWidth * (r.width / el.offsetWidth || 1), bottom: r.top + el.clientHeight * (r.height / el.offsetHeight || 1) }; })();
    let moveX = 0, moveY = 0;
    if (rect.top < bounding.top + side(threshold, 'top')) moveY = -(bounding.top - rect.top + side(margin, 'top'));
    else if (rect.bottom > bounding.bottom - side(threshold, 'bottom')) moveY = rect.bottom - rect.top > bounding.bottom - bounding.top ? rect.top + side(margin, 'top') - bounding.top : rect.bottom - bounding.bottom + side(margin, 'bottom');
    if (rect.left < bounding.left + side(threshold, 'left')) moveX = -(bounding.left - rect.left + side(margin, 'left'));
    else if (rect.right > bounding.right - side(threshold, 'right')) moveX = rect.right - bounding.right + side(margin, 'right');
    if (moveX || moveY) {
      if (atTop) doc.defaultView?.scrollBy(moveX, moveY);
      else {
        const startX = el.scrollLeft, startY = el.scrollTop;
        if (moveY) el.scrollTop += moveY;
        if (moveX) el.scrollLeft += moveX;
        const dX = el.scrollLeft - startX, dY = el.scrollTop - startY;
        rect = { left: rect.left - dX, top: rect.top - dY, right: rect.right - dX, bottom: rect.bottom - dY };
      }
    }
    const position = atTop ? 'fixed' : getComputedStyle(el).position;
    if (/^(fixed|sticky)$/.test(position)) break;
    parent = position === 'absolute' ? el.offsetParent : parentNode(el);
  }
}

export class FragmentedView {
  /**
   * @param {HTMLElement | ((dom: HTMLElement) => void) | null} place Where the view's root element goes: appended to an element, or handed to a function.
   * @param {FragmentedViewProps} props
   */
  constructor(place, props) {
    /** @type {FragmentedViewProps} */
    this._props = props;
    /** The slice renderer every fill is handed, for the `words` prop. @type {SliceRenderer} */
    this.render = sliceRenderer(props.words);
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
    /** The element standing in for each unbuilt entry. @type {Map<number, HTMLElement>} */
    this.placeholders = new Map();
    /** The `from` each built container was last filled from, against which its positions are translated. @type {Map<number, number>} */
    this.filledFrom = new Map();
    /** The height of the last built box, for the placeholders. */
    this.boxHeight = 0;
    /** The model anchor the browser's anchor was drawn for, and where. @type {{ node: globalThis.Node, offset: number, pos: number } | null} */
    this.drawnAnchor = null;
    /** @type {IntersectionObserver | null} */
    this.observer = null;
    /** How many fills each container has had, so a paint knows whether a fragment's DOM is the one it painted. @type {Map<number, number>} */
    this.fillCount = new Map();
    /** Per built fragment, the decoration ranges of its last paint. @type {Map<number, { fill: number | undefined, sig: string, ranges: [string, StaticRange][] }>} */
    this.painted = new Map();
    this.scheduled = false;
    /** The fill in flight per entry, so one state is not filled twice. @type {Map<number, { doc: PMNode, from: number }>} */
    this.filling = new Map();
    /** The browser is composing; nothing is rendered until it ends. */
    this.composing = false;
    /** A transaction asked for the selection to be scrolled into view and the chain has yet to settle: 'ask' before `handleScrollToSelection` has been asked, 'settle' after. @type {'ask' | 'settle' | null} */
    this.scrolling = null;
    /** The head's fragment and how many fills it had when the browser's selection was last drawn from the model. @type {string | null} */
    this.drawnFill = null;
    /** How many input events the view has seen, how many it had seen when the browser's selection was last drawn from the model, and whether the browser dropped a node selection drawn since (see `noteDrop`). */
    this.inputs = 0;
    this.drawnInputs = 0;
    this.dropped = false;
    /** The press the view owns until its release: the model position it selects from, the leaf under it, where the pointer last was, and whether a move has taken over the selection. @type {{ anchor: number, inside: number, left: number, top: number, moved: boolean } | null} */
    this.pointer = null;
    this.onPointerMove = (/** @type {MouseEvent} */ e) => this.onMouseMove(e);
    this.onPointerScroll = () => this.followPointer();
    this.onPointerUp = (/** @type {MouseEvent} */ e) => this.onMouseUp(e);
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
      copy: (e) => this.onCopy(e),
      cut: (e) => this.onCopy(e),
      compositionstart: (e) => this.onCompositionStart(e),
      compositionend: (e) => this.onCompositionEnd(e),
      mousedown: (e) => this.onMouseDown(e),
    };
    for (const [type, handler] of Object.entries(this.handlers)) this.dom.addEventListener(type, handler);
    this.countInput = (/** @type {Event} */ e) => { this.inputs++; if (e.type === 'mousedown' || e.type === 'touchstart') this.dropped = false; };
    for (const type of INPUTS) this.dom.addEventListener(type, this.countInput, true);
    this.onSelectionChange = () => { if (this.hasFocus()) this.noteDrop() || this.readSelection(); };
    this.dom.ownerDocument.addEventListener('selectionchange', this.onSelectionChange);
    installSelectionStyle(this.dom.ownerDocument);
    this.update(null);
  }

  /** @returns {WindowPolicy} */
  get windowPolicy() {
    return this._props.window ?? { build: 'all' };
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
    const at = this.indexAt(pos);
    return at < 0 ? null : this.fragments[at];
  }

  /**
   * The index of the entry that shows `pos`, by the rule of `fragmentAt`, or −1. A cut belongs to the entry after it, and so do the positions that open the nodes the cut is the first position of (from `openedAt` of the cut, exclusive), since the entry before shows none of those nodes.
   * @param {number} pos
   */
  indexAt(pos) {
    const all = this.entries;
    let at = all.findIndex((e) => pos >= e.from && (e.to == null || pos < e.to));
    if (at < 0) return all.findIndex((e) => e.to === pos);
    const to = all[at].to;
    if (to != null && at + 1 < all.length && pos > openedAt(this.state.doc, to)) at++;
    return at;
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

  /**
   * Merge props, as `EditorView.setProps` does. A new `containers` or `words` invalidates the chain, since a fragment rendered by the old factory or with the old words is stale.
   * @param {Partial<FragmentedViewProps>} props
   */
  setProps(props) {
    const old = this._props;
    this._props = { ...old, ...props };
    if ('words' in props && props.words !== old.words) this.render = sliceRenderer(props.words);
    const stale = ('containers' in props && props.containers !== old.containers) || ('words' in props && props.words !== old.words);
    if (props.state) this.updateState(props.state);
    else if (!stale) this.update(this.state);
    if (stale) this.invalidate();
  }

  /**
   * The conditions changed: release every built container, drop every placeholder and hint, and mark every entry dirty, so the chain is refilled from the first in containers the factory makes anew.
   */
  invalidate() {
    if (this.destroyed) return;
    for (const [key, container] of this.containers) this.unbuild(key, container, false);
    for (const placeholder of this.placeholders.values()) { this.observer?.unobserve(placeholder); placeholder.remove(); }
    this.placeholders.clear();
    this.hints.clear();
    this.dispatch(dirtied(this.state.tr));
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
   * The state's change reaches the DOM: containers released and placeholders placed to match the chain, the next dirty entry filled, the selection and the decorations drawn, the plugin views told.
   * @param {EditorState | null} prev
   */
  update(prev) {
    const started = performance.now();
    const entries = this.entries;
    const keys = new Set(entries.map((e) => e.key));
    for (const [key, container] of this.containers) if (!keys.has(key)) this.unbuild(key, container, false);
    for (const [key, placeholder] of this.placeholders) if (!keys.has(key)) { this.observer?.unobserve(placeholder); placeholder.remove(); this.placeholders.delete(key); }
    for (const key of this.hints.keys()) if (!keys.has(key)) this.hints.delete(key);
    this.place();
    const editable = !this.someProp('editable', (f) => f(this.state) === false);
    if (editable !== this.editable || !prev) this.dom.contentEditable = String((this.editable = editable));
    this.refresh();
    // As EditorView does, the browser's selection is written only when the state changed it or the fragment it stands in was drawn again: a refill of another fragment (a transaction with no selection) must not draw the model's selection over a click the browser has made and `selectionchange` has not yet reported.
    if (!prev || prev.doc !== this.state.doc || !prev.selection.eq(this.state.selection) || this.headFill() !== this.drawnFill) this.selectionToDOM();
    this.paint();
    this.updatePluginViews(prev);
    if (prev && /** @type {any} */ (this.state).scrollToSelection > /** @type {any} */ (prev).scrollToSelection) this.scrolling = 'ask';
    if (this.scrolling) this.followSelection();
    this.lastUpdateMs = performance.now() - started;
  }

  /**
   * Scroll the head into view for a transaction that asked (`scrollIntoView`), as `EditorView.scrollToSelection` does: `handleScrollToSelection` is asked once, then the head's rectangle (a node selection's node) is scrolled into the view of every scrolling ancestor. The head may stand in a fragment the ripple has yet to fill (Enter at a page's foot), or move when the fragments before it are refilled, so the scroll is made again at each update until the chain has settled.
   */
  followSelection() {
    const { selection } = this.state;
    const point = this.pointAt(selection.head);
    if (point) {
      if (this.scrolling === 'ask') {
        this.scrolling = 'settle';
        if (this.someProp('handleScrollToSelection', (f) => f(this))) this.scrolling = null;
      }
      if (this.scrolling) {
        const node = selection instanceof NodeSelection ? this.nodeDOM(selection.from) : null;
        if (!(selection instanceof NodeSelection)) scrollRectIntoView(this, this.coordsAtPos(selection.head, 1), point.node);
        else if (node) scrollRectIntoView(this, node.getBoundingClientRect(), point.node);
      }
    }
    // Settled for the head: no fill in flight and no dirty entry up to the head's (a dirty one after it moves nothing before it, and under the window policy stays dirty until it comes near).
    if (this.filling.size === 0 && !this.entries.slice(0, this.indexAt(selection.head) + 1).some((e) => e.dirty)) this.scrolling = null;
  }

  /** Put each entry's element in the chain's order: its container's root when it is built, else its placeholder. */
  place() {
    const entries = this.entries;
    const policy = this.windowPolicy;
    if (policy.build === 'near' && !this.observer) this.observer = new IntersectionObserver((records) => { if (records.some((r) => r.isIntersecting)) this.schedule(); });
    entries.forEach((entry, index) => {
      const el = this.containers.get(entry.key)?.dom ?? this.placeholder(entry, index === entries.length - 1);
      const at = this.dom.children[index];
      if (at !== el) this.dom.insertBefore(el, at ?? null);
    });
  }

  /**
   * The placeholder of an unbuilt entry, sized to the estimate.
   * @param {Entry} entry
   * @param {boolean} last
   */
  placeholder(entry, last) {
    let el = this.placeholders.get(entry.key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'fragview-placeholder';
      el.contentEditable = 'false';
      this.placeholders.set(entry.key, el);
      this.observer?.observe(el);
    }
    let boxes = 1;
    if (last && entry.to == null) {
      const spans = this.entries.filter((e) => !e.dirty && e.to != null).map((e) => /** @type {number} */ (e.to) - e.from);
      const mean = spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : 0;
      if (mean > 0) boxes = Math.max(1, Math.ceil((this.state.doc.content.size - entry.from) / mean));
    }
    const gap = parseFloat(getComputedStyle(this.dom).rowGap) || 0;
    el.style.height = boxes * this.boxHeight + (boxes - 1) * gap + 'px';
    return el;
  }

  /** A pass of `refresh` at the next frame, for the window policy's observer. */
  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      if (this.destroyed) return;
      this.place();
      this.refresh();
      this.paint();
    });
  }

  /**
   * The indices of the entries to build, or null when every one is built: those whose element meets the viewport, `margin` more each side, and the head's.
   * @returns {Set<number> | null}
   */
  near() {
    const policy = this.windowPolicy;
    if (policy.build !== 'near') return null;
    const margin = policy.margin ?? 1;
    const children = this.dom.children;
    const height = this.dom.ownerDocument.defaultView?.innerHeight ?? 0;
    let lo = Infinity, hi = -Infinity;
    // ponytail: the window's viewport, not a scrolling ancestor's; IntersectionObserver's records when the view sits in a scrolling pane.
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect();
      if (r.bottom > 0 && r.top < height) { lo = Math.min(lo, i); hi = Math.max(hi, i); }
    }
    const set = new Set();
    for (let i = Math.max(0, lo - margin); i <= Math.min(children.length - 1, hi + margin); i++) set.add(i);
    const head = this.indexAt(this.state.selection.head);
    if (head >= 0) set.add(head);
    return set;
  }

  /** Unbuild what is far, build what is near and clean, and fill the first dirty entry when the ripple must pass it. */
  refresh() {
    if (this.composing || this.destroyed) return;
    const entries = this.entries;
    const near = this.near();
    const isNear = (/** @type {number} */ i) => !near || near.has(i);
    const last = near ? Math.max(-1, ...near) : Infinity;
    const firstDirty = entries.findIndex((e) => e.dirty);
    entries.forEach((entry, i) => {
      const container = this.containers.get(entry.key);
      if (container && !isNear(i) && !this.filling.has(entry.key)) this.unbuild(entry.key, container, true);
      // A clean entry before the first dirty one starts where it says, so it can be built on its own.
      else if (!container && isNear(i) && !entry.dirty && (firstDirty < 0 || i < firstDirty)) this.fill(entry);
    });
    if (firstDirty >= 0 && firstDirty <= last) this.fill(entries[firstDirty]);
  }

  /**
   * Release a container; with `keep`, its entry stays and a placeholder takes its place.
   * @param {number} key
   * @param {Fragmentainer} container
   * @param {boolean} keep
   */
  unbuild(key, container, keep) {
    container.release();
    this.containers.delete(key);
    this.filledFrom.delete(key);
    this.filling.delete(key);
    if (keep) {
      const entries = this.entries;
      const at = entries.findIndex((e) => e.key === key);
      container.dom.replaceWith(this.placeholder(entries[at], at === entries.length - 1));
    } else container.dom.remove();
  }

  /**
   * Make the container of an entry, through the factory, in its placeholder's place.
   * @param {Entry} entry
   */
  build(entry) {
    const entries = this.entries;
    const index = entries.findIndex((e) => e.key === entry.key);
    const before = entries[index - 1];
    const container = this._props.containers(index, before && this.hints.get(before.key), entries);
    container.moved.addEventListener('moved', () => {
      if (this.containers.get(entry.key) === container && !this.destroyed) this.dispatch(dirtied(this.state.tr, entry.key));
    });
    this.containers.set(entry.key, container);
    const placeholder = this.placeholders.get(entry.key);
    if (placeholder) {
      this.observer?.unobserve(placeholder);
      placeholder.replaceWith(container.dom);
      this.placeholders.delete(entry.key);
    } else this.dom.insertBefore(container.dom, this.dom.children[index] ?? null);
    return container;
  }

  /**
   * Fill one entry's container from its `from`, building it first when it is not, then record the answer as a transaction.
   * @param {Entry} entry
   */
  fill(entry) {
    const doc = this.state.doc;
    const flight = this.filling.get(entry.key);
    if (flight && flight.doc === doc && flight.from === entry.from) return;
    const container = this.containers.get(entry.key) ?? this.build(entry);
    this.filling.set(entry.key, { doc, from: entry.from });
    this.filledFrom.set(entry.key, entry.from);
    this.fillCount.set(entry.key, (this.fillCount.get(entry.key) ?? 0) + 1);
    container.fill(doc, entry.from, this.render).then(({ to, next }) => {
      if (this.containers.get(entry.key) !== container) return; // released since, by an invalidation or a destroy: its answer is stale
      const mine = this.filling.get(entry.key);
      if (mine?.doc === doc && mine.from === entry.from) this.filling.delete(entry.key);
      if (this.destroyed || this.state.doc !== doc) return; // a later state is being filled
      const entries = this.entries;
      const at = entries.findIndex((e) => e.key === entry.key);
      if (at < 0 || entries[at].from !== entry.from) return;
      this.hints.set(entry.key, next);
      this.boxHeight = container.dom.offsetHeight;
      // A container may write its DOM after the wait (a page the engine cuts), so the answer of the fragment that holds the head draws the browser's selection again.
      if (this.entries[this.indexAt(this.state.selection.head)]?.key === entry.key) this.drawnFill = null;
      let tr = null;
      if (entries[at].dirty || entries[at].to !== to) tr = refilled(this.state.tr, entry.key, to);
      if (to != null && at === entries.length - 1) tr = appended(tr ?? this.state.tr, to);
      if (tr) this.dispatch(tr);
      else { this.refresh(); this.paint(); } // a clean fragment built again, with nothing to record
    }, (error) => {
      if (this.containers.get(entry.key) === container) this.filling.delete(entry.key);
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
    const entries = this.entries;
    const at = this.indexAt(pos);
    if (at < 0) return null;
    // A dirty entry waiting for the ripple may not show its mapped range yet; the entry before a cut shows the cut at its end.
    return this.containerPoint(entries[at], pos) ?? (at > 0 && /** @type {number} */ (entries[at - 1].to) >= pos ? this.containerPoint(entries[at - 1], pos) : null);
  }

  /**
   * The DOM point inside one entry's container that shows `pos`, its positions translated from the `from` it was filled at.
   * @param {Entry} entry
   * @param {number} pos
   * @returns {DOMPoint | null}
   */
  containerPoint(entry, pos) {
    const container = this.containers.get(entry.key);
    const filled = this.filledFrom.get(entry.key);
    return container && filled != null ? container.pointAt(pos - (entry.from - filled)) : null;
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
    for (const [key, container] of this.containers) {
      if (!container.dom.contains(node)) continue;
      const pos = container.posAt(node, offset);
      const entry = this.entries.find((e) => e.key === key);
      const filled = this.filledFrom.get(key);
      return pos == null || !entry || filled == null ? null : pos + entry.from - filled;
    }
    return null;
  }

  /**
   * @param {number} pos
   * @returns {DOMPoint}
   * @throws {RangeError} When no fragment shows `pos`, an unbuilt one included.
   */
  domAtPos(pos) {
    const point = this.pointAt(pos);
    if (!point) throw new RangeError(`Position ${pos} is not shown by any fragment${this.unbuiltAt(pos) ? ' (its fragment is not built)' : ''}`);
    return point;
  }

  /**
   * The placeholder of the unbuilt entry that holds `pos`, or null.
   * @param {number} pos
   */
  unbuiltAt(pos) {
    const at = this.indexAt(pos);
    const entry = this.entries[at];
    return entry && !this.containers.has(entry.key) ? this.placeholders.get(entry.key) ?? null : null;
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
    const { doc } = this.state;
    const node = doc.nodeAt(pos);
    if (!node || node.isText) return null;
    // A node that opens at a cut starts where the box before it ends, and only the box after it shows it.
    const entries = this.entries;
    const opens = entries.findIndex((e, i) => i > 0 && entries[i - 1].to != null && openedAt(doc, /** @type {number} */ (entries[i - 1].to)) === pos);
    const point = opens > 0 ? this.containerPoint(entries[opens], pos) : this.pointAt(pos);
    const child = point && point.node.nodeType === 1 ? point.node.childNodes[point.offset] : null;
    return child && child.nodeType === 1 ? child : null;
  }

  /**
   * The viewport rectangle of `pos`: a zero-width box at the caret's place, on the side of the character after it when there is one (`side` ≥ 0) and before it otherwise. A position at a cut answers the start of the next box. A position in an unbuilt fragment answers an estimate, marked `estimate: true`: a zero-height box at the left of the placeholder, at the position's share of the entry's range down it.
   * @param {number} pos
   * @param {number} [side]
   * @returns {{ left: number, right: number, top: number, bottom: number, estimate?: true }}
   */
  coordsAtPos(pos, side = 1) {
    const placeholder = this.unbuiltAt(pos);
    if (placeholder) {
      const entry = this.entries[this.indexAt(pos)];
      const rect = placeholder.getBoundingClientRect();
      const span = (entry.to ?? this.state.doc.content.size) - entry.from;
      const y = rect.top + (rect.height * (pos - entry.from)) / Math.max(1, span);
      return { left: rect.left, right: rect.left, top: y, bottom: y, estimate: true };
    }
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

  /** The key and fill count of the fragment that holds the head, which tell whether its DOM is the one the browser's selection was drawn in. */
  headFill() {
    const key = this.entries[this.indexAt(this.state.selection.head)]?.key;
    return `${key}:${this.fillCount.get(/** @type {number} */ (key))}`;
  }

  /**
   * Whether the browser has dropped a node selection the view drew, noted when a selection change arrives with no input since the draw.
   * @remarks
   * Nothing is read from the browser's selection afterwards until the view draws again or the pointer is pressed. A node selection moves only by input, which the view answers itself (the arrows, typing, Backspace) or the pointer sets, so a change with no input since the draw is the browser's own. `EditorView`'s `DOMObserver.flush` reads every change but the one it wrote and would make a text selection of this one too; the difference here is that a container may change layout after the write. Measured 2026-10-29 on the studio's facsimile, an `<object>` holding a canvas alone in its section: when its page draws the canvas after the scroll that follows the arrow, Chromium clears the range drawn around the object and leaves a caret at the start of the editing host, which a read-back made the document's first heading. A draw done again is dropped again.
   */
  noteDrop() {
    if (!(this.state.selection instanceof NodeSelection) || this.inputs !== this.drawnInputs || !this.lastSelection) return this.dropped;
    const domSelection = this.dom.ownerDocument.getSelection();
    if (domSelection && !this.lastSelection.every((v, i) => v === [domSelection.anchorNode, domSelection.anchorOffset, domSelection.focusNode, domSelection.focusOffset][i])) this.dropped = true;
    return this.dropped;
  }

  /** Draw the model selection with the browser's own, when the view has focus. */
  selectionToDOM() {
    this.dropped = false;
    if (!this.hasFocus() || this.composing) return;
    this.drawnInputs = this.inputs;
    this.drawnFill = this.headFill();
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
      // The browser's selection stays inside the head's fragment: an anchor outside it is drawn at that fragment's edge.
      const at = this.indexAt(selection.head);
      const entry = this.entries[at];
      head = this.pointAt(selection.head);
      if (!entry || !head) return;
      const edge = Math.min(entry.to ?? this.state.doc.content.size, Math.max(entry.from, selection.anchor));
      anchor = selection.anchor === selection.head ? head : this.containerPoint(entry, edge);
    }
    if (!anchor || !head) return;
    this.drawnAnchor = { ...anchor, pos: selection.anchor };
    const domSelection = /** @type {Selection} */ (this.dom.ownerDocument.getSelection());
    if (domSelection.anchorNode !== anchor.node || domSelection.anchorOffset !== anchor.offset || domSelection.focusNode !== head.node || domSelection.focusOffset !== head.offset) {
      domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    }
    this.lastSelection = [domSelection.anchorNode, domSelection.anchorOffset, domSelection.focusNode, domSelection.focusOffset];
  }

  /** Read the browser's selection back into the model when the browser moved it (a click, an arrow, a Shift-extension). */
  readSelection() {
    if (this.composing || this.pointer?.moved || this.dropped) return;
    const domSelection = this.dom.ownerDocument.getSelection();
    if (!domSelection || !domSelection.anchorNode || !this.dom.contains(domSelection.anchorNode) || !this.dom.contains(domSelection.focusNode)) return;
    const now = [domSelection.anchorNode, domSelection.anchorOffset, domSelection.focusNode, domSelection.focusOffset];
    if (this.lastSelection && now.every((v, i) => v === /** @type {any[]} */ (this.lastSelection)[i])) return;
    this.lastSelection = /** @type {any} */ (now);
    const drawn = this.drawnAnchor;
    const anchor = drawn && drawn.node === domSelection.anchorNode && drawn.offset === domSelection.anchorOffset ? drawn.pos : this.posAt(domSelection.anchorNode, domSelection.anchorOffset);
    const head = this.posAt(/** @type {globalThis.Node} */ (domSelection.focusNode), domSelection.focusOffset);
    if (anchor == null || head == null) return;
    const { selection, doc } = this.state;
    if (selection.anchor === anchor && selection.head === head) return;
    this.dispatch(this.state.tr.setSelection(TextSelection.between(doc.resolve(anchor), doc.resolve(head))));
  }

  // ---- Paint ----

  /** The selection and the decorations, as highlights over the built fragments. */
  paint() {
    this.paintSelection();
    this.paintDecorations();
  }

  /** One `StaticRange` per built fragment the model's selection crosses, in the `fragview-selection` highlight. */
  paintSelection() {
    const highlights = /** @type {any} */ (globalThis).CSS?.highlights;
    if (!highlights) return;
    const { from, to, empty } = this.state.selection;
    const size = this.state.doc.content.size;
    const ranges = [];
    if (!empty) for (const entry of this.entries) {
      const a = Math.max(from, entry.from), b = Math.min(to, entry.to ?? size);
      if (a >= b) continue;
      const start = this.containerPoint(entry, a), end = this.containerPoint(entry, b);
      if (!start || !end) continue;
      ranges.push(staticRange(start, end));
    }
    if (ranges.length) highlights.set(SELECTION_HIGHLIGHT, new /** @type {any} */ (globalThis).Highlight(...ranges));
    else highlights.delete(SELECTION_HIGHLIGHT);
  }

  /**
   * Inline decorations with a class, one highlight per class, clipped to each built fragment. A fragment keeps the ranges of its last paint while its DOM is the same fill's and the decorations over its range are the same, relative to its `from`; so a key repaints the fragments it refilled, not the document.
   */
  paintDecorations() {
    const highlights = /** @type {any} */ (globalThis).CSS?.highlights;
    if (!highlights) return; // no Custom Highlight API: decorations are ignored
    /** @type {any[]} */
    const sets = [];
    this.someProp('decorations', (f) => {
      const source = f(this.state);
      if (source?.find) sets.push(source);
      source?.forEachSet?.((/** @type {any} */ set) => sets.push(set));
      return false; // every source is read
    });
    const size = this.state.doc.content.size;
    /** @type {Map<string, StaticRange[]>} */
    const byClass = new Map();
    for (const entry of this.entries) {
      if (!this.containers.has(entry.key)) { this.painted.delete(entry.key); continue; }
      const end = entry.to ?? size;
      const found = sets.flatMap((set) => set.find(entry.from, end)).filter((d) => d.inline && d.type.attrs?.class && d.to > entry.from && d.from < end);
      const sig = found.map((d) => `${d.from - entry.from} ${d.to - entry.from} ${d.type.attrs.class}`).join(';');
      const fill = this.fillCount.get(entry.key);
      let cached = this.painted.get(entry.key);
      if (!cached || cached.fill !== fill || cached.sig !== sig) {
        /** @type {[string, StaticRange][]} */
        const ranges = [];
        for (const d of found) {
          const start = this.containerPoint(entry, Math.max(d.from, entry.from)), stop = this.containerPoint(entry, Math.min(d.to, end));
          if (!start || !stop) continue;
          const range = staticRange(start, stop);
          for (const cls of d.type.attrs.class.split(/\s+/).filter(Boolean)) ranges.push([cls, range]);
        }
        this.painted.set(entry.key, (cached = { fill, sig, ranges }));
      }
      for (const [cls, range] of cached.ranges) {
        if (!byClass.has(cls)) byClass.set(cls, []);
        /** @type {StaticRange[]} */ (byClass.get(cls)).push(range);
      }
    }
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

  /**
   * A press. The view owns the pointer from here to the release: a drag selects from the model's position at the press (or, with Shift, the model's anchor) to the model's position under the pointer, as a selection in one `EditorView` does. The browser's own drag selection cannot be the source: it extends from the DOM position it began at, and the view draws the DOM selection inside the head's fragment only, so a drag that crosses a cut collapses where it lands (a selection drawn at the cut moves the browser's anchor), and one under a pane scrolled by the held button loses the anchor it began at. A double or triple click is left to the browser (a word, a paragraph), and so is a press the model cannot place.
   * @param {MouseEvent} event
   */
  onMouseDown(event) {
    if (!event.shiftKey) this.drawnAnchor = null;
    if (this.custom(event) || event.button !== 0 || event.detail > 1) return;
    this.endPointer();
    this.readSelection();
    const at = this.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!at) return;
    this.pointer = { anchor: event.shiftKey ? this.state.selection.anchor : at.pos, inside: event.shiftKey ? -1 : at.inside, left: event.clientX, top: event.clientY, moved: false };
    const doc = this.dom.ownerDocument;
    doc.addEventListener('mousemove', this.onPointerMove, true);
    doc.addEventListener('scroll', this.onPointerScroll, true);
    doc.addEventListener('mouseup', this.onPointerUp, true);
  }

  /** @param {MouseEvent} event */
  onMouseMove(event) {
    const pointer = this.pointer;
    if (!pointer) return;
    if (!(event.buttons & 1)) return this.endPointer(); // released outside the window
    pointer.left = event.clientX;
    pointer.top = event.clientY;
    this.followPointer();
  }

  /** The head goes where the pointer is now: on a move, and when anything scrolls under the held button (a wheel, the browser's own autoscroll at a pane's edge), since the browser sends no move for that. */
  followPointer() {
    const pointer = this.pointer;
    if (!pointer) return;
    const at = this.posAtCoords(pointer);
    if (!at) return;
    const { doc, selection } = this.state;
    // ponytail: the anchor is the press's position in the document at the press; a transaction that edits before it during a drag does not move it. Map it through the transactions if collaboration matters here.
    const next = TextSelection.between(doc.resolve(Math.min(pointer.anchor, doc.content.size)), doc.resolve(at.pos));
    if (next.eq(selection)) return;
    pointer.moved = true;
    this.dispatch(this.state.tr.setSelection(next));
  }

  /**
   * The release. After a drag the browser's own selection is drawn from the model again, since its drag may have written to it after the last move, and the `selectionchange` that follows would read that. After a click on a selectable atom (Shift leaves it to the browser) the atom is selected, as `prosemirror-view`'s `selectClickedLeaf` does.
   * @param {MouseEvent} event
   */
  onMouseUp(event) {
    const pointer = this.pointer;
    this.endPointer();
    if (!pointer) return;
    if (pointer.moved) this.selectionToDOM();
    else if (pointer.inside > -1 && this.selectClickedLeaf(Math.min(pointer.inside, this.state.doc.content.size))) event.preventDefault();
  }

  /**
   * @param {number} inside The position of the leaf node under the click.
   */
  selectClickedLeaf(inside) {
    const $pos = this.state.doc.resolve(inside), node = $pos.nodeAfter;
    if (!node || !node.isAtom || !NodeSelection.isSelectable(node)) return false;
    this.dispatch(this.state.tr.setSelection(new NodeSelection($pos)));
    return true;
  }

  endPointer() {
    this.pointer = null;
    const doc = this.dom.ownerDocument;
    doc.removeEventListener('mousemove', this.onPointerMove, true);
    doc.removeEventListener('scroll', this.onPointerScroll, true);
    doc.removeEventListener('mouseup', this.onPointerUp, true);
  }

  /** @param {KeyboardEvent} event */
  onKeyDown(event) {
    if (this.custom(event) || this.composing || event.isComposing || event.keyCode === 229) return;
    this.readSelection();
    if (this.someProp('handleKeyDown', (f) => f(this, event)) || this.captureArrow(event) || this.leftAcrossCut(event)) event.preventDefault();
  }

  /**
   * The arrow keys whose move involves a node selection, as `prosemirror-view`'s `captureKeyDown` takes them (`selectHorizontally`, `selectVertically`): into and out of a block atom the browser can put no caret in (a horizontal rule, a facsimile drawn `contenteditable="false"`), over an inline atom, and Shift extending over one. Any other arrow is the browser's.
   * @param {KeyboardEvent} event
   */
  captureArrow(event) {
    const mods = (event.ctrlKey ? 'c' : '') + (event.metaKey ? 'm' : '') + (event.altKey ? 'a' : '') + (event.shiftKey ? 's' : '');
    // ponytail: left to right text only; prosemirror-view asks findDirection for the direction of the line, and skips ignorable DOM nodes (skipIgnoredNodes) after a move it leaves to the browser.
    switch (event.key) {
      case 'ArrowLeft': return this.selectHorizontally(-1, mods);
      case 'ArrowRight': return this.selectHorizontally(1, mods);
      case 'ArrowUp': return this.selectVertically(-1, mods);
      case 'ArrowDown': return this.selectVertically(1, mods);
      default: return false;
    }
  }

  /**
   * @param {Selection} selection
   */
  applySelection(selection) {
    this.dispatch(this.state.tr.setSelection(selection).scrollIntoView());
    return true;
  }

  /**
   * The selection one block along from the selection's side, when `dir` is forward or back.
   * @param {number} dir
   */
  moveSelectionBlock(dir) {
    const { doc, selection } = this.state;
    const { $anchor, $head } = selection;
    const $side = dir > 0 ? $anchor.max($head) : $anchor.min($head);
    const $start = !$side.parent.inlineContent ? $side : $side.depth ? doc.resolve(dir > 0 ? $side.after() : $side.before()) : null;
    return $start && Selection.findFrom($start, dir);
  }

  /**
   * @param {number} dir
   * @param {string} mods
   */
  selectHorizontally(dir, mods) {
    const { selection, doc } = this.state;
    if (selection instanceof TextSelection) {
      if (mods.includes('s')) {
        const { $head } = selection, node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
        if (!node || node.isText || !node.isLeaf) return false;
        return this.applySelection(new TextSelection(selection.$anchor, doc.resolve($head.pos + node.nodeSize * (dir < 0 ? -1 : 1))));
      } else if (!selection.empty) return false;
      else if (this.endOfTextblock(dir > 0 ? 'forward' : 'backward')) {
        const next = this.moveSelectionBlock(dir);
        return next instanceof NodeSelection ? this.applySelection(next) : false;
      } else if (!(MAC && mods.includes('m'))) {
        const { $head } = selection, node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
        if (!node || node.isText || !node.isAtom) return false;
        if (NodeSelection.isSelectable(node)) return this.applySelection(new NodeSelection(dir < 0 ? doc.resolve($head.pos - node.nodeSize) : $head));
        // The browser puts pointless caret positions around an uneditable inline node, so the caret is moved across it here.
        return this.applySelection(new TextSelection(doc.resolve(dir < 0 ? $head.pos - node.nodeSize : $head.pos + node.nodeSize)));
      }
      return false;
    }
    if (selection instanceof NodeSelection && selection.node.isInline) return this.applySelection(new TextSelection(dir > 0 ? selection.$to : selection.$from));
    const next = this.moveSelectionBlock(dir);
    return next ? this.applySelection(next) : false;
  }

  /**
   * Vertical motion that involves a node selection; any other is the browser's.
   * @param {number} dir
   * @param {string} mods
   */
  selectVertically(dir, mods) {
    const { selection } = this.state;
    if ((selection instanceof TextSelection && !selection.empty) || mods.includes('s') || (MAC && mods.includes('m'))) return false;
    const { $from, $to } = selection;
    if (!$from.parent.inlineContent || this.endOfTextblock(dir < 0 ? 'up' : 'down')) {
      const next = this.moveSelectionBlock(dir);
      if (next instanceof NodeSelection) return this.applySelection(next);
    }
    if (!$from.parent.inlineContent) {
      const side = dir < 0 ? $from : $to;
      const beyond = selection instanceof AllSelection ? Selection.near(side, dir) : Selection.findFrom(side, dir);
      return beyond ? this.applySelection(beyond) : false;
    }
    return false;
  }

  /**
   * ArrowLeft, with or without Shift, from a caret at a cut inside a textblock: the head goes one character back, into the previous box. The browser's own move would land on the end of the previous box, which shows the same position, and a second key would be needed.
   * @param {KeyboardEvent} event
   */
  leftAcrossCut(event) {
    if (event.key !== 'ArrowLeft' || event.altKey || event.ctrlKey || event.metaKey) return false;
    const { selection, doc } = this.state;
    if (!(selection instanceof TextSelection) || (!selection.empty && !event.shiftKey)) return false;
    const { head } = selection;
    const entries = this.entries;
    const at = entries.findIndex((e) => e.to === head);
    if (at < 0 || at === entries.length - 1 || doc.resolve(head).parentOffset === 0) return false;
    const step = doc.resolve(head).parentOffset > 1 && /[\uDC00-\uDFFF]/.test(doc.textBetween(head - 1, head)) ? 2 : 1;
    const target = head - step;
    this.dispatch(this.state.tr.setSelection(TextSelection.create(doc, event.shiftKey ? selection.anchor : target, target)).scrollIntoView());
    return true;
  }

  /** @param {InputEvent} event */
  onBeforeInput(event) {
    // A composition whose compositionstart never reached the view (a browser that sends none, a listener that stopped it): its first insertCompositionText comes before the browser writes the text, so the selection read here is still the model's. Only that type starts one: an event merely marked isComposing may follow compositionend (WebKit's insertFromComposition), and would leave the view composing.
    if (event.inputType === 'insertCompositionText') this.startComposing();
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

  /**
   * Copy and cut write the model's selection, not the browser's, which holds only the head's fragment: the slice as `prosemirror-view`'s clipboard writes it (`serializeForClipboard`: open depths in `data-pm-slice`, `transformCopied`, `clipboardSerializer`, `clipboardTextSerializer`), HTML and plain text. Cut then deletes the selection.
   * @param {ClipboardEvent} event
   */
  onCopy(event) {
    if (this.custom(event)) return;
    this.readSelection();
    const { state } = this;
    const { selection } = state;
    if (selection.empty || !event.clipboardData) return;
    event.preventDefault();
    const { html, text } = serializeForClipboard(this, selection.content());
    event.clipboardData.clearData();
    event.clipboardData.setData('text/html', html);
    event.clipboardData.setData('text/plain', text);
    if (event.type === 'cut' && this.editable) this.dispatch(state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
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

  /**
   * The browser is composing whether or not a `handleDOMEvents` handler takes the event, so the selection is held from here even then.
   * @param {CompositionEvent} event
   */
  onCompositionStart(event) {
    this.custom(event);
    this.startComposing();
  }

  /** Read the browser's selection one last time, then hold it: while the browser composes, its caret stands in text the model does not hold. */
  startComposing() {
    this.readSelection();
    this.composing = true;
  }

  /**
   * Apply the composition as the text it committed, `event.data`, at the model's selection, which is the one held at `compositionstart` (the selection is not read while the browser composes) mapped through any transaction since: through `insertText`, as a typed key, so `handleTextInput` is asked and the model chooses the marks (stored marks, or the position's, which keep a non-inclusive mark out at its edges). Nothing is read back from the DOM. The fragment the browser composed in is then drawn from the model, by the insert's refill or, when the insert did not touch it (a cancelled composition, empty `data`, or a `handleTextInput` that did something else), by a `dirtied` transaction.
   * @param {CompositionEvent} event
   */
  onCompositionEnd(event) {
    const taken = this.custom(event);
    this.composing = false;
    this.drawnFill = null; // the browser's caret stands in text the model does not hold
    if (!taken) {
      const { from, to, head } = this.state.selection;
      const key = this.entries[this.indexAt(head)]?.key;
      if (event.data && this.editable) this.insertText(event.data, from, to);
      if (this.entries.some((e) => e.key === key && !e.dirty)) this.dispatch(dirtied(this.state.tr, key));
    }
    this.update(this.state);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.endPointer();
    for (const [type, handler] of Object.entries(this.handlers)) this.dom.removeEventListener(type, handler);
    this.dom.ownerDocument.removeEventListener('selectionchange', this.onSelectionChange);
    for (const type of INPUTS) this.dom.removeEventListener(type, this.countInput, true);
    for (const view of this.pluginViews) view.destroy?.();
    for (const container of this.containers.values()) container.release();
    this.observer?.disconnect();
    const highlights = /** @type {any} */ (globalThis).CSS?.highlights;
    for (const name of this.highlightNames) highlights?.delete(name);
    highlights?.delete(SELECTION_HIGHLIGHT);
    this.containers.clear();
    this.dom.remove();
  }
}
