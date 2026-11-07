/**
 * The faces of a `FragmentedView`: leaf node views, each shown once in the shown copy of the page that holds its node.
 *
 * @remarks
 * A FACE is the element a host's node view supplies for one leaf node. A fill draws a node several times (the trial, the law copy, the shown page), into a detached fragment first, so a live element cannot be what a fragmentainer measures: the renderer writes a STAND-IN in every copy (`slice-renderer.js`), a wrapper around what `toDOM` draws, and after a fill the view moves the face into the shown copy's wrapper. No fragmentainer learns the word. `toDOM` stays the print face.
 *
 * The prop is `nodeViews`, read as `prosemirror-view` reads it, for leaf node types only: a block may be divided across fragments and would need a view per piece, so it is refused by name; see the record *a fragmented view gives a leaf a node view*.
 *
 * A face leaves its page while the page fills, since a page may replace everything it shows: it waits in the POUND, a connected holder off screen, and comes back by `moveBefore`, which keeps an iframe's document and an input's focus where `appendChild` loses them. The pound stays rendered: measured 2026-11-07, a focused element in a `visibility: hidden` holder loses focus at the next frame and does not get it back. A face no fill has claimed is destroyed once the chain has settled (`sweep`), since a cut that moves takes a leaf from one page to the next by way of the pound.
 *
 * A face is matched to a node by identity, since an untouched node is the same object from state to state, and otherwise by asking the views its page held for the new node (`update`), as `prosemirror-view` pairs them by place. A view whose own node still stands in the document is not asked: its page may have lost it to the next one.
 *
 * Sizes are read with `offsetWidth` and `offsetHeight`, which a transformed page does not scale. ponytail: they round to the pixel, so a fractional box is pinned up to half a pixel off, and writing modes are not read; a vertical document needs the axes swapped.
 *
 * @packageDocumentation
 */

import { dirtied } from './fragments-plugin.js';

/** @import { Node as PMNode, NodeType } from 'prosemirror-model' */

/**
 * What a host's constructor answers: `prosemirror-view`'s `NodeView`, less what a leaf has no use for. `setSelection` and `multiType` are not read.
 * @typedef {object} LeafView
 * @property {HTMLElement} dom
 * @property {(node: PMNode, decorations: readonly any[]) => boolean} [update]
 * @property {() => void} [destroy]
 * @property {() => void} [selectNode]
 * @property {() => void} [deselectNode]
 * @property {(event: Event) => boolean} [stopEvent]
 * @property {(record: MutationRecord) => boolean} [ignoreMutation]
 */

/**
 * A live face. `key` is the entry it stands in, null while parked, and `from` the entry it was last parked from.
 * @typedef {{ view: LeafView, node: PMNode, key: number | null, from: number | null, wrapper: Element | null, box: { inline: number, block: number } | null }} Face
 */

/**
 * Move a node, keeping its state where the browser can: `moveBefore` is missing in some browsers and refuses a target outside the document, where `appendChild` takes the node with the loss of its state.
 * @param {Element} parent
 * @param {Element} node
 */
function moveInto(parent, node) {
  try {
    /** @type {any} */ (parent).moveBefore(node, null);
  } catch {
    parent.appendChild(node);
  }
}

/** @param {Element} el */
const boxOf = (el) => ({ inline: /** @type {HTMLElement} */ (el).offsetWidth, block: /** @type {HTMLElement} */ (el).offsetHeight });

/**
 * @param {{ inline: number, block: number }} a
 * @param {{ inline: number, block: number }} b
 */
const sameBox = (a, b) => Math.abs(a.inline - b.inline) <= 0.25 && Math.abs(a.block - b.block) <= 0.25;

export class Faces {
  /** @param {any} view The `FragmentedView`. */
  constructor(view) {
    this.view = view;
    /** The constructors, by type name. @type {Record<string, Function>} */
    this.views = {};
    /** Every live face, in the order made. @type {Set<Face>} */
    this.all = new Set();
    /** The faces of a node. @type {Map<PMNode, Face[]>} */
    this.pool = new Map();
    /** @type {WeakMap<object, Face>} */
    this.byDom = new WeakMap();
    /** @type {Face | null} */
    this.selected = null;
    /** @type {HTMLElement | null} */
    this.pound = null;
    /** @type {ResizeObserver | null} */
    this.observer = null;
    /** Entries whose refill is asked for the next frame. @type {Set<number>} */
    this.resized = new Set();
    this.warned = false;
  }

  /**
   * Read `nodeViews` from the props and the plugins, the first constructor per type name winning, as `prosemirror-view`'s `buildNodeViews` does; a name the schema lacks is passed over, as it is there. When the set changed every face is destroyed and true is answered: every render's stand-ins depend on it, so the caller invalidates.
   * @throws {RangeError} For a type that is not a leaf.
   */
  build() {
    /** @type {Record<string, Function>} */
    const views = {};
    const { view } = this;
    view.someProp('nodeViews', (/** @type {Record<string, Function>} */ set) => { for (const name in set) if (!Object.hasOwn(views, name)) views[name] = set[name]; });
    const types = view.state.schema.nodes;
    for (const name in views) {
      if (!types[name]) continue;
      if (types[name].isText) throw new RangeError(`prosemirror-fragview: nodeViews["${name}"] is refused: text is drawn by the renderer.`);
      if (!types[name].isLeaf) throw new RangeError(`prosemirror-fragview: nodeViews["${name}"] is refused: a fragmented view gives a node view only to a leaf node type, since a block may be divided across fragments and would need a view per piece; draw "${name}" from toDOM, and see the record on node views.`);
    }
    if (!this.warned && view.someProp('markViews')) {
      this.warned = true;
      console.warn('prosemirror-fragview: markViews are not read; a mark is drawn from its toDOM.');
    }
    const names = Object.keys(views), old = this.views;
    const changed = names.length !== Object.keys(old).length || names.some((name) => views[name] !== old[name]);
    this.views = views;
    if (changed) for (const face of [...this.all]) this.destroyFace(face);
    return changed;
  }

  /**
   * Whether a node type has a node view: the renderer's question.
   * @param {NodeType} type
   */
  has(type) {
    return Object.hasOwn(this.views, type.name);
  }

  /**
   * The size a stand-in is pinned to, once the node has a face.
   * @param {PMNode} node
   */
  sizeOf(node) {
    return this.pool.get(node)?.[0]?.box ?? null;
  }

  /**
   * The face whose element holds a node, or null.
   * @param {globalThis.Node | null} node
   * @returns {Face | null}
   */
  around(node) {
    const root = this.view.dom;
    for (let el = node; el && el !== root; el = el.parentNode) {
      const face = this.byDom.get(el);
      if (face) return face;
    }
    return null;
  }

  /**
   * Take an entry's faces out of its page before the page changes.
   * @param {number} key
   */
  park(key) {
    for (const face of this.all) {
      if (face.key !== key) continue;
      moveInto(this.holder(), face.view.dom);
      face.key = null;
      face.from = key;
      face.wrapper = null;
    }
  }

  /** The pound, made when first needed. */
  holder() {
    if (this.pound?.isConnected) return this.pound;
    const doc = this.view.dom.ownerDocument;
    this.pound = doc.createElement('div');
    this.pound.setAttribute('contenteditable', 'false');
    this.pound.setAttribute('aria-hidden', 'true');
    Object.assign(this.pound.style, { position: 'absolute', left: '-10000px', top: '0', pointerEvents: 'none' });
    doc.body.appendChild(this.pound);
    return this.pound;
  }

  /**
   * Put a face in every stand-in a fill has shown. A host's constructor that throws, or answers a `contentDOM`, has its error raised apart and the node keeps its drawing, so one bad view stops no page.
   * @param {number} key
   * @param {{ dom: HTMLElement }} container
   */
  place(key, container) {
    if (!Object.keys(this.views).length) return;
    /** @type {Set<PMNode> | null} */
    let standing = null;
    const inDoc = () => {
      if (standing) return standing;
      const nodes = /** @type {Set<PMNode>} */ (standing = new Set());
      this.view.state.doc.descendants((/** @type {PMNode} */ node) => { if (node.isLeaf) nodes.add(node); });
      return nodes;
    };
    let resized = false;
    for (const wrapper of container.dom.querySelectorAll('[data-fragview-face]')) {
      const pos = this.view.leafAround(wrapper);
      const node = pos == null ? null : this.view.state.doc.nodeAt(pos);
      if (!node || !this.has(node.type)) continue;
      const stood = /** @type {Element | null} */ (wrapper.firstElementChild);
      let face;
      try {
        face = this.parkedFor(node) ?? this.offered(node, key, inDoc) ?? this.make(node);
      } catch (error) {
        queueMicrotask(() => { throw error; });
        continue;
      }
      if (!face) continue;
      const measured = stood ? boxOf(stood) : null;
      const { dom } = face.view;
      wrapper.replaceChildren();
      moveInto(wrapper, dom);
      face.key = key;
      face.from = null;
      face.wrapper = wrapper;
      face.box = boxOf(dom);
      if (measured && !sameBox(measured, face.box)) resized = true;
      this.watch(dom);
    }
    if (resized) this.refill(key);
    this.select();
  }

  /**
   * A parked face of this very node.
   * @param {PMNode} node
   */
  parkedFor(node) {
    return this.pool.get(node)?.find((face) => face.key == null) ?? null;
  }

  /**
   * A face this entry held for a node no longer in the document, taking the new node: `update`, or, for a view without one, the same markup, as `prosemirror-view` answers.
   * @param {PMNode} node
   * @param {number} key
   * @param {() => Set<PMNode>} inDoc
   */
  offered(node, key, inDoc) {
    for (const face of this.all) {
      if (face.from !== key || face.key != null || face.node.type !== node.type || inDoc().has(face.node)) continue;
      if (face.view.update ? !face.view.update(node, []) : !node.sameMarkup(face.node)) continue;
      this.forget(face);
      face.node = node;
      this.remember(face);
      return face;
    }
    return null;
  }

  /**
   * A new face from the constructor; null when it answers nothing, which leaves the node to `toDOM`.
   * @param {PMNode} node
   * @returns {Face | null}
   * @throws {RangeError} For a view with a `contentDOM`.
   */
  make(node) {
    /** @type {Face} */
    const face = { view: /** @type {any} */ (null), node, key: null, from: null, wrapper: null, box: null };
    const getPos = () => {
      const parent = face.wrapper?.parentNode;
      return parent ? this.view.posAt(parent, Array.prototype.indexOf.call(parent.childNodes, face.wrapper)) ?? undefined : undefined;
    };
    const view = this.views[node.type.name](node, this.view, getPos, []);
    if (!view) return null;
    if (view.contentDOM) throw new RangeError(`prosemirror-fragview: the node view for "${node.type.name}" returned a contentDOM; a leaf has no content hole.`);
    face.view = view;
    this.all.add(face);
    this.byDom.set(view.dom, face);
    this.remember(face);
    return face;
  }

  /** @param {Face} face */
  remember(face) {
    const list = this.pool.get(face.node);
    if (list) list.push(face);
    else this.pool.set(face.node, [face]);
  }

  /** @param {Face} face */
  forget(face) {
    const list = this.pool.get(face.node)?.filter((other) => other !== face);
    if (list?.length) this.pool.set(face.node, list);
    else this.pool.delete(face.node);
  }

  /**
   * Watch a face's element for a change of size: a late image, a component that grew. The cut was made against the box it had, so its page is filled again and the next stand-in is pinned to the new box.
   * @param {Element} dom
   */
  watch(dom) {
    this.observer ??= new ResizeObserver((records) => {
      for (const { target } of records) {
        const face = this.byDom.get(target);
        if (!face || face.key == null) continue;
        const box = boxOf(target);
        if (face.box && sameBox(face.box, box)) continue;
        face.box = box;
        this.refill(face.key);
      }
    });
    this.observer.observe(dom);
  }

  /**
   * Ask a page to be filled again, at the next frame: a dispatch inside an observer's callback or a fill's answer would write under them.
   * @param {number} key
   */
  refill(key) {
    if (!this.resized.size) requestAnimationFrame(() => {
      const keys = [...this.resized].filter((k) => this.view.entries.some((/** @type {{ key: number }} */ e) => e.key === k));
      this.resized.clear();
      if (keys.length && !this.view.destroyed) this.view.dispatch(dirtied(this.view.state.tr, keys));
    });
    this.resized.add(key);
  }

  /** Destroy what no fill claimed, once the chain has settled. */
  sweep() {
    for (const face of [...this.all]) if (face.key == null) this.destroyFace(face);
  }

  /** @param {Face} face */
  destroyFace(face) {
    if (this.selected === face) this.selected = null;
    this.all.delete(face);
    this.forget(face);
    this.observer?.unobserve(face.view.dom);
    face.key = null;
    face.wrapper = null;
    face.view.destroy?.();
    face.view.dom.remove();
  }

  /** The face of a node selection is selected, and the last one deselected: the view's own hooks, or the class `prosemirror-view` adds. A parked face stays selected, so a refill asks nothing of it. ponytail: one node object shown twice selects its first face, whichever the selection stands on. */
  select() {
    const { selection } = this.view.state;
    const face = (selection.node && this.pool.get(selection.node)?.[0]) ?? null;
    if (face === this.selected) return;
    if (this.selected) {
      const { view } = this.selected;
      if (view.deselectNode) view.deselectNode();
      else view.dom.classList.remove('ProseMirror-selectednode');
    }
    this.selected = face;
    if (face) {
      if (face.view.selectNode) face.view.selectNode();
      else face.view.dom.classList.add('ProseMirror-selectednode');
    }
  }

  /** The view is going: every face destroyed, the pound removed. */
  destroy() {
    for (const face of [...this.all]) this.destroyFace(face);
    this.observer?.disconnect();
    this.pound?.remove();
  }
}
