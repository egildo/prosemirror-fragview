/**
 * The default `SliceRenderer`, and the two walks that read its position map: `pointAt` (a position to the DOM point that shows it) and `posAt` (a DOM point to the position it stands for).
 *
 * @remarks
 * The slice is `doc.slice(from, to, true)`: with its parents included it is rooted at the document, so its content opens with the ancestors of `from` as partial nodes, and the schema's own `DOMSerializer` writes them as elements cut where the fragment begins (`<ul><li>` holding only what follows the cut). That is the hollow ancestor a page engine otherwise builds by hand, and the plan's first gift.
 *
 * While the serializer writes, the renderer records for every DOM node it creates the model range that node stands for, in a `WeakMap`, so `pointAt` and `posAt` answer from the map and never walk the DOM against the document. The recording rides on the serializer's own recursion: `serializeNodeInner` and `serializeMark` are replaced on one serializer instance, the first with the six lines of the original written out so the content element is in hand. Those two methods are marked internal in `prosemirror-model` 1.25.12; a release that renames them breaks this file and nothing else.
 *
 * Positions inside the open ancestors are virtual (their opening tokens lie before `from`), so every recorded range is clamped to the slice: an open ancestor starts, for this map, at `from`, the first position the fragment shows. The exception is an ancestor that opens at `from` itself, when `from` is the first position inside one or more nodes (a cut at the first line of a list item): those nodes are wholly the fragment's, so the clamp is `openedAt(doc, from)`, the position before the outermost of them, and their opening positions are shown here.
 *
 * An empty textblock, or one ending in a hard break, gets a trailing `<br>` with no entry in the map, as `prosemirror-view` does, so it has a line's height and a place for the caret. Only a textblock: an empty inline node (an empty `span` that carries generated content) is left empty.
 *
 * The fragment a paginator's CSS expects (phase 3, docs/plan.md). The renderer marks elements with the attribute `data-beltype`, a space-separated list of words, and uses exactly the words of BelType's Cicero (`packages/engine-cicero/src/data-beltype.js` in BelType, the registry), adding a word to what an element already carries and never setting the whole attribute:
 * - `away` on a SHALLOW SIBLING: at every open depth of the slice whose node holds blocks (the document, and each divided ancestor), the children before the live one, `$from.index(d)` of them, are written as empty elements with their tag and attributes, so `:nth-child`, `+` and `~` read as in the source. None are written after the cut: those siblings are on later fragments. A textblock's inline children before the cut are not written: they are the previous fragment's lines. A node the page does not draw (its spec says `unshown`) is no sibling.
 * - `split` on every element the fragment divides: an ancestor opened at the start (it began on an earlier fragment) or cut at the end (it goes on in a later one).
 * - `end` on a divided piece that holds the box's end (opened at the start only); `start` on one that holds its beginning (cut at the end only). A piece divided at both edges carries neither.
 * - `fragment` on the root of a divided piece, the outermost divided element, a child of the fragment itself.
 * - `adjoin` on the first-child chain after a cut between boxes: the nodes that open where the fragment starts (from `openedAt(doc, from)` to `from`), whose top margin adjoins the cut and is truncated. A fragment starts inside a textblock, as every cut does.
 * The two stylesheets a host adopts for these words are `AWAY_SHEET` and `CONTINUATION_SHEET`.
 *
 * ORDINALS. An `ol` the fragment opens shows its items from the live one, its earlier items `away` and so without boxes, so the first displayed `li` gets HTML's own `value` attribute, its ordinal by HTML's algorithm (§4.4.8: the list's `start`, else the count of its items when `reversed`, else 1; an earlier item's `value` resets the count; each item counts one, down when `reversed`), unless it carries a `value` of its own. A `reversed` list cut at the end holds fewer items than the source, and Chromium counts down from the items present, so its first item is numbered the same way.
 *
 * STRUCTURED MARKS. A mark type whose spec says `structured: true` carries `{ instance, parent }` among its attributes (the studio's generic schema, `buildSchema({ marks: 'structured' })`). For such marks the inline tree is rebuilt from each run's chain of instances, as the studio's own serializer does: adjacent runs sharing an instance share one element, the parent pointers fix the nesting, and ProseMirror's rank order is never used. Each element written for an instance carries `data-txt-i="<instance>"` (`INSTANCE_STAMP`), and so does an inline atom whose attributes carry an `instance` (the studio's empty inline), so a reparse can recover identity. A schema without structured marks is serialized as ProseMirror does, and stamps nothing.
 *
 * A node type whose spec says `unshown: true` (the studio's whitespace and comment leaves between blocks) is drawn as nothing: it keeps its positions and has no DOM, as the studio's page serializer does.
 *
 * Shallow siblings, the dressing words, the `value` and the stamps map to no position: the map is what it was without them.
 *
 * @packageDocumentation
 */

import { DOMSerializer } from 'prosemirror-model';

/** @import { Node as PMNode, Schema, Fragment, Mark } from 'prosemirror-model' */
/** @import { RenderedSlice, Span } from './fragmentainer.js' */

/** The class of the display-only break an empty textblock receives. */
export const TRAILING_BREAK = 'fragview-trailing-break';

/** The attribute that carries a structured mark's instance on the element written for it. */
export const INSTANCE_STAMP = 'data-txt-i';

/** The attribute of words, and the words, as BelType's Cicero spells them (its `data-beltype.js`). */
export const WORDS = 'data-beltype';
export const AWAY = 'away', SPLIT = 'split', START = 'start', END = 'end', FRAGMENT = 'fragment', ADJOIN = 'adjoin';

/** `[data-beltype~="word"]`. @param {string} word */
const w = (word) => `[${WORDS}~="${word}"]`;

/** The rule a host adopts so a shallow sibling takes no box: it stays an element, so structural selectors read as in the source. */
export const AWAY_SHEET = `${w(AWAY)} { display: none !important; }`;

/**
 * The rules a host adopts for a divided box, Cicero's own (its `WORDS_RULES`, without the counter and `wrapped` rules, since this renderer continues HTML's list numbering through `value` and no other counter): a resumed piece gives up the margin, border and padding at its top edge, its indent and its list marker, which stand on the piece that began it; a cut-off piece gives up its bottom margin, border and padding; the first-child chain after a cut between boxes gives up its top margin.
 */
export const CONTINUATION_SHEET = [
  `${w(SPLIT)}:not(${w(START)}) { margin-top: 0 !important; border-top-width: 0 !important; padding-top: 0 !important; text-indent: 0 !important; }`,
  `li${w(SPLIT)}:not(${w(START)})::marker { content: none; }`,
  `${w(SPLIT)}:not(${w(END)}) { margin-bottom: 0 !important; border-bottom-width: 0 !important; padding-bottom: 0 !important; }`,
  `${w(ADJOIN)} { margin-top: 0 !important; }`,
].join('\n');

/**
 * Add a word to an element's list, keeping what it carries.
 * @param {Element} el
 * @param {string} word
 */
export function addWord(el, word) {
  const words = (el.getAttribute(WORDS) ?? '').split(/\s+/).filter(Boolean);
  if (!words.includes(word)) el.setAttribute(WORDS, [...words, word].join(' '));
}

/** @type {WeakMap<Schema, DOMSerializer>} */
const serializers = new WeakMap();

/**
 * Render the slice of `doc` from `from` to `to` (to the end when `to` is null) with the schema's `DOMSerializer`, and record the position map.
 * @param {PMNode} doc
 * @param {number} from
 * @param {number | null} to
 * @param {Document} [document] The document to create nodes in; the global one when omitted.
 * @returns {RenderedSlice}
 */
export function renderSlice(doc, from, to, document = globalThis.document) {
  const end = to ?? doc.content.size;
  const schema = doc.type.schema;
  let base = serializers.get(schema);
  if (!base) serializers.set(schema, (base = DOMSerializer.fromSchema(schema)));
  /** @type {WeakMap<globalThis.Node, Span>} */
  const positions = new WeakMap();
  const fragment = document.createDocumentFragment();
  if (from >= end) return { fragment, positions, from, to: end };

  const slice = doc.slice(from, end, true);
  const $from = doc.resolve(from);
  const opened = openedAt(doc, from);
  const clamp = (/** @type {number} */ p) => Math.min(end, Math.max(opened, p));
  const structured = Object.values(schema.marks).some((m) => m.spec.structured);
  /** @type {HTMLElement[]} */
  const marks = [];
  let cursor = from - slice.openStart;
  /** The depth of the last divided ancestor met on the way down the slice's open start. */
  let depth = 0;

  // One instance per render, so the cursor and the map are this render's alone.
  const serializer = new DOMSerializer(base.nodes, base.marks);
  const options = { document };
  /** @type {any} */ (serializer).serializeMark = (/** @type {any} */ mark, /** @type {boolean} */ inline) => {
    const toDOM = base.marks[mark.type.name];
    const spec = toDOM && DOMSerializer.renderSpec(document, toDOM(mark, inline), null, mark.attrs);
    if (spec) {
      positions.set(spec.dom, { start: clamp(cursor), end: clamp(cursor), mark: true });
      marks.push(/** @type {HTMLElement} */ (spec.dom));
    }
    return spec;
  };
  /** @type {any} */ (serializer).serializeNodeInner = (/** @type {PMNode} */ node, /** @type {any} */ opts = options) => {
    const start = cursor;
    if (node.isText) {
      const text = document.createTextNode(/** @type {string} */ (node.text));
      cursor = start + node.nodeSize;
      positions.set(text, { start: clamp(start), end: clamp(cursor) });
      return text;
    }
    if (node.type.spec.unshown) {
      cursor = start + node.nodeSize;
      return document.createDocumentFragment();
    }
    const { dom, contentDOM } = DOMSerializer.renderSpec(document, base.nodes[node.type.name](node), null, node.attrs);
    /** @type {Span} */
    const span = { start: clamp(start), end: clamp(start + node.nodeSize) };
    // Virtual positions: an ancestor opened at the start begins before what is shown, one cut at the end runs past it (its slice node closes after `end`).
    const resumed = start < opened, cutOff = start + node.nodeSize > end;
    if (resumed || cutOff) addWord(/** @type {Element} */ (dom), SPLIT);
    if (resumed && !cutOff) addWord(/** @type {Element} */ (dom), END);
    if (cutOff && !resumed) addWord(/** @type {Element} */ (dom), START);
    if (!resumed && !node.isInline && start >= opened && start < from) addWord(/** @type {Element} */ (dom), ADJOIN);
    if (node.isInline && node.isLeaf && structured && typeof node.attrs.instance === 'string') /** @type {Element} */ (dom).setAttribute(INSTANCE_STAMP, node.attrs.instance);
    if (contentDOM) {
      if (node.isLeaf) throw new RangeError('Content hole not allowed in a leaf node spec');
      // A divided ancestor is the open node at the next depth of `$from`: its children before the live one go first, put away.
      const container = resumed && !node.inlineContent && depth < $from.depth ? $from.node(++depth) : null;
      if (container) writeSiblings(container, $from.index(depth), /** @type {HTMLElement} */ (contentDOM));
      cursor = start + 1;
      serializer.serializeFragment(node.content, opts, /** @type {HTMLElement} */ (contentDOM));
      // A reversed list without `start` counts down from its number of items, and a list cut at the end shows only some: it is numbered from the whole list too.
      const list = container ?? (cutOff && contentDOM.nodeName === 'OL' && /** @type {Element} */ (contentDOM).hasAttribute('reversed') ? doc.nodeAt(start) : null);
      if (list && contentDOM.nodeName === 'OL') numberFirst(list, /** @type {HTMLElement} */ (contentDOM));
      const content = { contentStart: clamp(start + 1), contentEnd: clamp(start + node.nodeSize - 1) };
      if (contentDOM === dom) Object.assign(span, content);
      else positions.set(contentDOM, { start: content.contentStart, end: content.contentEnd, ...content });
      if (node.isTextblock && (!contentDOM.lastChild || contentDOM.lastChild.nodeName === 'BR')) {
        const br = document.createElement('br');
        br.className = TRAILING_BREAK;
        contentDOM.appendChild(br);
      }
    }
    cursor = start + node.nodeSize;
    positions.set(dom, span);
    return dom;
  };
  if (structured) {
    // The inline tree from the instances' chains: the studio's `Serializer.serializeFragment` (src/schema-generic.js), with the elements made through `serializeMark` so they are recorded, and stamped.
    /** @type {any} */ (serializer).serializeFragment = (/** @type {Fragment} */ content, /** @type {any} */ opts = options, /** @type {any} */ target) => {
      if (!content.firstChild?.isInline) return DOMSerializer.prototype.serializeFragment.call(serializer, content, opts, target);
      target ??= document.createDocumentFragment();
      /** @type {Set<string>} */
      const outer = opts.outer ?? new Set();
      /** @type {{ instance: string, dom: globalThis.Node }[]} */
      const stack = [];
      content.forEach((node) => {
        const own = node.marks.filter((m) => m.type.spec.structured);
        const chain = chainOf(own.filter((m) => !outer.has(m.attrs.instance)));
        let keep = 0;
        while (keep < stack.length && keep < chain.length && stack[keep].instance === chain[keep].attrs.instance) keep++;
        stack.length = keep;
        for (const m of chain.slice(keep)) {
          const spec = /** @type {any} */ (serializer).serializeMark(m, true);
          if (!spec) continue;
          /** @type {Element} */ (spec.dom).setAttribute(INSTANCE_STAMP, m.attrs.instance);
          (stack.at(-1)?.dom ?? target).appendChild(spec.dom);
          stack.push({ instance: m.attrs.instance, dom: spec.contentDOM ?? spec.dom });
        }
        // ProseMirror marks an inline node and the text inside it alike: the node's own content leaves out the instances it stands inside.
        const inner = node.isText ? opts : { ...opts, outer: new Set([...outer, ...own.map((m) => m.attrs.instance)]) };
        (stack.at(-1)?.dom ?? target).appendChild(/** @type {any} */ (serializer).serializeNodeInner(node, inner));
      });
      return target;
    };
  }

  /**
   * Write the first `count` children of `container` into `into` as shallow siblings: each node's outer element, with its attributes and no children, put away.
   * @param {PMNode} container
   * @param {number} count
   * @param {Node | DocumentFragment} into
   */
  function writeSiblings(container, count, into) {
    for (let i = 0; i < count; i++) {
      const el = shallow(container.child(i));
      if (el) into.appendChild(el);
    }
  }
  /** @param {PMNode} node */
  function shallow(node) {
    if (node.isText || node.type.spec.unshown) return null;
    const { dom } = DOMSerializer.renderSpec(document, base.nodes[node.type.name](node), null, node.attrs);
    const el = /** @type {Element} */ (dom.cloneNode(false));
    addWord(el, AWAY);
    return el;
  }
  /**
   * Give the first displayed `li` of an opened `ol` its ordinal as `value`, by HTML's algorithm over the items before it, which are put away.
   * @param {PMNode} list
   * @param {HTMLElement} ol
   */
  function numberFirst(list, ol) {
    const first = [...ol.children].find((c) => !c.matches(w(AWAY)));
    if (!first || first.nodeName !== 'LI' || integer(first.getAttribute('value')) != null) return;
    const step = ol.hasAttribute('reversed') ? -1 : 1;
    let n = integer(ol.getAttribute('start'));
    if (n == null) {
      n = 1;
      if (step < 0) { n = 0; list.forEach((child) => { if (shallow(child)?.nodeName === 'LI') n++; }); }
    }
    for (const el of ol.children) {
      if (el === first) break;
      if (el.nodeName !== 'LI') continue;
      n = integer(el.getAttribute('value')) ?? n;
      n += step;
    }
    first.setAttribute('value', String(n));
  }

  writeSiblings(doc, $from.index(0), fragment);
  serializer.serializeFragment(slice.content, options, fragment);
  for (const el of fragment.children) if (el.matches(w(SPLIT))) addWord(el, FRAGMENT);

  // A mark's element was recorded before its content existed; its end is its last content's end. Inner marks were created after outer ones, so the reverse order settles the inner first.
  for (let i = marks.length - 1; i >= 0; i--) {
    const last = lastSpan(marks[i], positions);
    const span = /** @type {Span} */ (positions.get(marks[i]));
    if (last) span.end = last.end;
  }
  return { fragment, positions, from: opened, to: end };
}

/**
 * HTML's rules for parsing an integer (§2.3.4.1), as `parseInt` reads them: null when there is none.
 * @param {string | null} text
 */
function integer(text) {
  if (text == null) return null;
  const n = parseInt(text.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * A run's structured marks, outermost first: from a root (its parent is not on the run) down the parent pointers. A mark a command made (parent `'*'`) stands innermost, inside whatever the run already wears; so does any mark whose pointers lead nowhere on this run. The studio's `chainOf` (src/schema-generic.js), as it is there.
 * @param {readonly Mark[]} marks
 * @returns {Mark[]}
 */
function chainOf(marks) {
  if (marks.length < 2) return [...marks];
  const ids = new Set(marks.map((m) => m.attrs.instance));
  const left = [...marks];
  const out = [];
  let cur = null;
  for (;;) {
    let i = left.findIndex((m) => m.attrs.parent !== '*' && (cur == null ? !ids.has(m.attrs.parent) : m.attrs.parent === cur));
    if (i < 0) i = left.findIndex((m) => m.attrs.parent !== '*' && !ids.has(m.attrs.parent));
    if (i < 0) break;
    cur = left[i].attrs.instance;
    out.push(...left.splice(i, 1));
  }
  return out.concat(left);
}

/**
 * The position before the outermost node that opens at `pos`: `pos` itself unless `pos` is the first position inside one or more nodes. A cut there opens those nodes, so the fragment that ends at the cut shows up to this position and the next fragment shows them from it.
 * @param {PMNode} doc
 * @param {number} pos
 */
export function openedAt(doc, pos) {
  const $pos = doc.resolve(pos);
  let end = pos;
  for (let d = $pos.depth; d > 0 && $pos.start(d) === end; d--) end = $pos.before(d);
  return end;
}

/**
 * The span of the last DOM descendant of `node` that has one, searching from the end.
 * @param {globalThis.Node} node
 * @param {WeakMap<globalThis.Node, Span>} positions
 * @returns {Span | null}
 */
function lastSpan(node, positions) {
  for (let child = node.lastChild; child; child = child.previousSibling) {
    const span = positions.get(child) ?? lastSpan(child, positions);
    if (span) return span;
  }
  return null;
}

/**
 * The span of the first DOM descendant of `node` that has one.
 * @param {globalThis.Node} node
 * @param {WeakMap<globalThis.Node, Span>} positions
 * @returns {Span | null}
 */
function firstSpan(node, positions) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const span = positions.get(child) ?? firstSpan(child, positions);
    if (span) return span;
  }
  return null;
}

/**
 * The DOM point under `root` that shows `pos`, read from the position map, or null when `pos` lies outside every span under `root`.
 *
 * @remarks
 * Between two pieces of inline content the point goes into the earlier one (the end of a bold run rather than the start of the plain text after it), as `prosemirror-view` does for a cursor with no side given. A position between two blocks is a point in their parent, before the later block.
 * @param {globalThis.Node} root
 * @param {WeakMap<globalThis.Node, Span>} positions
 * @param {number} pos
 * @returns {{ node: globalThis.Node, offset: number } | null}
 */
export function pointAt(root, positions, pos) {
  const first = firstSpan(root, positions), last = lastSpan(root, positions);
  if (!first || !last || pos < first.start || pos > last.end) return null;
  return pointIn(root, positions, pos);
}

/**
 * @param {globalThis.Node} parent
 * @param {WeakMap<globalThis.Node, Span>} positions
 * @param {number} pos
 * @returns {{ node: globalThis.Node, offset: number }}
 */
function pointIn(parent, positions, pos) {
  let offset = 0;
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const span = positions.get(child);
    if (!span) continue; // display only: the trailing break
    if (pos < span.start) return { node: parent, offset: i };
    if (pos > span.end) { offset = i + 1; continue; }
    if (child.nodeType === 3) return { node: child, offset: pos - span.start };
    if (span.contentStart != null) {
      if (pos >= span.contentStart && pos <= /** @type {number} */ (span.contentEnd)) return pointIn(child, positions, pos);
    } else if (span.mark) {
      return pointIn(child, positions, pos);
    } else if (child.firstChild && pos > span.start && pos < span.end) {
      return pointIn(child, positions, pos); // a node whose content sits in an inner element, as `<pre><code>`
    }
    if (pos === span.start) return { node: parent, offset: i };
    offset = i + 1;
  }
  return { node: parent, offset };
}

/**
 * The position the DOM point (`node`, `offset`) stands for, read from the position map, or null when nothing under or around the point is mapped.
 * @param {globalThis.Node} root The element the slice was rendered into; the walk up stops there.
 * @param {WeakMap<globalThis.Node, Span>} positions
 * @param {globalThis.Node} node
 * @param {number} offset
 * @returns {number | null}
 */
export function posAt(root, positions, node, offset) {
  const own = positions.get(node);
  if (node.nodeType === 3) {
    return own ? Math.min(own.start + offset, own.end) : posAround(root, positions, node);
  }
  const children = node.childNodes;
  for (let i = offset; i < children.length; i++) {
    const span = positions.get(children[i]) ?? firstSpan(children[i], positions);
    if (span) return span.start;
  }
  if (own?.contentEnd != null) return own.contentEnd;
  for (let i = Math.min(offset, children.length) - 1; i >= 0; i--) {
    const span = positions.get(children[i]) ?? lastSpan(children[i], positions);
    if (span) return span.end;
  }
  if (own) return own.contentStart ?? own.start;
  return posAround(root, positions, node);
}

/**
 * The position just before an unmapped node, read from its parent.
 * @param {globalThis.Node} root
 * @param {WeakMap<globalThis.Node, Span>} positions
 * @param {globalThis.Node} node
 * @returns {number | null}
 */
function posAround(root, positions, node) {
  const parent = node.parentNode;
  if (!parent || node === root) return null;
  return posAt(root, positions, parent, Array.prototype.indexOf.call(parent.childNodes, node));
}
