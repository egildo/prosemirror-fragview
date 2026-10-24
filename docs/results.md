# Phase 1, the package and the parity: results

Written 2026-10-24, on the branch `phase/1-the-package-and-the-parity`. A record, not a plan: what phase 1 of [the plan](plan.md) built, what the parity script measured, and what the view does not do yet. Run it again with `npm test` (25 assertions, two of the suites in Chromium) and `npm run parity` (the table and the timings below).

## What was built

| Module | Lines | What it is |
| :--- | ---: | :--- |
| `src/fragmentainer.js` | 69 | The seam's types: `Fragmentainer`, `SliceRenderer`, `ContainerFactory`, `ContainerHint`, `FillResult`, `Span`, `RenderedSlice`. |
| `src/slice-renderer.js` | 215 | `renderSlice`, the schema's `DOMSerializer` over `doc.slice(from, to, true)`, recording each DOM node's model range in a `WeakMap` as it writes; `pointAt` and `posAt`, which read only that map. |
| `src/overflow-box.js` | 120 | `OverflowBox`, the basic fragmentainer: renders, reads the first line past its foot through the text nodes' `Range` rects, renders again up to that cut; `moved` from a `ResizeObserver`. |
| `src/fragments-plugin.js` | 128 | `fragmentsPlugin`, `fragmentsKey`, `refilled`, `appended`: the chain as plugin state, mapped through each step's map and marked dirty where a step touched it. |
| `src/fragmented-view.js` | 635 | `FragmentedView`: the props protocol, the fills as transactions, geometry both ways, the browser's selection drawn from and read into the model, input from `keydown` and `beforeinput`, paste, composition read back, inline decorations as highlights. |
| `src/index.js` | 10 | The exports. |
| `test/` | 258 | `node:test`: the plugin's mapping in node (8 cases); the renderer's position map (13) and the box's cut (4) in Chromium through vite. |
| `harness/` | 179 | The page: one 424-word document in an `EditorView` and in a `FragmentedView` with one infinite `OverflowBox`, the same plugins, the toolbar's hashes. |
| `scripts/` | 200 | `browser.mjs` (vite on a free port, Chromium) and `parity.mjs`. |

One departure from the plan's sketch of the seam. The plan's `SliceRenderer` returned a bare `DocumentFragment`; it returns a `RenderedSlice`, the fragment with its position map, because a fragmentainer's `pointAt` and `posAt` need what the renderer knew while it wrote, and the map cannot be recovered from the DOM afterwards without the walk against the document the map exists to avoid.

## The parity table

Each act is performed on the `EditorView`, then on the `FragmentedView`, each from a fresh state of the fixed document: a click at the same model position through the view's own `coordsAtPos`, then the same keys through Playwright. The documents and selections are compared after the act, after Mod-z, and after Shift-Mod-z.

| Act | Documents equal | Selections equal | After undo equal | After redo equal | Notes |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Type a sentence in a paragraph | yes | yes | yes | yes | |
| Type at a mark boundary (after bold) | yes | yes | yes | yes | The mark carries on both. |
| Enter in a paragraph | yes | yes | yes | yes | |
| Enter in the third-level list item | yes | yes | yes | yes | `baseKeymap`'s `splitBlock` splits the item's paragraph on both; no list keymap is in the plugin list. |
| Backspace at the start of a paragraph (join) | yes | yes | yes | yes | |
| Backspace at the start of a list item | yes | yes | yes | yes | |
| Delete at the end of a paragraph | yes | yes | yes | yes | |
| Shift+Arrow selection, then type over it | yes | yes | yes | yes | |
| Select across two blocks, then Delete | yes | yes | yes | yes | Shift-click extends the browser's selection on both. |
| Mod-b on a selection | yes | yes | yes | yes | |
| Mod-b straight after the Shift+Arrows, with no pause | **no** | yes | yes | **no** | A demonstration, not a fault of the `FragmentedView`: see below. |
| The `>` input rule at a paragraph start | yes | yes | yes | yes | |
| Mod-a, then type | yes | yes | yes | yes | |
| Paste plain text | yes | yes | yes | yes | Through the real clipboard, `navigator.clipboard.write` then Mod-v. |
| Paste HTML | yes | yes | yes | yes | A paragraph with bold and a one-item list. |
| Dead key for an accent (Alt+e, then e) | yes | yes | yes | yes | Playwright does not run the operating system's dead-key machinery: the right saw `keydown Alt`, `keydown e`, `beforeinput insertText "e"`, and both views got a bare `e`. The real dead key is untested; it reaches the view as a composition. |
| IME composition (CDP `Input.imeSetComposition` twice, then `Input.insertText`) | yes | yes | yes | yes | A real composition: the right saw `compositionstart`, three `compositionupdate` and `insertCompositionText` (か, かん, 漢), `compositionend "漢"`, and read 漢 back from the textblock. |
| A click placing the caret | yes | yes | yes | yes | Both carets at 534, the target. |
| ArrowDown, ArrowDown, ArrowUp across line wraps, then type | yes | yes | yes | yes | The browser moves the caret natively on both. |

Eighteen of nineteen acts are equal on every count in each of the eight runs whose table was read. The red row is a demonstration of a difference between the two views' timing, kept because it is real. `EditorView` reads the browser's selection only on `selectionchange`, which the browser dispatches as a task of its own; Playwright presses keys back to back, so `EditorView`'s keymap ran Mod-b on the selection from before some of the Shift+Arrows (before all eight in seven runs, so it bolded nothing; before four of them in one, so it bolded half the range). `FragmentedView` reads the browser's selection at the start of every `keydown` and `beforeinput`, so it bolds all eight characters every time. With a human's pause between the arrows and the command (the row above it), the two agree. Undo agrees in the red row because both undo to the fixed document; redo disagrees because the documents did.

## The timings

Milliseconds from `keydown` to the end of `updateState` of the transaction the key made, with the layout forced (`offsetHeight`) on both sides, over the 30 keys of the typed sentence. Chromium's `performance.now()` is coarsened to a tenth of a millisecond.

| Document | `EditorView` median (max) | `FragmentedView` median (max) | `FragmentedView`'s own `updateState` median (max) |
| :--- | :--- | :--- | :--- |
| The fixed document, 424 words | 0.90 (2.70) | 1.40 (2.10) | 1.20 (1.80) |
| The same ten times over, 4 240 words | 1.00 (1.30) | 4.35 (7.50) | 4.20 (7.40) |

`EditorView` patches the one text node the key changed and stays near one millisecond whatever the length; the `FragmentedView` re-serializes and replaces the whole fragment on every key, and its cost grows with the document, about 0.4 ms per thousand words here. Extrapolated, not measured: a 16 ms frame is spent somewhere near 40 000 words in one fragment. Phase 2's patching and its fragments of a page each are what keep it flat. No character was lost in any run: every key is applied to the model synchronously inside its event, and the fill writes its DOM before its promise's first wait, so the next key reads a state and a DOM that already hold the last.

## What the FragmentedView does not do yet

- **Composition** is the minimum: the browser composes, the view renders nothing while it lasts, and at `compositionend` it parses the textblock under the caret back with the schema's `DOMParser` and applies the difference from the model as one replace. A composition that spans blocks, a transaction from elsewhere arriving during a composition and touching the same block, and autocorrect's `insertReplacementText` (handled over the browser's target range, but never driven) are untested. Phase 5 reads back properly.
- **Decorations**: inline decorations with a class are painted with the CSS Custom Highlight API, one `Highlight` per class, named by the class; where the browser lacks the API they are ignored. Widget and node decorations are ignored. Highlight names are global to the page, so two views painting one class share it.
- **`endOfTextblock`**: up and down read the rendered lines as `prosemirror-view` does; the horizontal directions answer start or end of the parent, `prosemirror-view`'s answer for text with no right-to-left character. Bidirectional text is not handled, and for a state whose document is not the rendered one, up and down fall back to the model's answer.
- **Not built**: node views; `handleClick`, `handleDoubleClick` and their kin; a node selection by clicking a leaf (an image gets a caret beside it, not a selection); drag and drop, both halves refused; scrolling the selection into view when a transaction asks; `transformPasted` and its kin; the `attributes` prop; copying a ProseMirror slice (copy is the browser's own, from the rendered DOM, with no `data-pm-slice`, so a paste of it loses its open depth); `nodeDOM` for a text node (null); formatting `beforeinput` types (refused).
- **The box**: a first line taller than a finite box is answered as a cut at the box's own `from`; the chain must force one line in (phase 2). Measuring renders the whole rest of the document once per fill.
- **Not exercised**: collaboration. `prosemirror-collab` is installed, and the chain maps through any transaction, rebased ones included, but no session ran against an authority; the plan's proof of the seam names the studio's authority and the generic schema, which this repository does not have.

## What surprised

- **A slice inside one textblock drops the textblock.** `doc.slice(from, to)` cuts at the shared depth of its ends, so a fragment from the middle of a paragraph to the end of the same paragraph is bare text with no `<p>` around it. The renderer passes `includeParents` and always gets the ancestors back to the document, so every fragment renders as a tree rooted where the document is.
- **Typing over a whole-document or node selection does not collapse it.** `tr.insertText(text, from, to)` maps the selection, and an `AllSelection` maps to itself: after Mod-a the first key replaced everything, and the second key replaced everything again. The view's default puts the caret after the inserted text when the mapped selection is not empty, which is where the browser's own editing leaves it, and the Mod-a act agrees after that.
- **The boundary associations make neighbours overlap for one transaction.** With `from` mapped at −1 and `to` at 1, as the plan has it, an insertion at a cut falls inside both entries; both are marked dirty, and the refill of the first sets the second's `from`. The chain is consistent again after the refill, not after the mapping.
- **The parity harness needed the targets in the viewport.** The left column's lower half sat below Playwright's 1 000-pixel viewport, and a click there landed nowhere; the script scrolls each target into view before reading its coordinates. It cost one red row in the first run.
- **The two views agree almost everywhere because the plugins do the work.** Enter, Backspace, Delete, Mod-a, Mod-b and the input rule are commands from `prosemirror-commands`, `prosemirror-inputrules` and the keymap, running against `view.state` and `view.dispatch`; the view's own defaults (a split, a target-range delete, a parsed `<br>`) ran in none of the acts. What the view had to get exactly right was the selection the commands read and the geometry the clicks used.
- **The plan's phase plan names the studio** (a `fragview/` folder, a branch of the studio, `notes/fragview-results.md`, the clipboard from the studio's `src/clipboard.js`). Phase 1 was built in this repository instead, with the basic schema and its list nodes, its record here; the studio's clipboard was not ported.

# Phase 2, fixed-height boxes and the chain: results

Written 2026-10-24, on the branch `phase/2-fixed-height-boxes-and-the-chain`. A record, not a plan: what phase 2 of [the plan](plan.md) built on phase 1, what `scripts/chain.mjs` measured, and what is still not done. Run it again with `npm test` (29 assertions, two of the suites in Chromium), `npm run chain` (every act below), `npm run parity` (phase 1's acts under one infinite box, the regression) and `npm run parity -- --boxes` (the same acts under 320 × 480 boxes). The harness takes `?boxes=320x480`, `?window=near`, `?long=1` and `?late=1`.

## What was built

| Module | Lines (phase 1) | What phase 2 changed |
| :--- | ---: | :--- |
| `src/fragments-plugin.js` | 171 (128) | A step now also touches the entry before a cut when it lands in the first word after the cut (that word not fitting is why the line before the cut ended). An entry whose `from` has no cursor position after it is dropped, and the one before runs to the end. `dirtied(tr, key)` marks an entry dirty with no step, for late truth. |
| `src/overflow-box.js` | 160 (120) | The trial is bounded: `from` plus a span of positions (twice the last fill's, 2 048 on a first fill), doubled until it reaches the end or holds two lines past the line of the cut. The forced first line. The shown end leaves out the nodes opened at the cut. `moved` leaves the `ResizeObserver` callback for the next frame. The content element is a block formatting context. |
| `src/slice-renderer.js` | 228 (215) | `openedAt(doc, pos)`, the position before the outermost node that opens at `pos`. A slice that starts at such a position records those nodes with their own opening positions instead of clamping them to `from`. |
| `src/fragmented-view.js` | 949 (635) | The chain filled in order, one dirty entry at a time. Clean fragments keep their DOM, their positions translated by the shift of their `from`. The window policy with placeholders and an estimate. The selection painted as one highlight across fragments, the browser's selection kept in the head's fragment, ArrowLeft at a cut. Geometry across the chain. Decorations clipped to each fragment and cached per fragment. Copy and cut from the model's selection. |
| `harness/` | 232 (179) | The four query flags, a log of every fill and every transaction on the right, `select(side, anchor, head)`, and `late.svg`. |
| `scripts/chain.mjs` | 355 | The acts below. `parity.mjs` gained `--boxes`. |
| `test/` | 301 (258) | The plugin: `dirtied`, the first word after a cut, the drop at the end (11 cases in all). The box: a 40-pixel box under 60-pixel lines, and a chain of such boxes reaching the end (5 in all). |

One answer to an open question of the plan: `fill` stays asynchronous by signature, and every late truth after it arrives through `moved`. The `OverflowBox` does all its work synchronously, so its promise settles in a microtask, and the view's ripple, one `refilled` transaction per fragment, completes before the browser's next task.

## The chain in motion

The harness document (424 words) under 320 × 480 boxes is five fragments: 0–599, 599–1149, 1149–1512, 1512–2089, 2089–end. The first build took five fills, the first 5.3 ms (it is the first layout of the page) and the others 1.0, 1.2, 0.8 and 0.3 ms.

| Act | The chain mapped by the edit, before any fill | Refills | The chain after | Notes |
| :-- | :-- | :-- | :-- | :-- |
| One character typed in the first paragraph (the cut does not move) | 0–600, 600–1150, … every entry moved by one; only the first dirty | 1: box 0, 1.5 ms | 0–600, 600–1150, 1150–1513, 1513–2090, 2090–end; none dirty | The refill's `to` equals the mapped `to`, so the work ends there. Boxes 1 to 4 keep their DOM: the element that was their first child before the edit is still their first child after it. |
| Undo of that character | 0–599, 599–1149, 1149–1512, 1512–2089, 2089–end: the chain before the edit, by mapping alone | 1: box 0 | equal to before the edit | A refill still ran, because the undo's step touched the first fragment's range, and the fragment's DOM must show the restored text. It changed no entry. |
| Enter at the end of the first paragraph, then "A new line." (12 transactions) | 0–601, 601–1151, … after the Enter | 16: boxes 0, 1, 2, 3, 4 for the Enter, then box 0 alone for each of the 11 characters | 0–537, 537–1095, 1095–1513, 1513–2055, 2055–end | The new line pushes the first box's last line out; each cut moves back and the ripple reaches every box, all five of five on this document. A typed character after that refills one box. |
| Undo of that edit (one Mod-z undoes it all) | 0–524, 524–1082, 1082–1500, 1500–2042, 2042–end | 5: boxes 0 to 4 | equal to before the edit | The mapping alone does not restore the chain here: the edit's cuts moved by refills, not by mapping, so the undo's mapping only takes away the 13 positions the edit added. The ripple restores the rest. |

After each act every built box showed exactly the text of its entry's range (`textContent` against `doc.textBetween(from, to)`).

## No re-render of the untouched

Phase 1 re-rendered the whole fragment on every key; phase 2 fills only the dirty fragments, and a measuring fill renders about three boxes' worth of the document in two passes (a trial of twice the last span, then the box itself), not the rest of it. Milliseconds from `keydown` to the end of the `updateState` of the key's transaction, with the layout forced, over 30 typed keys; "the chain settled" runs to the last `refilled` transaction the key caused, with no fill in flight.

| Document | Right side | Boxes (built) | `EditorView` median (max) | `FragmentedView`, the key's update | The chain settled | Its own `updateState` |
| :--- | :--- | ---: | :--- | :--- | :--- | :--- |
| 424 words | one infinite box | 1 (1) | 0.70 (1.20) | 1.20 (3.10) | 1.40 (3.40) | 1.00 (3.00) |
| 4 240 words | one infinite box | 1 (1) | 1.00 (2.60) | 5.30 (6.60) | 6.00 (7.10) | 5.15 (6.40) |
| 424 words | 320 × 480 boxes | 5 (5) | 0.75 (1.40) | 1.20 (2.00) | 1.50 (2.30) | 1.00 (1.70) |
| 4 240 words | 320 × 480 boxes | 47 (47) | 1.00 (3.10) | 1.60 (2.90) | 2.30 (5.30) | 1.40 (2.30) |
| 424 words | 320 × 480 boxes, window near | 4 (3) | 0.70 (2.80) | 1.10 (2.90) | 1.40 (3.20) | 1.00 (2.60) |
| 4 240 words | 320 × 480 boxes, window near | 4 (3) | 1.00 (1.70) | 1.20 (3.50) | 1.85 (4.00) | 1.05 (2.70) |

Under one infinite box the cost still grows with the document, as in phase 1 (5.30 ms at 4 240 words; phase 1 measured 4.35). Under boxes the fill is flat, but the key still costs more on the long document with every box built (1.60 ms against 1.20). A profiling run (wrapping the view's methods in the page, not kept in the repository) split the update, per key, short document against long. The fills went from 0.69 to 0.77 ms. The decoration paint went from 0.12 to 0.42 ms, of which the harness's own decorations plugin, which rebuilds a `DecorationSet` over the whole document on every state and costs the `EditorView` the same, went from 0.05 to 0.21 ms. Drawing the browser's selection went from 0.11 to 0.28 ms, the browser's work in a larger editing host. Two changes took the long document from 2.20 to 1.60 ms: the highlights hold `StaticRange`s instead of live `Range`s, and a fragment keeps its decoration ranges while its DOM and the decorations over it are unchanged. A live `Range` is updated by the browser on every DOM mutation while a highlight holds it. With `window: near` the long document costs what the short one does.

## The selection across fragments

Each act on the five-fragment chain; "box" is the fragment's index, and the browser's selection is read from `getSelection()`.

| Act | The model's selection | The browser's selection | The highlight's ranges |
| :-- | :-- | :-- | :-- |
| Click in box 0, Shift-click in box 1 | 350 → 702 | in box 1, from its first point to the head | boxes 0 and 1 |
| Shift+ArrowRight six times from three before the cut at 599 | 596 → 602 | in box 1: the head crossed with one key per position | boxes 0 and 1 |
| ArrowLeft six times from 602 | heads 601, 600, 599, 598, 597, 596 | collapsed in box 0 | none |
| ArrowRight six times back | heads 597, 598, 599, 600, 601, 602 | collapsed in box 1 | none |
| Shift+ArrowLeft six times from 602 | 602 → 596 | in box 0 | boxes 0 and 1 |
| Typing "Z" over 502 → 628, across the cut | replaced in the model | collapsed | none |
| Mod-c over 350 → 702 | | | the clipboard's text is the model's selection, 352 characters |
| Mod-a | 0 → 2475 | in box 4, from its first point to the end | boxes 0, 1, 2, 3 and 4, every built box |

Typing over the cross-fragment selection touched boxes 0 and 1, moved their cuts, and refilled boxes 0 to 4. The documents were equal with the `EditorView` typing the same key over the same selection. The cut at 599 lies inside a paragraph, so 599 is both the end of box 0's last line and the start of box 1's first; the caret at 599 stands at the start of box 1, and ArrowLeft from there is the view's own move to 598. Without it, the browser's ArrowLeft goes to the end of box 0, the same position 599, and a second key is needed. ArrowRight needs nothing: the browser goes from 598 to the end of box 0, the view reads 599 and draws it at the start of box 1.

## Geometry across the chain

| Question | Answer on the five-fragment chain |
| :-- | :-- |
| `domAtPos` at each of the four cuts | In the next box, every time. `coordsAtPos` at each cut lies inside the next box's rectangle, and `fragmentAt` names the next entry. |
| `posAtDOM(domAtPos(p))` for every position 0–2475 | 2 476 of 2 476 come back. Before `openedAt`, 1147 and 1148, the positions opening a list item whose first line is the cut at 1149, came back as 1147. |
| `posAtCoords(coordsAtPos(p))` for every position in a textblock | 2 434 of 2 434 come back. |
| `nodeDOM` of each top-level block | 13 of 13 lie in the box `fragmentAt` names for the block's first content position. Two of them, a paragraph and a heading, open at a cut and are found in the next box. |

## The forced first line

A box shorter than its first line takes that line anyway, so `to` is strictly greater than `from` and the chain advances. The rule is that a line is a candidate for the cut only when its top lies at or below the bottom of the first line's first box. With `?boxes=320x40` the harness document is 71 boxes, every `to` greater than its `from`, the last running to the end. Box 0 holds "The composition ", the heading's first line, 48 pixels tall in a 40-pixel box (`to` 17). The suite's case is a 40-pixel box under 60-pixel lines.

## The window policy

`window: { build: 'all' }` is the default and builds every fragment. `window: { build: 'near', margin: 1 }` builds the fragments whose elements meet the browser's viewport, one more on each side, and the fragment that holds the selection's head, so the caret always has a box. Its choices:

- **An unbuilt entry is a placeholder, as tall as the last built box.** For a fixed-height box that is exact. The last entry, when unbuilt and running to the end, stands for the rest of the document: as many boxes as the positions left divided by the mean span of the built entries, box heights plus the gaps between them (the view's `row-gap`). That is the box height times an estimate of the boxes, not the measured line height times an estimate of the lines, because the box, not the line, is the unit a placeholder replaces.
- **The chain is cut only as far as it is needed.** A dirty entry is filled when it is near, or when a near entry follows it, because the ripple must pass it to know where the near one starts; a fragment filled only to be passed is released again. Beyond the last near entry the ripple stops, and the dirty entry waits until it comes near.
- **`coordsAtPos` for a position in an unbuilt fragment answers an estimate**: a zero-height box at the placeholder's left, at the position's share of the entry's range down it, marked `estimate: true`. `domAtPos` throws a `RangeError` that says the fragment is not built. Building on demand was refused for two reasons: a geometry query that writes DOM lets a read cause a fill, and the fill's answer arrives in a promise, so a dirty entry's position could not be known before the call returned.
- **An `IntersectionObserver` on the placeholders** asks for a pass at the next frame when one comes into view. The pass then reads every element's rectangle against the window's viewport.

Measured on the 4 240-word document:

| Act | Entries | Built | Fills | Notes |
| :-- | ---: | :-- | ---: | :-- |
| First build, the top in view | 4 | 0, 1, 2 | 3 | The last entry, 1512–end, is a placeholder of 24 048 pixels; the page is 25 668 pixels tall, against 24 132 when every box is cut (the estimate 6 % high). |
| `coordsAtPos(17325)`, in the unbuilt rest | | | | `{ top: 17968, estimate: true }`; `domAtPos` throws "Position 17325 is not shown by any fragment (its fragment is not built)". |
| Scrolled to the middle | 29 | 0, 23–27 | 25 | 405 ms of wall clock, the script's settle included. Box 0 stays built: it holds the head. |
| Scrolled to the bottom | 47 | 0, 44, 45, 46 | 19 | The chain complete, the last 24688–end. |
| A line inserted at the top, the top in view | 47 | 0, 1, 2 | 14 | Boxes 0, 1, 2 for the Enter, then box 0 for each character; box 3 left dirty, unbuilt. |
| Then scrolled to the middle | 47 | 0, 22–26 | 14 | The ripple resumed from box 3 and stopped by itself before box 22, where a cut landed where the mapping put it; nothing dirty; every built box shows its entry's text. |

## Late truth: moved

With `?late=1` the second paragraph opens with an image whose `src` the script holds back for 800 ms, so it arrives after the chain is built. Before it: 0–601, 601–1151, 1151–1514, 1514–2091, 2091–end. When it arrived the first box's content grew. Its `ResizeObserver` dispatched `moved` at the next frame, and the view dispatched `dirtied` for box 0, 30.3 ms after the image's response ended (decoding, a frame and the deferral). The ripple refilled boxes 0 to 4 (1.1, 0.7, 0.7, 0.7 and 0.2 ms), the last `refilled` 3.8 ms after the `dirtied`. After: 0–403, 403–1072, 1072–1485, 1485–1970, 1970–end. The 120-pixel image pushed five 24-pixel lines (198 positions) out of the first box.

## The parity acts again

Under one infinite box, the regression: 18 of 19 acts equal, as in phase 1. The red row is again the demonstration of `EditorView`'s late selection read, Mod-b pressed straight after eight Shift+Arrows. In this run `EditorView` bolded four of the eight characters and kept the four-character selection, so the selections differ too. The `FragmentedView` bolded all eight, as every time. Under 320 × 480 boxes, 17 of 19. Besides the same red row, the arrows act differs: ArrowDown, ArrowDown, ArrowUp land on different positions because a 320-pixel box wraps its lines elsewhere than the 520-pixel `EditorView`. That is a difference of geometry, not of the view. The typing timings of `npm run parity -- --boxes`: 1.10 ms median on the short document, 1.50 on the long.

## What is not done

- **The window's viewport only.** `near` reads every element's rectangle against the window, not against a scrolling ancestor. A view in a scrolling pane needs the observer's own records, or a root.
- **The first word after a cut** is a run of non-space characters. A cut in CJK text, or after a hyphen, dirties too little; `Intl.Segmenter`'s line granularity is the fix when it matters.
- **The trial's margin of two lines** assumes greedy line breaking. `text-wrap: balance` or `pretty` lays out a paragraph's lines together, and a trial that ends inside such a paragraph can move the cut.
- **ArrowLeft at a cut** is left-to-right only. Word moves (Alt+Arrow), ArrowUp and ArrowDown across a box boundary, and a drag that extends across boxes are left to the browser, and no act drives them.
- **The decoration paint** still reads every decoration's position on each paint to decide which fragments changed, and recreates each class's `Highlight`. `Highlight.add` and `Highlight.delete` per changed fragment would leave the untouched alone.
- **Highlight names are global to the page**: two views share `fragview-selection` and every decoration class.
- **Collaboration** is still not exercised, and node views, drag and drop, `scrollIntoView` and the rest of phase 1's list are unchanged.

## What surprised

- **An edit after the cut can move the cut.** Deleting a few characters at the start of box 1 can let the first word of box 1 fit on box 0's last line, though no step touched box 0's range. The plugin's touched test now reaches the end of the first word after a cut.
- **A cut at a paragraph's first line rendered an empty paragraph at the foot of the box before.** `doc.slice(from, to)` with `to` at the start of a textblock's content includes the textblock, opened and empty, and the renderer gave it a trailing break. The box now ends at `openedAt(to)`, and the next box shows the opening positions, which is also what `posAtDOM` needed for 2 476 of 2 476.
- **The undo of a cut-moving edit is a ripple, not a mapping.** The mapping only takes back the positions the edit added; the cuts the refills moved come back through the same refills.
- **The `ResizeObserver` reported a loop** when `moved`'s listener refilled inside the observer's callback. A refill changes the sizes being observed, and the browser fires an error event, which a page treats as an uncaught error. `moved` now leaves for the next frame.
- **Live ranges cost.** The highlights held 80 live `Range`s on the long document (the decorated word occurs 8 times in each of its ten copies), and the browser updated each one on every DOM mutation. `StaticRange` took 0.5 ms off the key's median, from 2.20 to 1.70.
- **`page.goto` waited for the late image.** Playwright's default waits for the `load` event, which waits for images, so the first measurement of `moved` saw the image already there. The script loads with `domcontentloaded`.
