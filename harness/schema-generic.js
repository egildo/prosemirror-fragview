// Copied 2026-11-07 from beltype-studio-experiment, src/schema-generic.js at 83565e2, when that checkout stopped being a place to read from. This is the generic schema the harness, the phase 3 scripts and prosemirror-beltype's specimen measurement parse documents with. The comments below are the file's own, written for the studio.
// The generous schema (the generic-schema round, 2026-10-23, notes/generic-schema-results.md): HTML's own content models as a ProseMirror schema, so that any body the belt or an author writes parses into the state without loss and serializes back as it came, and the parse doubles as a linter that says what the content models refused. Selected by `?schema=generic` (src/providers/demo.js); src/schema.js stays the studio's schema.
//
// THE TABLE is written from the WHATWG HTML Living Standard: each element's categories and the children its content model admits, from its own entry (§4.3 Sections, §4.4 Grouping content, §4.5 Text-level semantics, §4.7 Edits, §4.8 Embedded content, §4.9 Tabular data, §4.10 Forms, §4.11 Interactive elements, §4.12 Scripting, §4.13 Custom elements), the categories from §3.2.5.2 Kinds of content, transparent content from §3.2.5.3, and the rule that inter-element whitespace and comments are ignored when matching a content model from §3.2.5.
//
// THE SCHEMA ACCEPTS THE PARSER'S DOM; THE LINTER JUDGES CONFORMANCE (run two, 2026-10-23). A content expression admits every child the element's model names, in ANY order: the browser's HTML parser keeps `tfoot` before `tbody` in one table (and Cicero paginates that shape, BelType case 110), and a schema that refuses an order the parser's DOM can hold makes ProseMirror's parser repair it (run one: the showcase's roster table became two tables). The standard's order (a table's `caption? colgroup* thead? (tbody* | tr+) tfoot?`, a `dl`'s groups, a `figure`'s caption first or last, a `details`' summary first, a `picture`'s `img` last, a `fieldset`'s legend first, an `hgroup`'s one heading) is `GRAMMAR` below, which `lint` reports as nonconforming and never repairs.
//
// The decisions, each measured in the round:
// - A ProseMirror node holds either inline content or block content, never both; HTML's flow content mixes them (`<li>text<ol>…</ol></li>`). So flow content is `(run | block)*`: a RUN is an anonymous textblock that holds a stretch of phrasing content, written back as its bare children (the saved document has no trace of it) and drawn on the page as `<txt-run>`, an unknown element, inline and without margins, so the layout is the phrasing's own. Phrasing intermixed with something else (a `summary`'s or a `legend`'s headings) is `(run | heading)*` the same way.
// - Inline elements are NODES with inline content, not marks, so they nest freely, carry any attributes and may be empty. With `{ marks: true }` five phrase elements the studio already had as marks (em, strong, cite, sub, sup) are marks again, with the same attribute map: the round measures what that costs.
// - Transparent content (`a`, `ins`, `del`, `map`, `slot`, and every custom or unknown element) is two node types, an inline one with phrasing content and a block one (`a_block`…) with flow content, chosen at parse by what the element holds: one with a flow-only element inside it is the block. A union is impossible (a node is inline or it is not), and one block type for all would put every link in the text in a box of its own.
// - Whitespace is parsed with `preserveWhitespace: 'full'`. Whitespace and comments where text is not content (between blocks, between a table's rows, a select's options) become leaves of their own (`ws`, `comment`, and `_inline` twins inside inline structure), written back as the text or the comment they were. Their attributes are required, so ProseMirror never creates one to fill a gap.
// - `style`, `script`, `template`, `noscript`, `svg`, `math`, `object`, `iframe`, `canvas` and `textarea` are carried verbatim: an atom that keeps its `outerHTML`, drawn as it was with `contenteditable="false"` and written back exactly (`raw_block`, `raw_inline`).
// - Every attribute of every element rides in one attribute map, `attrs`, as the source has it.
// - A content model that depends on where the element stands is one node type per place: a `div` in a `dl` (`dl_div`, `dt+ dd+`) is not a `div` in a section (flow).
// - What a ProseMirror content expression cannot say is left generous and named: rules on descendants (no `a` inside an `a`, no interactive content inside a `button`, no `header` inside a `footer`, no `form` inside a `form`), attribute-dependent models (a `colgroup` with `span` is empty), and the standard's newer customizable `select`. `lint` checks the descendant rules on the source instead.
import { DOMParser as PMParser, DOMSerializer, Mark, Schema } from 'prosemirror-model';
import { AddMarkStep, RemoveMarkStep, Transform } from 'prosemirror-transform';
/** What the studio's `src/schema.js` gave this file, written out here so nothing outside the harness is read: the document's item on the body, and a page of another PDF as an atom. */
const BODY = ['itemscope', 'itemid', 'itemtype'];
const GLOBAL = ['class', 'id', 'lang', 'aria-label', 'itemscope', 'itemid', 'itemtype', 'itemprop'];
const nullAttrs = (names) => Object.fromEntries(names.map((n) => [n, { default: null }]));
const read = (names) => (dom) => Object.fromEntries(names.map((n) => [n, dom.getAttribute(n)]));
const write = (node, skip = []) => Object.fromEntries(Object.entries(node.attrs).filter(([k, v]) => v != null && !skip.includes(k)));
const bodyAttrs = read(BODY);
const facsimile = {
  attrs: { data: { default: '' }, alt: { default: '' }, ...nullAttrs(GLOBAL) },
  atom: true,
  draggable: false,
  group: 'block',
  parseDOM: [{ tag: 'object[type="application/pdf"]', getAttrs: (dom) => ({ ...read(GLOBAL)(dom), data: dom.getAttribute('data') ?? '', alt: dom.querySelector('img')?.getAttribute('alt') ?? '' }) }],
  toDOM: (node) => ['object', { type: 'application/pdf', data: node.attrs.data, ...write(node, ['data', 'alt']) }, ['img', { alt: node.attrs.alt }]],
};

/**
 * The attribute a host puts on an element it drew from a `<template data-repeat>` (a row of the bill's readings) before the parse, so the rows are nodes the view can cut between: the page draws them, the saved document drops them, since the template and the array's reference are what is saved (src/repeat.js). The demo provider sets it (`repeatRows`); the generic-ground round, 2026-10-24.
 */
export const REPEATED = 'data-studio-repeated';

export { PMParser }; // for a check that parses with the studio's schema beside this one (scripts/generic-schema.mjs): a page cannot import a bare specifier
export { Transform }; // for the door's check (scripts/generic-schema-door.mjs), which writes through it, for the same reason

/** The attribute map of an element, in source order. */
export const attrsOf = (el) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
const map = { attrs: { default: {} } };
const getAttrs = (dom) => ({ attrs: attrsOf(dom) });
/** The element a raw node's markup stands for. */
export const rawElement = (html) => { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild; };

// The content expressions. `flow` is §3.2.5.2.2 flow content, `phrasing` §3.2.5.2.5 phrasing content; `inert` is what §3.2.5 says a content model ignores (whitespace, comments) plus the script-supporting elements most models admit, `inert_i` its inline twin.
const FLOW = '(run | block)*';
const PHRASING = 'phrasing*';
const LIST = '(list_item | inert)*';

/**
 * THE TABLE: tag → [kind, content, name]. Kind: `block` (flow content and not phrasing: a block node), `inline` (phrasing: an inline node), `part` (an element that lives only inside its parent; its block-ness is its parent's: `blockPart` or `inlinePart`), `both` (transparent: two node types), `raw` (carried verbatim), `void` (a leaf). Name: the node's name where the studio already has one (paragraph, heading, the lists), else the tag.
 */
const BLOCK = {
  // §4.3 Sections
  article: FLOW, section: FLOW, nav: FLOW, aside: FLOW, header: FLOW, footer: FLOW, address: FLOW,
  hgroup: '(paragraph | heading | inert)*',
  // §4.4 Grouping content
  p: PHRASING, pre: PHRASING, blockquote: FLOW, main: FLOW, search: FLOW, div: FLOW,
  ol: LIST, ul: LIST, menu: LIST,
  dl: '(dt | dd | dl_div | inert)*',
  figure: '(run | figcaption | block)*',
  // §4.9 Tabular data
  table: '(caption | colgroup | thead | tbody | tfoot | tr | inert)*',
  // §4.10 Forms, §4.11 Interactive elements
  form: FLOW, fieldset: '(run | legend | block)*', details: '(run | summary | block)*', dialog: FLOW
};
const BLOCK_PARTS = {
  li: FLOW, dt: FLOW, dd: FLOW, figcaption: FLOW, caption: FLOW, td: FLOW, th: FLOW,
  thead: '(tr | inert)*', tbody: '(tr | inert)*', tfoot: '(tr | inert)*', tr: '(td | th | inert)*', colgroup: '(col | inert)*',
  legend: '(run | heading)*', summary: '(run | heading)*'
};
const INLINE = Object.fromEntries([
  // §4.5 Text-level semantics, §4.10 Forms (label, button, output, meter, progress)
  ...'em strong small s cite q dfn abbr data time code var samp kbd sub sup i b u mark bdi bdo span label button output meter progress'.split(' ').map((t) => [t, PHRASING]),
  // §4.5 ruby: phrasing followed by its annotations, once or more (rp only around rt)
  ['ruby', '(phrasing | rt | rp)*'],
  // §4.8 Embedded content
  ['picture', '(source | img | inert_i)*'],
  ['video', '(source | track | inert_i | phrasing)*'], ['audio', '(source | track | inert_i | phrasing)*'],
  // §4.10 Forms
  ['select', '(option | optgroup | inert_i)*'], ['datalist', '(option | inert_i | phrasing)*'], ['optgroup', '(option | inert_i)*']
]);
const INLINE_PARTS = { rt: PHRASING, rp: PHRASING, option: 'text*' };
const VOID_INLINE = ['br', 'wbr', 'img', 'input', 'embed', 'area', 'source', 'track', 'link', 'meta'];
const VOID_BLOCK = ['hr', 'col'];
const BOTH = ['a', 'ins', 'del', 'map', 'slot'];
const RAW = ['style', 'script', 'template', 'noscript', 'svg', 'math', 'object', 'iframe', 'canvas', 'textarea'];
const PARTS_OF = new Set([...Object.keys(BLOCK_PARTS), ...Object.keys(INLINE_PARTS), 'source', 'track', 'col']);
const NAMES = { p: 'paragraph', ul: 'bullet_list', ol: 'ordered_list', li: 'list_item' };
const nameOf = (tag) => NAMES[tag] ?? tag;
/** A tag the table knows. */
export const KNOWN = new Set([...Object.keys(BLOCK), ...Object.keys(BLOCK_PARTS), ...Object.keys(INLINE), ...Object.keys(INLINE_PARTS), ...VOID_INLINE, ...VOID_BLOCK, ...BOTH, ...RAW, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const FLOW_ONLY = [...Object.keys(BLOCK), ...Object.keys(BLOCK_PARTS), ...VOID_BLOCK, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const FLOW_ONLY_SET = new Set(FLOW_ONLY);
const FLOW_ONLY_SELECTOR = FLOW_ONLY.join(',');
/** Does a transparent element hold flow content (so it is the block twin)? */
const holdsFlow = (el) => !!el.querySelector(FLOW_ONLY_SELECTOR);
/** The tags whose content admits text where it stands: phrasing content, and flow content through a run. Whitespace in any other element (a table, a list, a select, a picture, a video before its fallback) is a leaf of its own. */
const TEXTY = new Set(['body', 'figure', 'fieldset', 'details', 'legend', 'summary', 'ruby', ...Object.keys(BLOCK).filter((t) => BLOCK[t] === FLOW || BLOCK[t] === PHRASING), ...Object.keys(BLOCK_PARTS).filter((t) => BLOCK_PARTS[t] === FLOW), ...Object.keys(INLINE).filter((t) => INLINE[t] === PHRASING), 'rt', 'rp', 'option', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', ...BOTH]);
/** The tags whose node is inline (so whitespace and comments inside a structural one are inline leaves). */
const INLINE_TAGS = new Set([...Object.keys(INLINE), ...Object.keys(INLINE_PARTS)]);
/** Elements that only take phrasing content: everything inside is inline. */
const PHRASING_ONLY = new Set([...Object.keys(BLOCK).filter((t) => BLOCK[t] === PHRASING), ...Object.keys(INLINE).filter((t) => INLINE[t] === PHRASING), 'rt', 'rp', 'option', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const custom = (el) => !KNOWN.has(el.localName) && el.localName !== 'body';
const isWs = (n) => n.nodeType === 3 && !/[^ \t\r\n\f]/.test(n.data);
/** Is a sibling phrasing content for the run it would stand in: non-blank text, or an element that is phrasing where it stands (raws and comments are not: they never pull a neighbour into a run). */
const phrasingSibling = (n) => (n.nodeType === 3 ? !isWs(n) : n.nodeType === 1 && !RAW.includes(n.localName) && !n.localName.startsWith('txt-') && (INLINE_TAGS.has(n.localName) || VOID_INLINE.includes(n.localName) || ((BOTH.includes(n.localName) || custom(n)) && !holdsFlow(n))));
const neighbour = (n, dir) => { let s = n[dir]; while (s && (s.nodeType === 8 || isWs(s) || (s.nodeType === 1 && (RAW.includes(s.localName) || s.localName.startsWith('txt-'))))) s = s[dir]; return s; };
/** Where a node with two twins (a comment, a raw element, whitespace) stands: inline inside phrasing or inline structure, or next to phrasing content in a flow container; a block anywhere else. */
export function placeOf(n) {
  if (twinEls.has(n.parentElement)) return 'inline'; // inside a textblock twin, everything is phrasing
  const parent = n.parentElement?.localName ?? 'body';
  if (PHRASING_ONLY.has(parent) || INLINE_TAGS.has(parent) || ((BOTH.includes(parent) || (n.parentElement && custom(n.parentElement))) && !holdsFlow(n.parentElement))) return 'inline';
  if (!TEXTY.has(parent)) return 'block';
  const prev = neighbour(n, 'previousSibling'), next = neighbour(n, 'nextSibling');
  return (prev && phrasingSibling(prev)) || (next && phrasingSibling(next)) ? 'inline' : 'block';
}

// ---- THE TEXTBLOCK TWINS (run three) ----
// A flow container that holds only phrasing (`<li value="10">ten</li>`, `<td>12</td>`, `<div class="note">a word</div>`) is a TEXTBLOCK of its own tag, not a block container holding a run: run two drew every one of them as `<li><txt-run>ten</txt-run></li>` on the page, which a `li > *` rule or `li::first-letter` sees. So each flow container has two node types, the block form (flow content) and its textblock twin (`<name>_text`, phrasing content, the same tag and attributes), chosen at parse by the element's children: all phrasing (text, comments, phrasing elements; a single text child counts) is the twin, any block child the block form. A transparent or custom element standing where blocks stand, holding only phrasing, is a twin too, so a lone `<a>` or `<x-note>` between blocks needs no run. The run remains only for MIXED content, text beside blocks in one container, and the linter reports each one it made (`mixed`).
/** The native flow containers that have a twin. `p`, `pre` and the headings are textblocks already; a list, a table, a `dl` (and its `div`), an `hgroup` hold no text in their models. */
const TWIN_TAGS = new Set([...Object.keys(BLOCK).filter((t) => BLOCK[t] === FLOW || ['figure', 'details', 'fieldset'].includes(t)), ...Object.keys(BLOCK_PARTS).filter((t) => BLOCK_PARTS[t] === FLOW || ['summary', 'legend'].includes(t))]);
/** The twins whose Enter makes a sibling of the same kind (a list's item, a description's term or detail): see `splitTwin` in src/input.js. */
const SIBLING_SPLIT = new Set(['li', 'dt', 'dd']);
/** The prepared clone's elements chosen as twins (set by `prepare`, read by the parse rules and by `placeOf`). */
let twinEls = new WeakSet();
/** Does an element hold only phrasing content, at any depth (a `span` holding a `div` is not phrasing, so its container is not a twin: the parser's repair stays inside the container, as before)? */
const phrasingOnly = (el) => !holdsFlow(el);

// ---- THE INLINE LIST (run four, `?lists=inline`) ----
// `<li>text<ol>…</ol></li>` is mixed content, text beside a block, and run three held it as a run beside the list. With the inline list the item is a textblock twin holding its text and then `list_inline`, an INLINE node whose content is the list's items (blocks inside an inline node) and whose markup is the `ol`, `ul` or `menu` with its attributes. Chosen at parse only for that shape: a flow container whose children are phrasing (some of it more than whitespace) and one or more lists, nothing else. Any other mix stays a run.
let listsInline = false;
/** Turns the inline list on or off for the parses that follow (the studio's `?lists=inline`). */
export const setListsInline = (on) => { listsInline = !!on; };
let inlineLists = new WeakSet();
const LIST_TAGS = ['ol', 'ul', 'menu'];
/** Is an element phrasing (more than whitespace) followed or interleaved by lists, and nothing else? */
const phrasingAndLists = (el) => {
  let lists = 0, words = false;
  for (const c of el.childNodes) {
    if (c.nodeType === 3) { if (/\S/.test(c.data)) words = true; continue; }
    if (c.nodeType !== 1) continue;
    if (LIST_TAGS.includes(c.localName)) lists++;
    else if (FLOW_ONLY_SET.has(c.localName) || holdsFlow(c)) return false;
    else words = true;
  }
  return lists > 0 && words;
};
/** The empty text nodes the page draws for a whitespace leaf inside an inline list (the one place a page marks one): src/positions.js counts each as one position. */
const leafTexts = new WeakSet();

// ---- THE STRUCTURED MARKS (run two, `buildSchema({ marks: 'structured' })`) ----
// Inline formatting is marks again, but marks that recover the DOM: one mark type per inline tag (and its property's twin, below), each instance carrying `{ instance, attributes, parent }` (an id minted at parse for the element occurrence, its attributes verbatim, and the instance of its inline parent, null at the textblock). `excludes: ''`, so two marks of one type coexist on a run. The serializer rebuilds the inline tree from the runs' ancestor paths: adjacent runs sharing an instance share one element, the parent pointers fix the nesting order, and ProseMirror's rank order is never used. An element that cannot be a mark is a node, unsplittable, as in run one: one carrying an `id`, one whose computed display in the laid-out source is not `inline`, one the laid-out source shows as a box (padding, border, background, `position`, a counter, generated content). An empty one is a zero-width inline atom, `empty_inline`, written back as the empty element in place.
const STRUCTURED = 'a abbr b bdi bdo cite code data del dfn em i ins kbd mark q s samp small span strong sub sup time u var'.split(' ');
/** The anchor family: not inclusive at its end (a word typed after a link is not in it); every other family is formatting, inclusive. */
const ANCHORS = new Set(['a']);
/**
 * A PROPERTY'S TWIN (Egildo's ruling, 2026-10-27): every family has a second mark type, its name the tag's and this suffix (`span_property`), the same element with the same attributes, which the parse takes where the element carries `itemprop` (a field, or an item another item holds) and which is never inclusive, as ProseMirror's links are: a key typed at either edge of a field stays outside it, ProseMirror giving it the marks `$pos.marks()` keeps. The serializer, the lint and the door read a mark's family (`spec.tag`), never its name; the door's `setAttribute` takes the twin or the family's mark by whether the new attributes carry `itemprop`.
 */
const PROPERTY = '_property';
/** The mark type of a family for an element of these attributes: its property's twin where they carry `itemprop`. */
const markTypeOf = (schema, tag, attributes) => schema.marks[Object.hasOwn(attributes, 'itemprop') ? `${tag}${PROPERTY}` : tag];
/** Why a laid-out inline element must be a node (null: it can be a mark). Without a layout (a detached body) only the `id` is read. */
export function boxReason(el) {
  if (el.hasAttribute('id')) return 'it carries an id';
  const view = el.ownerDocument.defaultView;
  if (!view || !el.isConnected) return null;
  const cs = view.getComputedStyle(el);
  if (cs.display !== 'inline') return `display: ${cs.display}`;
  if (cs.position !== 'static') return `position: ${cs.position}`;
  for (const k of ['Top', 'Right', 'Bottom', 'Left']) {
    if (parseFloat(cs[`padding${k}`])) return 'padding';
    if (parseFloat(cs[`border${k}Width`]) && cs[`border${k}Style`] !== 'none') return 'border';
  }
  if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') return 'background';
  if (cs.counterIncrement !== 'none' || cs.counterReset !== 'none' || cs.counterSet !== 'none') return 'a counter';
  for (const pseudo of ['::before', '::after']) { const c = view.getComputedStyle(el, pseudo).content; if (c && c !== 'none' && c !== 'normal') return `generated content (${pseudo})`; }
  return null;
}
/** The parse's own tables, for the prepared clone's elements: why an element must be a node, and the instance minted for an element that is a mark. */
let nodeReasons = new WeakMap();
let instances = new WeakMap();
let minted = 0;
/** A fresh instance id (parse and commands share the counter, so a minted id never repeats one in the doc). */
export const mint = () => `m${++minted}`;
const isBoxed = (dom) => (nodeReasons.has(dom) ? nodeReasons.get(dom) != null : dom.hasAttribute('id'));
const instanceOf = (dom) => { let id = instances.get(dom); if (!id) instances.set(dom, (id = mint())); return id; };
/** The instance of the nearest enclosing mark element, up to the first ancestor that is not one (a node, a block). */
function parentInstance(dom) {
  for (let e = dom.parentElement; e; e = e.parentElement) {
    if (instances.has(e)) return instances.get(e);
    if (!STRUCTURED.includes(e.localName) || isBoxed(e)) return null;
  }
  return null;
}
/** The elements the serializers made for a structured mark, and for an empty inline atom: what src/positions.js asks to tell a mark's element (no position) from a node's (two) and an atom's (one). */
const markEls = new WeakSet();
const atomEls = new WeakSet();

/**
 * The schema. `marks`: the five phrase elements the studio has as marks (em, strong, cite, sub, sup) are marks with an attribute map instead of nodes.
 */
export function buildSchema({ marks: withMarks = false } = {}) {
  const structured = withMarks === 'structured';
  const MARKS = withMarks === true ? ['em', 'strong', 'cite', 'sub', 'sup'] : [];
  const nodes = {};
  const el = (tag, spec) => ({ attrs: map, parseDOM: [{ tag, getAttrs }], toDOM: (node) => [tag, node.attrs.attrs, 0], ...spec });
  const leaf = (tag, spec) => ({ attrs: map, parseDOM: [{ tag, getAttrs }], toDOM: (node) => [tag, node.attrs.attrs], ...spec });
  // The doc is the body: flow content. `values` and `veneer` are the studio's doc attributes, and `itemscope itemid itemtype` the body's own, the document's item (src/schema.js says why).
  nodes.doc = { attrs: { values: { default: null }, veneer: { default: null }, ...Object.fromEntries(BODY.map((name) => [name, { default: null }])) }, content: FLOW };
  // The paragraph first among the blocks, and the run first in flow: what ProseMirror creates to fill a required place is the first creatable type it meets.
  nodes.paragraph = el('p', { group: 'block', content: PHRASING });
  nodes.run = { content: PHRASING, toDOM: () => ['txt-run', 0], parseDOM: [] };
  nodes.heading = { group: 'block heading', content: PHRASING, attrs: { ...map, level: { default: 2 } }, parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, getAttrs: (dom) => ({ attrs: attrsOf(dom), level }) })), toDOM: (node) => [`h${node.attrs.level}`, node.attrs.attrs, 0] };
  for (const [tag, content] of Object.entries(BLOCK)) if (tag !== 'p') nodes[nameOf(tag)] = el(tag, { group: 'block', content, ...(tag === 'pre' ? { code: true } : {}) });
  nodes.dl_div = { attrs: map, content: '(dt | dd | inert)*', parseDOM: [{ tag: 'dl > div', getAttrs, priority: 55 }], toDOM: (node) => ['div', node.attrs.attrs, 0] };
  for (const [tag, content] of Object.entries(BLOCK_PARTS)) nodes[nameOf(tag)] = el(tag, { content, ...(tag === 'li' ? { defining: true } : {}) });
  for (const tag of VOID_BLOCK) nodes[tag] = leaf(tag, tag === 'hr' ? { group: 'block' } : {});
  for (const tag of BOTH) {
    nodes[`${tag}_block`] = el(tag, { group: 'block', content: FLOW, parseDOM: [{ tag, getAttrs, priority: 40 }] });
  }
  nodes.custom_block = { group: 'block', content: FLOW, attrs: { tag: {}, ...map }, parseDOM: [{ tag: '*', priority: 0, getAttrs: (dom) => (custom(dom) && !dom.localName.startsWith('txt-') ? { tag: dom.localName, attrs: attrsOf(dom) } : false) }], toDOM: (node) => [node.attrs.tag, node.attrs.attrs, 0] };
  // The textblock twins: the same tag and attributes with phrasing content, taken where `prepare` chose the element (priority above every inline rule, so a lone `<a>` between blocks is the twin and not a mark or a node in a run).
  const twinRule = (tag) => ({ tag, priority: 63, getAttrs: (dom) => (twinEls.has(dom) ? getAttrs(dom) : false) });
  for (const tag of TWIN_TAGS) {
    const name = nameOf(tag);
    nodes[`${name}_text`] = { ...el(tag, { content: PHRASING, parseDOM: [twinRule(tag)] }), ...(nodes[name].group ? { group: nodes[name].group } : {}), twinOf: name, siblingSplit: SIBLING_SPLIT.has(tag) };
  }
  for (const tag of BOTH) nodes[`${tag}_text`] = { ...el(tag, { group: 'block', content: PHRASING, parseDOM: [twinRule(tag)] }), twinOf: `${tag}_block` };
  nodes.custom_text = { group: 'block', content: PHRASING, attrs: { tag: {}, ...map }, parseDOM: [{ tag: '*', priority: 63, getAttrs: (dom) => (custom(dom) && twinEls.has(dom) ? { tag: dom.localName, attrs: attrsOf(dom) } : false) }], toDOM: (node) => [node.attrs.tag, node.attrs.attrs, 0], twinOf: 'custom_block' };
  nodes.list_inline = { group: 'phrasing', inline: true, attrs: { tag: {}, ...map }, content: '(list_item | inert)*', parseDOM: [{ tag: LIST_TAGS.join(','), priority: 64, getAttrs: (dom) => (inlineLists.has(dom) ? { tag: dom.localName, attrs: attrsOf(dom) } : false) }], toDOM: (node) => [node.attrs.tag, node.attrs.attrs, 0] };
  // A model that names a part (a list's `list_item`, a row's `td`) admits its twin beside it. Every flow expression names `run` first: ProseMirror wraps stray inline content in the first textblock the expression offers, and that must be the anonymous run (mixed content), never a twin of a part it would invent (a second `legend`, measured).
  const parts = [...TWIN_TAGS].filter((t) => !nodes[nameOf(t)].group).map(nameOf);
  for (const spec of Object.values(nodes)) if (typeof spec.content === 'string') spec.content = spec.content.replace(new RegExp(`\\b(${parts.join('|')})\\b(?!_)`, 'g'), '($1 | $1_text)');
  // The inert leaves: whitespace and comments where text is not content, and the raw elements. Required attributes, so nothing creates one to fill a gap; written back as what they were. Whitespace and comments are not selectable: the doc's first child is the body's leading whitespace, and a state's first selection would otherwise be a node selection of it (measured: the painter then lit the whole first page).
  nodes.ws = { group: 'block inert', attrs: { text: {} }, atom: true, parseDOM: [{ tag: 'txt-ws', getAttrs: (dom) => ({ text: dom.getAttribute('t') }) }], toDOM: () => ['txt-ws'], render: (node) => document.createTextNode(node.attrs.text), marker: () => { const t = document.createTextNode(''); leafTexts.add(t); return t; }, unshown: true, selectable: false, leafText: (node) => node.attrs.text, chars: () => '' };
  nodes.comment_block = { group: 'block inert', attrs: { text: {} }, atom: true, parseDOM: [{ tag: 'txt-c', getAttrs: (dom) => ({ text: dom.getAttribute('t') }) }], toDOM: () => ['txt-c'], render: (node) => document.createComment(node.attrs.text), unshown: true, selectable: false, leafText: () => '', chars: () => '' };
  const raw = (inline) => ({
    group: inline ? 'phrasing inert_i' : 'block inert', inline, attrs: { html: {} }, atom: true, draggable: false,
    parseDOM: [{ tag: RAW.join(','), priority: inline ? 70 : 69, getAttrs: (dom) => ((placeOf(dom) === 'inline') === inline ? { html: dom.outerHTML } : false) }],
    toDOM: (node) => { const e = rawElement(node.attrs.html); e.setAttribute('contenteditable', 'false'); return e; },
    // Cicero's intake leaves a top-level style or script where it is: it is not a box.
    unboxed: (node) => /^<(style|script)[\s>]/i.test(node.attrs.html),
    leafText: (node) => rawText(node.attrs.html), chars: (node) => rawText(node.attrs.html)
  });
  nodes.raw_block = raw(false);
  // A page of another PDF (`<object type="application/pdf">`): src/schema.js's `facsimile`, its attributes, parse and markup as they are there, so the object is not carried verbatim as the other `object`s are. Two variants, placed as a raw element is (a block where blocks stand, an inline atom in a textblock: a section holding only the object is a textblock twin), above the raw rule. It draws no characters.
  const pdf = (inline) => ({ ...facsimile, group: inline ? 'phrasing' : 'block', inline, parseDOM: facsimile.parseDOM.map((rule) => ({ ...rule, priority: 71, getAttrs: (dom) => ((placeOf(dom) === 'inline') === inline ? rule.getAttrs(dom) : false) })), leafText: () => '', chars: () => '' });
  nodes.facsimile = pdf(false);
  nodes.text = { group: 'phrasing' };
  for (const [tag, content] of Object.entries(INLINE)) {
    if (MARKS.includes(tag)) continue;
    if (structured && STRUCTURED.includes(tag)) nodes[`${tag}_node`] = el(tag, { group: 'phrasing', inline: true, content, parseDOM: [{ tag, priority: 61, getAttrs: (dom) => (isBoxed(dom) ? getAttrs(dom) : false) }] });
    else nodes[tag] = el(tag, { group: 'phrasing', inline: true, content });
  }
  for (const [tag, content] of Object.entries(INLINE_PARTS)) nodes[tag] = el(tag, { inline: true, content });
  for (const tag of VOID_INLINE) nodes[tag] = leaf(tag, { inline: true, ...(['source', 'track'].includes(tag) ? {} : { group: 'phrasing' }), chars: () => '' });
  for (const tag of BOTH) {
    if (structured && STRUCTURED.includes(tag)) nodes[`${tag}_node`] = el(tag, { group: 'phrasing', inline: true, content: PHRASING, parseDOM: [{ tag, priority: 61, getAttrs: (dom) => (!holdsFlow(dom) && isBoxed(dom) ? getAttrs(dom) : false) }] });
    else nodes[tag] = el(tag, { group: 'phrasing', inline: true, content: PHRASING, parseDOM: [{ tag, getAttrs: (dom) => (holdsFlow(dom) ? false : getAttrs(dom)) }] });
  }
  if (structured) {
    nodes.empty_inline = {
      group: 'phrasing', inline: true, atom: true, attrs: { tag: {}, attributes: { default: {} }, instance: {} },
      parseDOM: [{ tag: STRUCTURED.join(','), priority: 62, getAttrs: (dom) => (!dom.firstChild && !isBoxed(dom) ? { tag: dom.localName, attributes: attrsOf(dom), instance: instanceOf(dom) } : false) }],
      toDOM: (node) => [node.attrs.tag, node.attrs.attributes],
      render: (node) => { const e = document.createElement(node.attrs.tag); for (const [k, v] of Object.entries(node.attrs.attributes)) e.setAttribute(k, v); atomEls.add(e); return e; },
      leafText: () => '', chars: () => ''
    };
  }
  nodes.custom_inline = { group: 'phrasing', inline: true, content: PHRASING, attrs: { tag: {}, ...map }, parseDOM: [{ tag: '*', priority: 1, getAttrs: (dom) => (custom(dom) && !dom.localName.startsWith('txt-') && !holdsFlow(dom) ? { tag: dom.localName, attrs: attrsOf(dom) } : false) }], toDOM: (node) => [node.attrs.tag, node.attrs.attrs, 0] };
  nodes.raw_inline = raw(true);
  nodes.facsimile_inline = pdf(true);
  nodes.ws_inline = { group: 'inert_i', inline: true, attrs: { text: {} }, atom: true, parseDOM: [{ tag: 'txt-ws-i', getAttrs: (dom) => ({ text: dom.getAttribute('t') }) }], toDOM: () => ['txt-ws'], render: (node) => document.createTextNode(node.attrs.text), unshown: true, selectable: false, leafText: (node) => node.attrs.text, chars: (node) => node.attrs.text };
  nodes.comment_inline = { group: 'phrasing inert_i', inline: true, attrs: { text: {} }, atom: true, parseDOM: [{ tag: 'txt-c-i', getAttrs: (dom) => ({ text: dom.getAttribute('t') }) }], toDOM: () => ['txt-c'], render: (node) => document.createComment(node.attrs.text), unshown: true, selectable: false, leafText: () => '', chars: () => '' };
  // A family's mark, and its twin for an element carrying `itemprop` (`span_property`), parsed by whether the element carries it.
  const structuredMark = (tag, property) => ({
    structured: true, tag, excludes: '', inclusive: !property && !ANCHORS.has(tag),
    attrs: { instance: {}, attributes: { default: {} }, parent: { default: null } },
    parseDOM: [{ tag, priority: 50, getAttrs: (dom) => (isBoxed(dom) || !dom.firstChild || (BOTH.includes(tag) && holdsFlow(dom)) || dom.hasAttribute('itemprop') !== property ? false : { instance: instanceOf(dom), attributes: attrsOf(dom), parent: parentInstance(dom) }) }],
    toDOM: (mark) => [tag, mark.attrs.attributes, 0]
  });
  const marks = structured
    ? Object.fromEntries(STRUCTURED.flatMap((tag) => [[tag, structuredMark(tag, false)], [`${tag}${PROPERTY}`, structuredMark(tag, true)]]))
    : Object.fromEntries(MARKS.map((tag) => [tag, { attrs: map, parseDOM: [{ tag, getAttrs }], toDOM: (mark) => [tag, mark.attrs.attrs, 0] }]));
  const schema = new Schema({ topNode: 'doc', nodes, marks });
  // What src/positions.js reads to walk a textblock's DOM: which of its elements are marks (no position of their own) and which are atoms (one); every other element in a textblock is a node (one position to enter it, one to leave).
  schema.generic = structured
    ? { structured: true, markTags: new Set(STRUCTURED), voidTags: new Set(VOID_INLINE), isMark: (el) => markEls.has(el), isAtom: (el) => atomEls.has(el), isLeafText: (t) => leafTexts.has(t) }
    : { markTags: new Set(MARKS), voidTags: new Set(VOID_INLINE), isLeafText: (t) => leafTexts.has(t) };
  return schema;
}

const textCache = new Map();
/** The characters a raw element holds (every text node, as the pages' text walk counts them). */
function rawText(html) { let t = textCache.get(html); if (t == null) textCache.set(html, (t = rawElement(html)?.textContent ?? '')); return t; }

/**
 * The parse: a CLONE of the body, its whitespace and comments made into placeholder elements where they are leaves (ProseMirror's parser reads elements and text, never a comment, and drops whitespace it cannot place), parsed with `preserveWhitespace: 'full'`.
 */
export function prepare(body, { skip, layout = body } = {}) {
  const clone = body.cloneNode(true);
  // The structured marks' classification reads the source as laid out (its computed style), so it is taken on the source's elements (or on `layout`, the laid-out twin of a detached body), walked in step with the clone's while the two are the same tree.
  nodeReasons = new WeakMap();
  instances = new WeakMap();
  const ws = document.createTreeWalker(layout, NodeFilter.SHOW_ELEMENT), wc = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  for (let a = ws.nextNode(), b = wc.nextNode(); a && b; a = ws.nextNode(), b = wc.nextNode()) if (STRUCTURED.includes(a.localName)) nodeReasons.set(b, boxReason(a));
  // The twins, top-down (a child's place reads its parent's choice): a native flow container holding only phrasing, and a transparent or custom element holding only phrasing where blocks stand.
  twinEls = new WeakSet();
  inlineLists = new WeakSet();
  const wt = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (RAW.includes(n.localName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let e = wt.nextNode(); e; e = wt.nextNode()) {
    if (TWIN_TAGS.has(e.localName) && !e.matches('dl > div') && listsInline && !phrasingOnly(e) && phrasingAndLists(e)) { twinEls.add(e); for (const c of e.children) if (LIST_TAGS.includes(c.localName)) inlineLists.add(c); continue; }
    if (TWIN_TAGS.has(e.localName) && !e.matches('dl > div') ? phrasingOnly(e) : (BOTH.includes(e.localName) || (custom(e) && !e.localName.startsWith('txt-'))) && !holdsFlow(e) && placeOf(e) === 'block') twinEls.add(e);
  }
  // A skipped element's two neighbours become one text node: the serialization writes the element elsewhere (the data block, after the body), so its re-parse holds one whitespace leaf there, and a doc parsed from it would not equal the state (the checks-see-the-view round, roundtrip's re-parse leg).
  if (skip) for (const el of clone.querySelectorAll(skip)) { const before = el.previousSibling, after = el.nextSibling; el.remove(); if (before?.nodeType === 3 && after?.nodeType === 3) { before.data += after.data; after.remove(); } }
  const w = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && RAW.includes(n.localName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const found = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeType === 8 || isWs(n)) found.push(n);
  for (const n of found) {
    const inline = placeOf(n) === 'inline';
    const parent = n.parentElement;
    // Whitespace that is text where it stands (inline, in an element whose content admits text) stays text.
    if (n.nodeType === 3 && inline && (TEXTY.has(parent.localName) || custom(parent))) continue;
    const ph = document.createElement(n.nodeType === 8 ? (inline ? 'txt-c-i' : 'txt-c') : (inline ? 'txt-ws-i' : 'txt-ws'));
    ph.setAttribute('t', n.data);
    n.replaceWith(ph);
  }
  return clone;
}

/** A serializer that lets a node render as any DOM node, not only an element (ProseMirror's `renderSpec` takes an element or a spec): an inert leaf is a text node or a comment, a run in the saved document is a fragment of its children. */
class Serializer extends DOMSerializer {
  constructor(nodes, marks, special = {}, structured = false, page = false) { super(nodes, marks); this.special = special; this.structured = structured; this.page = page; }
  // The saved document's elements are made in a document that loads nothing (src/schema.js's `documentSerializer` says why: an `<img>` made in the studio's page is fetched at once, at the page's base); the page's are made in the page.
  serializeNode(node, options = {}) { return super.serializeNode(node, this.page ? options : { document: inert, ...options }); }
  /**
   * Inline content under structured marks: the inline tree rebuilt from each run's chain of instances (`chainOf`), so adjacent runs sharing an instance share one element and the nesting is the parent pointers', never ProseMirror's rank order. An inline node's own content leaves out the instances the node already stands inside (`options.outer`): ProseMirror marks an inline node and the text inside it alike. `options.onMark(instance)` hears every element made for an instance (the linter counts them).
   */
  serializeFragment(fragment, options = {}, target) {
    if (!this.page) options = { document: inert, ...options };
    if (!this.structured || !fragment.firstChild?.isInline) return super.serializeFragment(fragment, options, target);
    const doc = options.document ?? window.document;
    target ??= doc.createDocumentFragment();
    const outer = options.outer ?? new Set();
    const stack = [];
    fragment.forEach((node) => {
      const chain = chainOf(node.marks.filter((m) => m.type.spec.structured && !outer.has(m.attrs.instance)));
      let keep = 0;
      while (keep < stack.length && keep < chain.length && stack[keep].instance === chain[keep].attrs.instance) keep++;
      stack.length = keep;
      for (const m of chain.slice(keep)) {
        const el = doc.createElement(m.type.spec.tag);
        for (const [k, v] of Object.entries(m.attrs.attributes)) el.setAttribute(k, v);
        markEls.add(el);
        options.onMark?.(m.attrs.instance);
        (stack.at(-1)?.dom ?? target).appendChild(el);
        stack.push({ instance: m.attrs.instance, dom: el });
      }
      const inner = node.isText ? options : { ...options, outer: new Set([...outer, ...node.marks.filter((m) => m.type.spec.structured).map((m) => m.attrs.instance)]) };
      (stack.at(-1)?.dom ?? target).appendChild(this.serializeNodeInner(node, inner));
    });
    return target;
  }
  serializeNodeInner(node, options) {
    if (!this.page && node.attrs.attrs?.[REPEATED] != null) return (options.document ?? inert).createDocumentFragment(); // a template's row: drawn, never saved
    // Inside an inline list the page marks where an inert leaf stands, since there it stands inside a textblock, whose positions src/positions.js counts in the page's own DOM: a whitespace leaf is an EMPTY text node (one position, nothing a hit test can land on: drawn as its whitespace, the End key's hit test landed in it, measured), a comment its comment.
    if (node.type.name === 'list_inline') options = { ...options, keepInert: true };
    if (this.page && options.keepInert && node.type.spec.unshown) return (node.type.spec.marker ?? node.type.spec.render)(node);
    const own = this.special[node.type.name] ?? node.type.spec.render;
    if (own) return own(node, this, options);
    return verbatimStyle(super.serializeNodeInner(node, options), node.attrs.attrs);
  }
  serializeMark(mark, inline, options) {
    const out = super.serializeMark(mark, inline, options);
    if (out) verbatimStyle(out.dom, mark.attrs.attrs);
    return out;
  }
}
/**
 * A run's structured marks, outermost first: from a root (its parent is not on the run) down the parent pointers. A mark a command made (parent `'*'`) stands innermost, inside whatever the run already wears; so does any mark whose pointers lead nowhere on this run.
 */
function chainOf(marks) {
  if (marks.length < 2) return marks;
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
 * Bold, Italic, any structured family's toggle: over a selection that is not all of this family, WRAP it in a new instance (a minted id, parent `'*'`: innermost); over one that is, take every instance of the family off it, its property's twin among them (taking a field's own element off, which the stores' guard refuses); at a caret, the same as a stored mark. Equality reads the family (the tag), never the type's name or the instance.
 */
export const toggleStructured = (type) => (state, dispatch) => {
  const { from, to, empty, $from } = state.selection;
  const fresh = () => type.create({ instance: mint(), attributes: {}, parent: '*' });
  if (empty) {
    const has = inFamily(type, state.storedMarks ?? $from.marks());
    if (dispatch) { const tr = state.tr; if (has) for (const t of familyOf(type)) tr.removeStoredMark(t); else tr.addStoredMark(fresh()); dispatch(tr); }
    return true;
  }
  if (dispatch) { const tr = state.tr; if (structuredActive(state, type)) for (const t of familyOf(type)) tr.removeMark(from, to, t); else tr.addMark(from, to, fresh()); dispatch(tr); }
  return true;
};
/** A family's mark types: its own and its property's twin. */
const familyOf = (type) => [type.schema.marks[type.spec.tag], type.schema.marks[`${type.spec.tag}${PROPERTY}`]].filter(Boolean);
/** Whether marks hold an element of a type's family (its tag), whichever of the two types holds it. */
const inFamily = (type, marks) => marks.some((m) => m.type.spec.structured && m.type.spec.tag === type.spec.tag);
/** Is every character of the selection inside an element of this family (any instance, its property's twin among them)? */
export const structuredActive = (state, type) => {
  const { from, to, empty, $from } = state.selection;
  if (empty) return inFamily(type, state.storedMarks ?? $from.marks());
  let all = true, any = false;
  state.doc.nodesBetween(from, to, (n) => { if (n.isText) { any = true; if (!inFamily(type, n.marks)) all = false; } });
  return any && all;
};

/** The instances a doc writes as more than one element (an instance a command made across an existing boundary, or one a parse split): instance → [tag, elements]. */
export function splitInstances(schema, doc) {
  const counts = new Map();
  const ser = serializers(schema).doc;
  ser.serializeFragment(doc.content, { onMark: (id) => counts.set(id, (counts.get(id) ?? 0) + 1) });
  const tags = new Map();
  doc.descendants((n) => { for (const m of n.marks) if (m.type.spec.structured) tags.set(m.attrs.instance, m.type.spec.tag); });
  return [...counts].filter(([, n]) => n > 1).map(([id, n]) => ({ instance: id, tag: tags.get(id), elements: n }));
}

// ---- THE DOOR (notes/the-stores-plan.md, "Layers") ----
// The attributes of whatever holds an element, read and written without naming a type, so a feature that finds an element by its attributes (a field by its `itemprop`, the fields' plan) asks here and never which node or mark it is (notes/the-fields-by-microdata-plan.md, "Whatever holds it"). A HOLDER is a node or a mark, and keeps the element's attributes in one of three places: a structured mark and an empty inline atom in their `attributes`; an inline node, a block node and a void leaf in their attribute map, `attrs`; an element carried verbatim in its `outerHTML`, `html`. `marksOf` says which mark elements an inline node stands in, outermost first, `elementOf` parses an element carried verbatim, and `isSaved` says whether the saved document writes a node, for a reader of the doc's elements (the stores' reading, prosemirror-stores/reading). What holds no element (text, a run, a whitespace or comment leaf, the doc) has none of the three and answers null, and so does a node whose attributes are attributes of its own (the facsimile, src/schema.js's). A mark that names no occurrence (a plain mark, `buildSchema({ marks: true })`'s, or a mark of the studio's schema) is refused: the door cannot tell which nodes hold its element. It never asks which attribute holds a property's value: that is microdata's, the stores' (prosemirror-stores/value-attribute). It moves to prosemirror-html-schema (notes/the-html-schema-package-plan.md, "The attributes of whatever holds an element").
/** Which of a holder's attributes is its element's attribute map, if one is. */
const mapOf = (holder) => ['attributes', 'attrs'].find((k) => holder.attrs[k] !== null && typeof holder.attrs[k] === 'object');
const verbatim = (holder) => typeof holder.attrs.html === 'string';
/** A mark's occurrence, its `instance`; a mark with none (a plain mark of `buildSchema({ marks: true })`, a mark of the studio's schema: src/schema.js's `field`, `link`) is refused. */
const occurrence = (mark) => {
  if (mark.attrs.instance == null) throw new RangeError(`the door: this ${mark.type.name} mark names no occurrence (no instance): the door reads and writes only a mark that names its occurrence, the generic schema's structured marks`);
  return mark.attrs.instance;
};

/** The attributes of the element a holder holds, in source order, or null when it holds none. */
export function attributesOf(holder) {
  if (holder instanceof Mark) occurrence(holder);
  if (verbatim(holder)) return attrsOf(rawElement(holder.attrs.html));
  const key = mapOf(holder);
  return key ? holder.attrs[key] : null;
}

/**
 * The marks of an inline node that hold elements, outermost first, as the document serializer nests them (`chainOf`), each with its occurrence (the instance the door's write reaches on every stretch; the serializer may write one occurrence as several elements, and so does the reader that follows it): what a reader of the doc's elements needs to know which element a node stands in. `outside` names occurrences to leave out, those an inline node above it already stands in (ProseMirror marks an inline node and the text inside it alike). A mark that names no occurrence is refused, as by `attributesOf`.
 */
export function marksOf(node, outside = new Set()) {
  return chainOf(node.marks.filter((m) => !outside.has(occurrence(m)))).map((mark) => ({ mark, occurrence: mark.attrs.instance }));
}

/** The element a holder carries verbatim, parsed, whose inside a reader walks as the page draws it (an atom is not entered by the editor, but its microdata is the page's); null for every other holder. */
export function elementOf(holder) {
  return verbatim(holder) ? rawElement(holder.attrs.html) : null;
}

/** Whether the saved document writes a node: a row a host drew from a template (`REPEATED`) is drawn on the page and never saved, since the template and the array's reference are what is saved. */
export function isSaved(node) {
  return node.attrs.attrs?.[REPEATED] == null;
}

/** The name of the element a holder writes (its `toDOM`'s); meaningful where `attributesOf` is not null. */
export function tagOf(holder) {
  const out = holder.type.spec.toDOM?.(holder, true);
  return Array.isArray(out) ? out[0] : out?.localName ?? null;
}

/**
 * Sets one attribute of the element a holder holds, or takes it out for a null value, inside a transaction, and answers the transaction. A node at `pos` gets a new attribute map, or, carried verbatim, its `outerHTML` rewritten through the DOM. A mark is one element however many stretches ProseMirror keeps its occurrence on (an `em` wrapping a nested list stands in several textblocks; Egildo's ruling, 2026-10-26: one element, one set of attributes), so it is replaced wherever in the doc a node carries the same occurrence (the same `instance`), `pos` aside, by one with the new attributes and the same `instance` and `parent`, of its family's mark or its property's twin as the new attributes carry `itemprop` or not: text and atoms by a mark step, an inline node by a node mark step (the text inside an inline node carries the occurrence or not on its own, and is changed only where it does). The holder names what to write; the attributes are read from the transaction's current doc, so two writes in one transaction both hold.
 */
export function setAttribute(tr, pos, holder, name, value) {
  if (!(holder instanceof Mark)) {
    const node = tr.doc.nodeAt(pos);
    if (verbatim(node)) { const el = rawElement(node.attrs.html); if (value === null) el.removeAttribute(name); else el.setAttribute(name, value); return tr.setNodeAttribute(pos, 'html', el.outerHTML); }
    const key = mapOf(node);
    if (!key) throw new RangeError(`the door: the ${node.type.name} at ${pos} holds no element`);
    return tr.setNodeAttribute(pos, key, withAttribute(node.attrs[key], name, value));
  }
  const instance = occurrence(holder);
  // The occurrence, under its family's mark or its property's twin: an earlier write in the transaction may have moved it from one to the other.
  const same = (m) => m.attrs.instance === instance && (m.type === holder.type || (!!m.type.spec.structured && m.type.spec.tag === holder.type.spec.tag));
  let found = false;
  tr.doc.descendants((node, at) => {
    const old = node.isInline && node.marks.find(same);
    if (!old) return;
    const key = mapOf(old);
    const attributes = withAttribute(old.attrs[key], name, value);
    const next = (old.type.spec.structured ? markTypeOf(old.type.schema, old.type.spec.tag, attributes) : old.type).create({ ...old.attrs, [key]: attributes });
    found = true;
    if (node.isAtom) tr.step(new RemoveMarkStep(at, at + node.nodeSize, old)).step(new AddMarkStep(at, at + node.nodeSize, next));
    else tr.removeNodeMark(at, old).addNodeMark(at, next);
  });
  if (!found) throw new RangeError(`the door: no ${holder.type.name} of this occurrence in the doc`);
  return tr;
}

/** An attribute map with one attribute set, or taken out for a null value. */
const withAttribute = (attributes, name, value) => {
  const out = { ...attributes };
  if (value === null) delete out[name];
  else out[name] = value;
  return out;
};

/** The door as one object, what the stores' reading, write and guard take (prosemirror-stores/reading, prosemirror-stores/plugin). */
export const door = { attributesOf, tagOf, marksOf, elementOf, isSaved, setAttribute };

// ProseMirror's `renderSpec` writes a `style` attribute through the CSSOM (`dom.style.cssText`), which rewrites its text (`width: 52%` comes back `width: 52%;`, a shorthand may come back expanded, an invalid declaration dropped): measured in this round. The attribute is written back as the source had it.
function verbatimStyle(dom, attrs) {
  if (dom?.nodeType === 1 && attrs?.style != null) dom.setAttribute('style', attrs.style);
  return dom;
}

const inert = document.implementation.createHTMLDocument('');
/** The page's serializer (a run is `<txt-run>`, a raw element is drawn not editable) and the saved document's (a run is its bare children, a raw element is written back exactly, an inert leaf is the text or the comment it was). `src`, when given, maps an image's address as the document writes it to the address the page draws (the demo provider resolves a relative one against the document's URL); the saved document keeps it as written. */
export function serializers(schema, { src = null } = {}) {
  const nodes = DOMSerializer.nodesFromSchema(schema), marks = DOMSerializer.marksFromSchema(schema);
  const page = src ? {
    ...nodes,
    img: (node) => { const [tag, attrs] = nodes.img(node); return [tag, attrs.src == null ? attrs : { ...attrs, src: src(attrs.src) }]; },
    ...Object.fromEntries(['raw_block', 'raw_inline'].map((name) => [name, (node) => { const el = nodes[name](node); for (const img of [...(el.matches('img[src]') ? [el] : []), ...el.querySelectorAll('img[src]')]) img.setAttribute('src', src(img.getAttribute('src'))); return el; }]))
  } : nodes;
  const structured = !!schema.generic?.structured;
  // The page leaves the inert leaves out (run three): whitespace between blocks and comments are the document's and the file's, and the page is the engine's view, where they draw nothing (measured: the lab's pages pixel-identical in both modes without them). The saved document keeps them (`render`, below).
  const nothing = () => document.createDocumentFragment();
  const pageSer = new Serializer(page, marks, { ws: nothing, ws_inline: nothing, comment_block: nothing, comment_inline: nothing }, structured, true);
  const doc = new Serializer(nodes, marks, {
    run: (node, ser, options) => ser.serializeFragment(node.content, options),
    raw_block: (node) => rawElement(node.attrs.html),
    raw_inline: (node) => rawElement(node.attrs.html)
  }, structured);
  return { page: pageSer, doc };
}

/** Parse a body element into a doc of the schema: its content, and the body's item (`itemscope itemid itemtype`) as the doc's attributes. */
export function parseBody(schema, body, attrs = {}, options = {}) {
  const parsed = PMParser.fromSchema(schema).parse(prepare(body, options), { preserveWhitespace: 'full' });
  return schema.topNodeType.create({ ...bodyAttrs(body), ...attrs }, parsed.content);
}

export const schema = buildSchema({ marks: true });
const pair = serializers(schema);
export const pageSerializer = pair.page;
export const documentSerializer = pair.doc;
/** The structured-marks variant (`?schema=generic&marks=structured`). */
export const structuredSchema = buildSchema({ marks: 'structured' });
const structuredPair = serializers(structuredSchema);
export const structuredPageSerializer = structuredPair.page;
export const structuredDocumentSerializer = structuredPair.doc;

// ---- The linter ----

const LINT_ID = 'data-studio-lint';
/** A source element's place, as a path a reader can find: tag, id or class, and its index among its siblings. */
export function pathOf(el, root) {
  const out = [];
  for (let n = el; n && n !== root; n = n.parentElement) {
    const i = [...n.parentElement.children].indexOf(n) + 1;
    out.unshift(`${n.localName}${n.id ? `#${n.id}` : n.classList.length ? `.${[...n.classList].join('.')}` : ''}:${i}`);
  }
  return out.join(' > ');
}

// The rules a content expression cannot state, on descendants (§4.5.1, §4.10.6, §4.3.8, §4.10.3, §4.4.2 conformance notes, and `style` outside the head, §4.2.6).
const DESCENDANT_RULES = [
  ['a a', 'an a inside an a (§4.5.1: no interactive content descendant)'],
  ['button a, button button, button input, button select, button textarea, a button, a input, a select, a textarea', 'interactive content inside an a or a button (§4.5.1, §4.10.6)'],
  ['header header, header footer, footer header, footer footer', 'a header or footer inside a header or footer (§4.3.8, §4.3.9)'],
  ['form form', 'a form inside a form (§4.10.3)'],
  ['p p', 'a p inside a p'],
  ['body style:not(svg style)', 'a style element in the body (§4.2.6: where metadata content is expected); carried verbatim']
];

/** A element's child elements (script-supporting ones left out), as a string of tags: `caption thead tbody `. */
const childTags = (el) => [...el.children].filter((c) => !['script', 'template'].includes(c.localName)).map((c) => `${c.localName} `).join('');
const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && /\S/.test(n.data));
/**
 * THE GRAMMAR: the order and the counts the standard asks of an element's children, which the schema does not enforce (it accepts whatever the parser's DOM holds). Each is [selector, test, the standard's words], the test answering true when the children conform.
 */
const GRAMMAR = [
  ['table', (el) => /^(caption )?(colgroup )*(thead )?((tbody )*|(tr )+)(tfoot )?$/.test(childTags(el)), 'a table is caption?, colgroup*, thead?, then tbody* or tr+, then tfoot? (§4.9.1)'],
  ['dl', (el) => /^((dt )+(dd )+)*$|^(div )+$/.test(childTags(el)), 'a dl is groups of dt+ then dd+, or div+ (§4.4.9)'],
  ['dl > div', (el) => /^(dt )+(dd )+$/.test(childTags(el)), 'a div in a dl is dt+ then dd+ (§4.4.15)'],
  ['figure', (el) => { const t = childTags(el).trim().split(' ').filter(Boolean); const n = t.filter((x) => x === 'figcaption').length; return n === 0 || (n === 1 && (t[0] === 'figcaption' || t.at(-1) === 'figcaption')); }, 'a figure has at most one figcaption, first or last (§4.4.12)'],
  ['details', (el) => el.firstElementChild?.localName === 'summary' && el.querySelectorAll(':scope > summary').length === 1, 'a details starts with its one summary (§4.11.1)'],
  ['fieldset', (el) => { const t = childTags(el).trim().split(' ').filter(Boolean); const i = t.indexOf('legend'); return i <= 0 && t.filter((x) => x === 'legend').length <= 1; }, 'a fieldset has at most one legend, first (§4.10.15)'],
  ['hgroup', (el) => /^(p )*h[1-6] (p )*$/.test(childTags(el)), 'an hgroup is p*, one h1 to h6, p* (§4.3.7)'],
  ['picture', (el) => /^(source )*img $/.test(childTags(el)), 'a picture is source*, then one img (§4.8.1)'],
  ['ul, ol, menu', (el) => /^(li )*$/.test(childTags(el)) && !hasText(el), 'a list holds li elements and nothing else (§4.4.5 to §4.4.7)'],
  ['select', (el) => /^((option|optgroup|hr) )*$/.test(childTags(el)), 'a select holds option, optgroup and hr (§4.10.7)'],
  ['tr', (el) => /^((td|th) )*$/.test(childTags(el)) && !hasText(el), 'a tr holds td and th (§4.9.8)'],
  ['ruby', (el) => !!el.querySelector(':scope > rt'), 'a ruby holds at least one rt (§4.5.10)']
];

/**
 * The linter: parses the body the way `parseBody` does with every source element tagged, walks the doc for the tags, and lists every place the schema refused or repaired, each with the element and its path in the source. Kinds: `dropped` (an element the doc does not hold), `moved` (held under another parent than the source's: the parser placed it where its content model allows), `split` (held twice or more: an element cut around something it could not hold), `created` (a node the parser made to hold content: a wrapper the source does not have; a run is not counted, it is the schema's own), `text` (an element whose text differs), `unknown` (an element the table does not know, carried as a custom element), `rule` (a descendant rule of the standard the schema cannot state), and `conformance` (children in an order or a count the standard does not allow, which the schema carries as written: `GRAMMAR`). Every kind but `rule`, `conformance` and `unknown` is a REPAIR: the doc is not the source there.
 */
export function lint(schema, body) {
  const src = body.cloneNode(true);
  let id = 0;
  const byId = new Map();
  for (const el of src.querySelectorAll('*')) { el.setAttribute(LINT_ID, String(++id)); byId.set(String(id), el); }
  const doc = parseBody(schema, src, {}, { layout: body });
  const seen = new Map(); // id → [parent id …]
  const nodeOf = new Map(); // id → the first node that holds it
  const viaMark = new Set(); // ids held as marks
  const report = [];
  const visit = (node, parentId) => {
    let own = null;
    const a = node.attrs?.attrs ?? node.attrs?.attributes ?? null;
    if (a && a[LINT_ID]) own = a[LINT_ID];
    if (node.type.name.startsWith('raw_')) {
      const ids = [...node.attrs.html.matchAll(new RegExp(`${LINT_ID}="(\\d+)"`, 'g'))].map((m) => m[1]);
      own = ids[0];
      for (const i of ids.slice(1)) seen.set(i, [...(seen.get(i) ?? []), 'raw']);
    }
    // A structured mark's element stands inside its parent instance's element, and a node or text under structured marks inside the innermost one: the parents the source has, read off the instances.
    const lintOf = (m) => (m.attrs.attrs ?? m.attrs.attributes)?.[LINT_ID];
    const structuredMarks = (node.marks ?? []).filter((m) => m.type.spec.structured);
    const byInstance = new Map(structuredMarks.map((m) => [m.attrs.instance, lintOf(m)]));
    for (const m of node.marks ?? []) {
      const mi = lintOf(m);
      if (!mi) continue;
      viaMark.add(mi);
      const up = m.type.spec.structured && byInstance.get(m.attrs.parent);
      seen.set(mi, [...(seen.get(mi) ?? []), up || (parentId ?? 'body')]);
    }
    const innermost = structuredMarks.length ? lintOf(chainOf(structuredMarks).at(-1)) : null;
    if (node.type.name === 'run') report.push({ kind: 'mixed', element: parentId ? byId.get(parentId).localName : 'body', path: parentId ? pathOf(byId.get(parentId), src) : 'body', note: `text beside blocks in one container: a run made to hold ${JSON.stringify(node.textContent.trim().slice(0, 40))}` });
    if (own) { seen.set(own, [...(seen.get(own) ?? []), innermost ?? parentId ?? 'body']); if (!nodeOf.has(own)) nodeOf.set(own, node); }
    else if (node.type.name !== 'doc' && node.type.name !== 'run' && !node.isText && !node.type.spec.unshown && !node.type.name.startsWith('raw_')) report.push({ kind: 'created', element: node.type.name, path: parentId ? pathOf(byId.get(parentId), src) : 'body', note: `a ${node.type.name} the source does not have, made to hold content` });
    node.forEach((child) => visit(child, own ?? parentId));
  };
  visit(doc, null);
  // A mark is seen once per text node it covers: collapse runs of the same parent.
  for (const [i, el] of byId) {
    const parents = seen.get(i);
    const path = pathOf(el, src);
    const sourceParent = el.parentElement === src ? 'body' : el.parentElement.getAttribute(LINT_ID);
    if (!parents) { report.push({ kind: 'dropped', element: el.localName, path }); continue; }
    if (parents[0] === 'raw') continue;
    const distinct = [...new Set(parents)];
    const isMark = viaMark.has(i);
    if (!isMark && parents.length > 1) report.push({ kind: 'split', element: el.localName, path, note: `held ${parents.length} times` });
    if (!distinct.includes(sourceParent)) report.push({ kind: 'moved', element: el.localName, path, note: `now under ${distinct.map((p) => (p === 'body' ? 'body' : pathOf(byId.get(p), src))).join(', ')}` });
    const held = nodeOf.get(i);
    if (held && !isMark && !held.type.name.startsWith('raw_') && parents.length === 1 && held.textContent !== el.textContent) report.push({ kind: 'text', element: el.localName, path, note: `${el.textContent.length} characters became ${held.textContent.length}: ${JSON.stringify(held.textContent.slice(0, 40))}` });
    if (custom(el) && !el.localName.includes('-')) report.push({ kind: 'unknown', element: el.localName, path, note: 'not an element of the standard; carried as a custom element' });
  }
  for (const [selector, note] of DESCENDANT_RULES) for (const el of src.querySelectorAll(selector)) report.push({ kind: 'rule', element: el.localName, path: pathOf(el, src), note });
  // Structured marks: an instance the doc writes as more than one element.
  if (schema.generic.structured) {
    const lintIds = new Map();
    doc.descendants((n) => { for (const m of n.marks) if (m.type.spec.structured) lintIds.set(m.attrs.instance, m.attrs.attributes[LINT_ID]); });
    for (const x of splitInstances(schema, doc)) { const el = byId.get(lintIds.get(x.instance)); report.push({ kind: 'split', element: x.tag, path: el ? pathOf(el, src) : `instance ${x.instance}`, note: `one instance (${x.instance}) written as ${x.elements} elements` }); }
  }
  for (const [selector, conforms, note] of GRAMMAR) for (const el of src.querySelectorAll(selector)) if (!el.closest(RAW.join(',')) && !conforms(el)) report.push({ kind: 'conformance', element: el.localName, path: pathOf(el, src), note: `${note}; the children as written: ${JSON.stringify(childTags(el).trim() || "(text)")}` });
  return report;
}
