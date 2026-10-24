/**
 * The seam's types: the `Fragmentainer` a view fills, the `SliceRenderer` it hands every fragmentainer, the `ContainerFactory` it asks for the next one, and the `ContainerHint` a fill may leave for it.
 *
 * @remarks
 * A FRAGMENTAINER (the CSS Fragmentation word for a box that holds one fragment of a flow: a page, a column, a region) owns a geometry and a foot and knows nothing of selection, input, plugins or transactions. It receives a document, a position and a renderer it does not own, and answers where it ended. The contract is Houdini's Layout API in userland: a break token in, a fragment and the next break token out, where the break token is a ProseMirror position. See docs/plan.md, "The seam".
 *
 * One departure from the plan's sketch, measured while building phase 1: the plan's `SliceRenderer` returned a bare `DocumentFragment`, but the fragmentainer's `pointAt` and `posAt` need the positions the renderer knew while it wrote the DOM, so the renderer returns them with it (`RenderedSlice`).
 *
 * @packageDocumentation
 */

/** @import { Node as PMNode } from 'prosemirror-model' */
/** @import { Entry } from './fragments-plugin.js' */

/**
 * What a fill may say about the container that should follow it: a named page, a blank page. The basic box gives none.
 * @typedef {object} ContainerHint
 * @property {string} [name] The name of the container the next fragment wants, as CSS's named pages name a page.
 * @property {boolean} [blank] The next container is to be left empty, as a blank page after `break-before: right`.
 */

/**
 * The model range one rendered DOM node stands for, clamped to the slice that was rendered.
 * @typedef {object} Span
 * @property {number} start The position the DOM node starts at: before the node for a node's element, the first character for a text node, the first content for a mark's element.
 * @property {number} end The position the DOM node ends at.
 * @property {number} [contentStart] Present when the element holds a node's content (its `contentDOM`): where that content starts.
 * @property {number} [contentEnd] Where that content ends.
 * @property {boolean} [mark] The element is a mark's wrapper, standing for no node of its own.
 */

/**
 * A slice rendered as DOM, with the position every rendered DOM node starts at.
 * @typedef {object} RenderedSlice
 * @property {DocumentFragment} fragment The slice's DOM, open ancestors kept as partial elements.
 * @property {WeakMap<globalThis.Node, Span>} positions For every DOM node the renderer wrote and that stands for model content, the range it stands for; a node the renderer added for display only (an empty textblock's trailing break) has no entry.
 * @property {number} from The first position the slice shows.
 * @property {number} to The last position the slice shows.
 */

/**
 * What the view hands every fragmentainer: the document from `from` to `to` (to the end when `to` is null) rendered as DOM.
 * @typedef {(doc: PMNode, from: number, to: number | null) => RenderedSlice} SliceRenderer
 */

/**
 * The answer of a fill.
 * @typedef {object} FillResult
 * @property {number | null} to The position the fragmentainer's content stops at, null when everything from `from` fit.
 * @property {ContainerHint} [next] A hint about the container that should follow.
 */

/**
 * A component that pulls content from a position and gives back the position where it had to stop.
 * @typedef {object} Fragmentainer
 * @property {HTMLElement} dom The component's root element, placed by the view.
 * @property {(doc: PMNode, from: number, render: SliceRenderer) => Promise<FillResult>} fill Render the slice of `doc` from `from` under the component's geometry and decide where it ends; the DOM is written before the promise's first wait, so a caller that reads the DOM straight after the call sees the new content.
 * @property {(pos: number) => { node: globalThis.Node, offset: number } | null} pointAt The DOM point a position is shown at inside the component, null when the component does not show it.
 * @property {(node: globalThis.Node, offset: number) => number | null} posAt The position a DOM point inside the component stands for, null when the point is not the component's.
 * @property {EventTarget} moved Late truth: dispatches `moved` when the content changed height after a fill (an image arrived, a face loaded), so the view refills from the component's `from`.
 * @property {() => void} release Let go of observers and listeners; the view removes `dom`.
 */

/**
 * The factory the view asks for the container after a cut, and for the first one. The basic factory returns another box; BelType's returns the page the hint and its own rules name.
 * @typedef {(index: number, hint: ContainerHint | undefined, chain: ReadonlyArray<Entry>) => Fragmentainer} ContainerFactory
 */

export {};
