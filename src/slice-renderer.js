/**
 * The default `SliceRenderer`, and the two walks that read its position map: `pointAt` (a position to the DOM point that shows it) and `posAt` (a DOM point to the position it stands for).
 *
 * @remarks
 * The slice is `doc.slice(from, to, true)`: with its parents included it is rooted at the document, so its content opens with the ancestors of `from` as partial nodes, and the schema's own `DOMSerializer` writes them as elements cut where the fragment begins (`<ul><li>` holding only what follows the cut). That is the hollow ancestor a page engine otherwise builds by hand, and the plan's first gift.
 *
 * While the serializer writes, the renderer records for every DOM node it creates the model range that node stands for, in a `WeakMap`, so `pointAt` and `posAt` answer from the map and never walk the DOM against the document. The recording rides on the serializer's own recursion: `serializeNodeInner` and `serializeMark` are replaced on one serializer instance, the first with the six lines of the original written out so the content element is in hand. Those two methods are marked internal in `prosemirror-model` 1.25.12; a release that renames them breaks this file and nothing else.
 *
 * Positions inside the open ancestors are virtual (their opening tokens lie before `from`), so every recorded range is clamped to the slice: an open ancestor starts, for this map, at `from`, the first position the fragment shows.
 *
 * An empty textblock, or one ending in a hard break, gets a trailing `<br>` with no entry in the map, as `prosemirror-view` does, so it has a line's height and a place for the caret.
 *
 * Phase 1 renders the slice plainly: shallow siblings and instance stamps are phase 3's (docs/plan.md, "Phases").
 *
 * @packageDocumentation
 */

import { DOMSerializer } from 'prosemirror-model';

/** @import { Node as PMNode, Schema } from 'prosemirror-model' */
/** @import { RenderedSlice, Span } from './fragmentainer.js' */

/** The class of the display-only break an empty textblock receives. */
export const TRAILING_BREAK = 'fragview-trailing-break';

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
  const clamp = (/** @type {number} */ p) => Math.min(end, Math.max(from, p));
  /** @type {HTMLElement[]} */
  const marks = [];
  let cursor = from - slice.openStart;

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
  /** @type {any} */ (serializer).serializeNodeInner = (/** @type {PMNode} */ node) => {
    const start = cursor;
    if (node.isText) {
      const text = document.createTextNode(/** @type {string} */ (node.text));
      cursor = start + node.nodeSize;
      positions.set(text, { start: clamp(start), end: clamp(cursor) });
      return text;
    }
    const { dom, contentDOM } = DOMSerializer.renderSpec(document, base.nodes[node.type.name](node), null, node.attrs);
    /** @type {Span} */
    const span = { start: clamp(start), end: clamp(start + node.nodeSize) };
    if (contentDOM) {
      if (node.isLeaf) throw new RangeError('Content hole not allowed in a leaf node spec');
      cursor = start + 1;
      serializer.serializeFragment(node.content, options, /** @type {HTMLElement} */ (contentDOM));
      const content = { contentStart: clamp(start + 1), contentEnd: clamp(start + node.nodeSize - 1) };
      if (contentDOM === dom) Object.assign(span, content);
      else positions.set(contentDOM, { start: content.contentStart, end: content.contentEnd, ...content });
      if (node.inlineContent && (!contentDOM.lastChild || contentDOM.lastChild.nodeName === 'BR')) {
        const br = document.createElement('br');
        br.className = TRAILING_BREAK;
        contentDOM.appendChild(br);
      }
    }
    cursor = start + node.nodeSize;
    positions.set(dom, span);
    return dom;
  };
  serializer.serializeFragment(slice.content, options, fragment);

  // A mark's element was recorded before its content existed; its end is its last content's end. Inner marks were created after outer ones, so the reverse order settles the inner first.
  for (let i = marks.length - 1; i >= 0; i--) {
    const last = lastSpan(marks[i], positions);
    const span = /** @type {Span} */ (positions.get(marks[i]));
    if (last) span.end = last.end;
  }
  return { fragment, positions, from, to: end };
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
