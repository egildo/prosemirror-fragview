/**
 * The faces of a `FragmentedView`: node views, each shown once, in the shown copy of the earliest page that holds its node whole.
 *
 * @remarks
 * A FACE is the element a host's node view supplies for one node. A fill draws a node several times (the trial, the law copy, the shown page), into a detached fragment first, so a live element cannot be what a fragmentainer measures: the renderer writes a STAND-IN in every copy (`slice-renderer.js`), a wrapper around what `toDOM` draws, and after a fill the view moves the face into the shown copy's wrapper. No fragmentainer learns the word. `toDOM` stays the print face.
 *
 * The prop is `nodeViews`, read as `prosemirror-view` reads it, for a leaf and for a block whose view has no content hole; text is refused by name, and a view that answers a `contentDOM` is refused when it is made, since its hole would be divided across fragments. See the records *a fragmented view gives a leaf a node view* and *a block with no content hole is a face where it stands whole*.
 *
 * The face follows the cut; the cut never follows the face. A wrapper gets a face only where its node stands whole in its fragment, its mapped start the node's position and its mapped end the node's end, and where no earlier built fragment shows the node's start: a node has at most one face. A piece of a node the cut divided, and a later copy of a node shown whole twice (a page engine slicing a tall leaf as a painted shell), keep `toDOM`'s drawing, and the node is warned once on the console. A wrapper holding a face carries `data-fragview-face="placed"`, one without keeps the empty value, so a host reads `nodeDOM(pos)` to know and CSS can dress a divided drawing. A block's stand-in pins no size, since a table's height is a minimum and a pinned table divided stretches the row before the cut past the foot: a block face must draw at `toDOM`'s box, and one that does not is warned once by its type and kept, with no refill.
 *
 * A face is offered the node decorations whose range is exactly its node's, as `prosemirror-view` hands its outer decorations: at construction, and through `update(node, decorations)` after a paint that changed them (`decorate`).
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
import { FACE_STAMP } from './slice-renderer.js';

/** @import { Node as PMNode, NodeType } from 'prosemirror-model' */

/**
 * What a host's constructor answers: `prosemirror-view`'s `NodeView` with no `contentDOM`. `multiType` is not read.
 * @typedef {object} LeafView
 * @property {HTMLElement} dom
 * @property {(node: PMNode, decorations: readonly any[]) => boolean} [update]
 * @property {(anchor: number, head: number, root: Document | ShadowRoot) => void} [setSelection]
 * @property {() => void} [destroy]
 * @property {() => void} [selectNode]
 * @property {() => void} [deselectNode]
 * @property {(event: Event) => boolean} [stopEvent]
 * @property {(record: MutationRecord) => boolean} [ignoreMutation]
 */

/**
 * A live face. `key` is the entry it stands in, null while parked, and `from` the entry it was last parked from. `stood` is the drawing its wrapper held, `at` the position it was made at until it has a wrapper, and `sig` the signature of the decorations it was last given.
 * @typedef {{ view: LeafView, node: PMNode, key: number | null, from: number | null, wrapper: Element | null, box: { inline: number, block: number } | null, stood: Element | null, at: number | null, sig: string, getPos: () => number | undefined }} Face
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

/** @param {readonly any[]} decorations */
const signature = (decorations) => decorations.map((d) => { try { return JSON.stringify([d.type.attrs, d.spec]); } catch { return String(d.type.attrs); } }).join(';');

/** The attribute value of a wrapper that holds its face. */
const PLACED = 'placed';

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
    /** The nodes warned as divided. @type {WeakSet<PMNode>} */
    this.dividedWarned = new WeakSet();
    /** The type names warned for a block face of another size than its drawing. @type {Set<string>} */
    this.sizeWarned = new Set();
    /** The face, anchor and head `setSelection` was last given. @type {[Face, number, number] | null} */
    this.lastInner = null;
  }

  /**
   * Read `nodeViews` from the props and the plugins, the first constructor per type name winning, as `prosemirror-view`'s `buildNodeViews` does; a name the schema lacks is passed over, as it is there. When the set changed every face is destroyed and true is answered: every render's stand-ins depend on it, so the caller invalidates.
   * @throws {RangeError} For a text type.
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
   * The size a leaf's stand-in is pinned to, once the node has a face. The renderer asks it for a leaf only.
   * @param {PMNode} node
   */
  sizeOf(node) {
    return this.pool.get(node)?.[0]?.box ?? null;
  }

  /**
   * The placed face of a node, or null.
   * @param {PMNode} node
   */
  placedFor(node) {
    return this.pool.get(node)?.find((face) => face.key != null) ?? null;
  }

  /**
   * The placed face of a block whose node holds `pos` strictly inside: a position that belongs to the face.
   * @param {number} pos
   * @returns {Face | null}
   */
  inside(pos) {
    for (const face of this.all) {
      if (face.key == null || face.node.isLeaf) continue;
      const at = face.getPos();
      if (at != null && pos > at && pos < at + face.node.nodeSize) return face;
    }
    return null;
  }

  /**
   * The node decorations whose range is exactly the node's, as `prosemirror-view` hands a node view its outer decorations.
   * @param {PMNode} node
   * @param {number} pos
   * @param {any[]} [sets] The view's decoration sets, when the caller has them.
   */
  decorationsAt(node, pos, sets = this.view.decorationSets()) {
    const end = pos + node.nodeSize;
    return sets.flatMap((set) => set.find(pos, end)).filter((d) => !d.inline && !d.widget && d.from === pos && d.to === end);
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
      face.wrapper?.setAttribute(FACE_STAMP, '');
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
   * Put a face in every stand-in a fill has shown whose node stands whole there and in no earlier built fragment; every other piece keeps its drawing, and its node is warned once. A host's constructor that throws, or answers a `contentDOM`, has its error raised apart and the node keeps its drawing, so one bad view stops no page.
   * @param {number} key
   * @param {{ dom: HTMLElement }} container
   */
  place(key, container) {
    if (!Object.keys(this.views).length) return;
    const { view } = this, doc = view.state.doc, index = view.entries.findIndex((/** @type {{ key: number }} */ e) => e.key === key);
    /** @type {Set<PMNode> | null} */
    let standing = null;
    const inDoc = () => {
      if (standing) return standing;
      const nodes = /** @type {Set<PMNode>} */ (standing = new Set());
      doc.descendants((/** @type {PMNode} */ node) => { if (this.has(node.type)) nodes.add(node); });
      return nodes;
    };
    let resized = false;
    for (const wrapper of container.dom.querySelectorAll(`[${FACE_STAMP}]`)) {
      // A wrapper inside a drawing a face has taken the place of.
      if (!container.dom.contains(wrapper)) continue;
      const parent = /** @type {globalThis.Node} */ (wrapper.parentNode), at = Array.prototype.indexOf.call(parent.childNodes, wrapper);
      const pos = view.posAt(parent, at);
      // A fragment not yet refilled answers the positions of the document it was filled from, which may lie past this one's end.
      const node = pos == null || pos < 0 || pos > doc.content.size ? null : doc.nodeAt(pos);
      if (!node || !this.has(node.type)) continue;
      if (view.posAt(parent, at + 1) !== pos + node.nodeSize || this.shownBefore(pos, index)) {
        this.divided(node, pos);
        continue;
      }
      const stood = /** @type {Element | null} */ (wrapper.firstElementChild);
      let face;
      try {
        face = this.elsewhere(node, key, pos) ?? this.offered(node, pos, key, inDoc) ?? this.make(node, pos);
      } catch (error) {
        queueMicrotask(() => { throw error; });
        continue;
      }
      if (!face) continue;
      const measured = stood ? boxOf(stood) : null;
      this.seat(face, wrapper, key, stood);
      if (node.isLeaf) {
        face.box = boxOf(face.view.dom);
        if (measured && !sameBox(measured, face.box)) resized = true;
      } else {
        face.box = measured;
        if (measured) this.misfit(face, boxOf(face.view.dom));
      }
    }
    if (resized) this.refill(key);
    this.select();
  }

  /**
   * Put a face in a wrapper: the drawing out, the face in by `moveBefore`, the wrapper marked placed.
   * @param {Face} face
   * @param {Element} wrapper
   * @param {number} key
   * @param {Element | null} stood
   */
  seat(face, wrapper, key, stood) {
    wrapper.replaceChildren();
    moveInto(wrapper, face.view.dom);
    wrapper.setAttribute(FACE_STAMP, PLACED);
    face.key = key;
    face.from = null;
    face.wrapper = wrapper;
    face.stood = stood;
    face.at = null;
    this.watch(face.view.dom);
  }

  /**
   * Whether a built fragment before the entry at `index` shows a stand-in starting at `pos`: the node's face is that fragment's.
   * @param {number} pos
   * @param {number} index
   */
  shownBefore(pos, index) {
    const { view } = this;
    for (let i = 0; i < index; i++) {
      const container = view.containers.get(view.entries[i].key);
      if (!container) continue;
      for (const wrapper of container.dom.querySelectorAll(`[${FACE_STAMP}]`)) {
        const parent = /** @type {globalThis.Node} */ (wrapper.parentNode);
        if (view.posAt(parent, Array.prototype.indexOf.call(parent.childNodes, wrapper)) === pos) return true;
      }
    }
    return false;
  }

  /**
   * Say once that a node with a node view stands in more than one fragment and is drawn from `toDOM` there.
   * @param {PMNode} node
   * @param {number} pos
   */
  divided(node, pos) {
    if (this.dividedWarned.has(node)) return;
    this.dividedWarned.add(node);
    console.warn(`prosemirror-fragview: the "${node.type.name}" at ${pos} stands in more than one fragment, so it is drawn from toDOM in each; its node view is placed only where it stands whole in one.`);
  }

  /**
   * Say once per type that a block's face draws another box than its drawing, which is what the cut was made against.
   * @param {Face} face
   * @param {{ inline: number, block: number }} box
   */
  misfit(face, box) {
    const { name } = face.node.type;
    if (!face.box || sameBox(face.box, box) || this.sizeWarned.has(name)) return;
    this.sizeWarned.add(name);
    console.warn(`prosemirror-fragview: the node view for "${name}" draws ${box.inline} by ${box.block} where toDOM draws ${face.box.inline} by ${face.box.block}; a block is cut at its drawing's size, so its view should draw at that size.`);
  }

  /**
   * A face of this very node, parked or standing at the same position in another fragment, which gives it up and gets its drawing back.
   * @param {PMNode} node
   * @param {number} key
   * @param {number} pos
   */
  elsewhere(node, key, pos) {
    const face = this.pool.get(node)?.find((f) => f.key == null || (f.key !== key && f.getPos() === pos)) ?? null;
    if (face?.wrapper) {
      face.wrapper.setAttribute(FACE_STAMP, '');
      if (face.stood) face.wrapper.replaceChildren(face.stood);
      face.wrapper = null;
    }
    return face;
  }

  /**
   * A face this entry held for a node no longer in the document, taking the new node: `update`, or, for a view without one, the same markup, as `prosemirror-view` answers.
   * @param {PMNode} node
   * @param {number} pos
   * @param {number} key
   * @param {() => Set<PMNode>} inDoc
   */
  offered(node, pos, key, inDoc) {
    for (const face of this.all) {
      if (face.from !== key || face.key != null || face.node.type !== node.type || inDoc().has(face.node)) continue;
      const decorations = this.decorationsAt(node, pos);
      // The face is parked, so `getPos` answers the position it is offered, as for the constructor: `prosemirror-view` answers it inside `update`, and a view that lays out its inside by it (prosemirror-spreads' table, its cells) would read `undefined`.
      face.at = pos;
      const taken = face.view.update ? face.view.update(node, decorations) : node.sameMarkup(face.node);
      if (!taken) { face.at = null; continue; }
      this.forget(face);
      face.node = node;
      face.sig = signature(decorations);
      this.remember(face);
      return face;
    }
    return null;
  }

  /**
   * A new face from the constructor; null when it answers nothing, which leaves the node to `toDOM`. `getPos` answers `pos` while the constructor runs, then its wrapper's position, and `undefined` while the face is parked or destroyed.
   * @param {PMNode} node
   * @param {number} pos
   * @returns {Face | null}
   * @throws {RangeError} For a view with a `contentDOM`.
   */
  make(node, pos) {
    const decorations = this.decorationsAt(node, pos);
    /** @type {Face} */
    const face = { view: /** @type {any} */ (null), node, key: null, from: null, wrapper: null, box: null, stood: null, at: pos, sig: signature(decorations), getPos: () => undefined };
    face.getPos = () => {
      const parent = face.wrapper?.parentNode;
      if (!parent) return face.at ?? undefined;
      return this.view.posAt(parent, Array.prototype.indexOf.call(parent.childNodes, face.wrapper)) ?? undefined;
    };
    const view = this.views[node.type.name](node, this.view, face.getPos, decorations);
    face.at = null;
    if (!view) return null;
    if (view.contentDOM) throw new RangeError(`prosemirror-fragview: the node view for "${node.type.name}" returned a contentDOM; a fragmented view gives a node view only to a node drawn whole, since a content hole would be divided across fragments.`);
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
   * Watch a face's element for a change of size: a late image, a component that grew. The cut was made against the box a leaf's face had, so its page is filled again and the next stand-in is pinned to the new box. A block's was made against its drawing, which nothing pins, so a block face of another size is warned and nothing is filled.
   * @param {Element} dom
   */
  watch(dom) {
    this.observer ??= new ResizeObserver((records) => {
      for (const { target } of records) {
        const face = this.byDom.get(target);
        if (!face || face.key == null) continue;
        const box = boxOf(target);
        if (!face.node.isLeaf) { this.misfit(face, box); continue; }
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

  /**
   * After a paint, give each placed face whose node decorations changed `update(node, decorations)`; a face that answers false is destroyed and another is made in its wrapper, as `prosemirror-view` redraws a node view that refuses an update. A face with no `update` is kept for a leaf and made again for a block, as there.
   * @param {any[]} sets The view's decoration sets.
   */
  decorate(sets) {
    for (const face of [...this.all]) {
      if (face.key == null || !face.wrapper) continue;
      const pos = face.getPos();
      if (pos == null) continue;
      const decorations = this.decorationsAt(face.node, pos, sets);
      const sig = signature(decorations);
      if (sig === face.sig) continue;
      face.sig = sig;
      if (face.view.update ? face.view.update(face.node, decorations) : face.node.isLeaf) continue;
      const { wrapper, key, stood, node, box } = face;
      this.destroyFace(face);
      let next;
      try {
        next = this.make(node, pos);
      } catch (error) {
        queueMicrotask(() => { throw error; });
      }
      if (next) { this.seat(next, wrapper, key, stood); next.box = box; }
      else { wrapper.setAttribute(FACE_STAMP, ''); if (stood) wrapper.replaceChildren(stood); }
    }
  }

  /**
   * Hand a placed block face the model's selection when both its ends lie inside the face's node, relative to the node's start as `prosemirror-view` gives it (`NodeViewDesc.setSelection`), once per change. Answers whether the selection is the face's, so the view writes no browser selection for it.
   * @param {number} anchor
   * @param {number} head
   */
  selectInside(anchor, head) {
    const face = this.inside(anchor);
    if (!face || face !== this.inside(head)) { this.lastInner = null; return false; }
    const start = /** @type {number} */ (face.getPos()) + 1;
    const last = this.lastInner;
    if (!last || last[0] !== face || last[1] !== anchor - start || last[2] !== head - start) {
      this.lastInner = [face, anchor - start, head - start];
      face.view.setSelection?.(anchor - start, head - start, this.view.root);
    }
    return true;
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
