# prosemirror-fragview — a fragmented view for ProseMirror, and the seam to the paginator

Written 2026-10-24 from a conversation with Egildo, after the generic-schema round ([notes/generic-schema-results.md](generic-schema-results.md), the companion [*The Model Is The Document*](schema-companion.html)). A plan, not a record: nothing here is built. It names the seam between ProseMirror's mechanics and a paginator, the component on each side of it, the proof that the seam is clean, and the phases that build it. The studio is the venue; the package leaves for a home of its own when phase 4 holds.

## The idea in one paragraph

ProseMirror is four pure libraries and one that touches the DOM. The model (nodes, marks, slices, the schema), the transform (steps and their mappings) and the state (document, selection, plugins, transactions) never see a browser; the view (`EditorView`) renders the state into one contenteditable tree it owns, reads the browser's changes back, and exposes geometry (`coordsAtPos`, `posAtCoords`). A paginator cannot use that view: it assumes one DOM tree per document and reverts any DOM it did not produce, and a page engine draws a node on several pages, as the original and as copies. So the view is replaced, and the replacement is `FragmentedView`: it holds the same state, speaks the same protocol to the same plugins, and renders the document into a chain of FRAGMENTAINERS, each a component that pulls content from a position and gives back the position where it had to stop. The basic fragmentainer is a box that reports the browser's own overflow. BelType's page is a fragmentainer that reports the best cut under the make-up order, with every paged-media feature behind it, and still, in the end, a position. The canon is Houdini's Layout API, where a layout receives a break token and returns a fragment and the next break token: this is that contract in userland, with a ProseMirror position as the break token.

## The seam

**Below the seam, the fragmentainer.** A component that owns a geometry and a foot and knows nothing of selection, input, plugins or transactions. It receives a document, a position and a slice renderer it does not own, and answers where it ended.

```ts
interface Fragmentainer {
  /** The component's root element, placed by the view. */
  readonly dom: HTMLElement;
  /**
   * Render the slice of `doc` from `from` under my geometry and decide where I end.
   * `to` is the position my content stops at, `null` when everything from `from` fit.
   * `next` is a hint about the container that should follow (a named page, a blank page); the basic box gives none.
   */
  fill(doc: Node, from: number, render: SliceRenderer): Promise<{ to: number | null; next?: ContainerHint }>;
  /** Registration, both ways, inside me: the DOM point a position is shown at (null when I do not show it), and the position a DOM point stands for. */
  pointAt(pos: number): { node: globalThis.Node; offset: number } | null;
  posAt(node: globalThis.Node, offset: number): number | null;
  /** Late truth: my content changed height after I was filled (an image arrived, a face loaded, a size signal). The view refills from my `from`. */
  readonly moved: EventTarget; // dispatches 'moved'
  release(): void;
}

/** What the view hands every fragmentainer: the fragment of the document from `from` to `to` as DOM, open ancestors kept, shallow siblings by index before the live child at each depth (marked `away`), instances stamped on inline elements. */
type SliceRenderer = (doc: Node, from: number, to: number | null) => DocumentFragment;

/** The factory the view asks for the container after a cut. The basic factory returns another box; BelType's returns the page the hint and its own rules name. */
type ContainerFactory = (index: number, hint: ContainerHint | undefined, chain: ReadonlyArray<Entry>) => Fragmentainer;
```

**Above the seam, the view.** `FragmentedView` is constructed as `EditorView` is and exposes its methods, so every plugin written against ProseMirror's view runs unchanged.

```ts
class FragmentedView {
  constructor(place: HTMLElement, props: FragmentedViewProps);
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
  updateState(state: EditorState): void;
  setProps(props: Partial<FragmentedViewProps>): void;
  someProp<N extends keyof EditorProps>(name: N, f?: (value: EditorProps[N]) => any): any;
  hasFocus(): boolean; focus(): void;
  coordsAtPos(pos: number): { left: number; right: number; top: number; bottom: number };
  posAtCoords(coords: { left: number; top: number }): { pos: number; inside: number } | null;
  domAtPos(pos: number): { node: globalThis.Node; offset: number };
  posAtDOM(node: globalThis.Node, offset: number): number;
  nodeDOM(pos: number): globalThis.Node | null;
  endOfTextblock(dir: 'up' | 'down' | 'left' | 'right' | 'forward' | 'backward'): boolean;
  destroy(): void;
  /** Beyond EditorView: the chain and its containers. */
  readonly fragments: ReadonlyArray<Entry>;
  fragmentAt(pos: number): Entry | null;
}

interface FragmentedViewProps extends DirectEditorProps {
  containers: ContainerFactory;
  /** Which fragments to build now and which to estimate from measured heights; the default builds what is near the viewport and one beyond. */
  window?: WindowPolicy;
}

/** One link of the chain, held as plugin state and mapped through every transaction. */
interface Entry { key: number; from: number; to: number | null; container: Fragmentainer; dirty: boolean }
```

The view's own duties, none of them forked from `prosemirror-view` but written once for the fragmented case: the props protocol (`someProp` walks the plugins and calls `handleKeyDown`, `handleTextInput`, `handlePaste` and the rest at the moment the input layer reaches them); the model selection, drawn across fragments; input from `keydown` and `beforeinput`; the clipboard; decorations as paint; node views as presenters; the DOM read-back; the window policy.

**The chain is plugin state.** `fragmentsPlugin()` holds the entries in `EditorState`. Its `apply(tr, value)` maps every `from` and `to` through `tr.mapping` and marks dirty the entries whose range a step touched (`tr.mapping.maps[i].forEach` gives the changed ranges). The view reads that state after each transaction and refills the dirty entries only: an entry whose `to` lands where it was ends the refill; one whose `to` moved dirties the next. Undo, redo and collaboration map the chain for free, as they map decoration sets and the history. This is the ledger as mapped positions: what `patch`, `resumeAt` and the forcing memo do today by observing the DOM, the transaction says.

## What ProseMirror gives, looked at from its side

1. **A Slice is already the continuation.** `doc.slice(from, to)` keeps its open ancestors as partial nodes with `openStart` and `openEnd`; serializing its content with the schema's `DOMSerializer` gives `<ol><li>…` cut where the fragment begins, which is the hollow-ancestor copy a page engine otherwise builds by hand. The slice renderer adds shallow siblings before the live child at each open depth, as many as `$from.index(d)`, so `:nth-child`, `+`, `~` and list numbering read as in the source, and stamps each inline element with its mark instance so a reparse recovers identity.
2. **Decorations without DOM.** The CSS Custom Highlight API (`CSS.highlights`) paints a set of `Range`s with no element inserted and no layout moved. Inline decorations, the search highlight, a collaborator's caret and the view's own selection become highlights, at no cost to the engine; the studio's `src/selection.js` already paints the selection this way. Widget decorations are refused, or shown in a gutter beside the fragment (the notes idea: comments and lint findings at the y of their position).
3. **Mapping is the resume.** A transaction's mapping says which fragments moved and which were touched; nothing observes the DOM to learn it.

## The basic fragmentainer: OverflowBox

A box of fixed width and height. `fill` renders the slice, lays it out, reads the first line whose rect passes the box's content foot, and answers its position as `to`: the browser's own overflow, greedy at line granularity. It is not a toy. It is a column's filling ("the browser fills, the engine reads"), a table cell's interior, and candidate zero of the Stonehand's retreat walk, which starts from the overflow and moves up to the best candidate. The rich fragmentainer is this one plus judgement. An infinite OverflowBox never cuts: `to` is always `null`.

## The BelType fragmentainer

Cicero's page: `@page` geometry, margin boxes, named pages, the make-up order over candidates, forced breaks and avoids, counters and strings, demands when footnotes come ([*a competing flow bargains the foot of the main flow*](../../beltype/.claude/decisions/cicero/a-competing-flow-bargains-the-foot-of-the-main-flow.md)). Same `fill`, same `to`. Two things it needs that the box does not: the chain, since page numbers, `target-counter()` and strings are reads over every entry, not one; and a say in the container that follows (`next: { name: 'wide' }`, a blank page after `break-before: right`). So the BelType side is a `ContainerFactory` that reads the chain plus the page component, and the reads loop that settles in a few runs lives there and asks the view to refill.

**Corrected 2026-10-24** ([*the engine knows no view*](../../beltype/.claude/decisions/project/the-engine-knows-no-view.md)). The first draft said that `stonehand.js` and `chase.js` become the component, `driver.js` the view's chain, and that `root.js` stops owning the DOM. None of that holds: Cicero stays a function from a document and its sheets to cuts, runnable as one round from the CLI with no editor state, and `root.js` stays its presenter. The BelType fragmentainer lives in a third package, `prosemirror-beltype`, which imports this one and the engine and implements `Fragmentainer` and `ContainerFactory` over the engine's objects: the geometry capture, the sheet rewrite, the measure context and the report, the adjudication, the page element, the counter state over supplied readers, the reads loop over an abstract chain. This package never learns the engine's name: a sweep over `src/` for `beltype` and `cicero` fails the build.

## The proof that the seam is clean

A `FragmentedView` with one infinite `OverflowBox` must behave as an `EditorView` on the schema lab, under the generic schema with structured marks: typing, selection, Backspace and Delete across blocks, Enter, undo and redo, the keymap and inputrules as plugins, collaboration through the studio's authority (`src/collab/`), the structure pane as a client. One fragment, `to` always `null`. Then two boxes of fixed height: the chain in plugin state, an edit mapping both entries, only the touched fragment refilled, the selection drawn across the two. If both hold, the seam is clean and the page component can be built against it.

## Phases

Each phase is a branch of the studio, measured by a Playwright script, recorded in `notes/fragview-results.md`, and merged when green.

1. **The package and the parity.** `fragview/` in the studio: the `Fragmentainer` interface, `OverflowBox`, `fragmentsPlugin`, `FragmentedView` with the geometry methods, the props protocol, input from `keydown` and `beforeinput`, the clipboard from `src/clipboard.js`. The lab under one infinite box: the parity acts above, pass or fail each, and `npm run typing` style sessions against the authority. Green means `EditorView` could be swapped out of any ProseMirror app built on these plugins.
2. **Fixed-height boxes.** The chain mapped through transactions, refill of dirty entries only, the selection across fragments as highlights, the window policy building near the viewport. Measured: an edit on page one refills one fragment and dirties none when `to` lands where it was; an edit that moves a cut refills two; undo restores the chain.
3. **The slice renderer from the generic schema.** Shallow siblings by index, instance stamps, the engine's `away` word on the siblings; the lab under two boxes lossless (the saved file byte for byte) and editable (the four acts of the generic-schema round).
4. **The BelType fragmentainer**, moved to `prosemirror-beltype` on 2026-10-24 and phased there. What stays here are the two doors it needs of this package: the words registry (`data-beltype` and the six words) as a parameter of the renderer with a neutral default, so the sweep that this package names no engine passes (`test/no-engine.test.js` marks it to do); and a way to invalidate every container when conditions change (a `@page` edit dirties every entry and every page's geometry), found by the demo of 2026-10-24, where a change of box size needed a fresh mount because the view keeps a container whose chain key survives a new state. The proof moves with it: not the studio's orchestrator but the CLI's own round under Cicero, the same showcase cut twice, same cuts, same words, same folios.
5. **The read-back.** DOM changes read back at the text level, CodeMirror 6's way, through the two hops (`sourcePoint` to the source, `posAt` to the position) and the instance stamps: IME composition deferred to `compositionend`, dead keys for accents, autocorrect's word replacement, spellcheck's suggestion, each one act with the real input events and the model serialized after.

## Refused, with the reason

- **A plugin that replaces the view.** A plugin lives in the state and supplies props; it cannot own the DOM. The chain is a plugin; the view is a view.
- **One EditorView per fragment.** A view needs a whole state; a slice as a state breaks positions, mapping and history (the footnote sub-editor trick, and its limits).
- **Forking prosemirror-view.** Model, transform and state are reused untouched; the view is written for the fragmented case, as Lexical and Slate wrote theirs. Its composition and read-back code is the part to write once and carefully, with CodeMirror 6's text-level reading as the template, not prosemirror-view's node-level reparse.
- **Widget decorations in the flow.** They are layout; a page engine would re-cut for them. The gutter is their place.

## Open questions

Answered 2026-10-24, in the round that produced [*the engine knows no view*](../../beltype/.claude/decisions/project/the-engine-knows-no-view.md):

- `fill` is asynchronous for what the container can await (fonts and images already in the DOM), and `moved` carries what arrives after. Both, as `OverflowBox` already does.
- The window estimate stays the view's mean span. The engine's heights table joins only if the placeholders visibly jump on the showcase.
- An entry carries positions and the `next` hint the previous fill answered, never geometry: `pageOf(pos)` is an index lookup over the chain, and sizes stay on the page element.
- The names stay: `prosemirror-fragview`, `FragmentedView`; the BelType package is `prosemirror-beltype`.

## Where things are

- The studio's present orchestrator, which this generalizes: `src/positions.js` (geometry both ways over Cicero's pages), `src/patching.js` (a transaction as a Cicero patch), `src/input.js`, `src/selection.js`, `src/caret.js`, `src/clipboard.js`, `src/collab/`.
- The generic schema the renderer builds from: `src/schema-generic.js`, [notes/generic-schema-results.md](generic-schema-results.md).
- The engine's side of the seam, as it stands: `../beltype/packages/engine-cicero/src/stonehand.js`, `chase.js`, `driver.js`, `root.js`; its decision records in `../beltype/.claude/decisions/cicero/`.
- The canon: Houdini Layout API (break tokens in and out, unshipped); Chromium's break tokens (a path plus an inline offset; a ProseMirror position is that token as one integer with a mapping); Lexical and Slate (a view of their own over contenteditable); CodeMirror 6 (the viewport and height map, the text-level read-back); the CSS Custom Highlight API.
