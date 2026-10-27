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

# Phase 3, the slice renderer from the generic schema: results

Written 2026-10-24, on the branch `phase/3-the-slice-renderer-from-the-generic-schema`. A record, not a plan: what phase 3 of [the plan](plan.md) built on phases 1 and 2, what the three new scripts measured, and what is still not done. Run it again with `npm test` (50 assertions, two of the suites in Chromium), `npm run lossless`, `npm run acts` and `npm run fragments`; the regressions are `npm run parity`, `npm run parity -- --boxes` and `npm run chain`. The harness takes `?schema=generic&marks=structured` (or `marks=nodes`), with `boxes=320x480` as before.

## What was built

| Module | Lines (phase 2) | What phase 3 changed |
| :--- | ---: | :--- |
| `src/slice-renderer.js` | 402 (228) | Shallow siblings put away, the words of a divided box, ordinals for an opened `ol`, structured marks rebuilt from their instances and stamped, unshown leaves drawn as nothing, the trailing break for textblocks only; `AWAY_SHEET`, `CONTINUATION_SHEET`, `addWord` and the word constants. |
| `src/fragments-plugin.js` | 179 (171) | A step whose map moves nothing (a mark, an attribute) dirties the entries where the documents before and after it differ. |
| `src/index.js` | 10 (10) | The new exports. |
| `harness/generic.js` | 47 | The generic-schema mode: the studio's schema module, the lab laid out in an iframe under its own sheets, the parse (with `data-src` tags on request), the studio's document serializer. |
| `harness/main.js`, `index.html` | 182, 37 (163, 37) | `?schema=generic&marks=…`, the renderer's two sheets adopted (in both modes), `harness.mount(doc)`, the harness's own typography kept off the lab. |
| `harness/fixtures/schema-lab/` | 191 + 53 | The lab and its two sheets, copied from the studio with a note of their origin in each file. |
| `vite.config.js` | 18 | The studio's folder allowed, and `prosemirror-model`, `-state` and `-transform` deduplicated. |
| `scripts/` | 93, 182, 136 | `lossless.mjs`, `acts.mjs`, `fragments.mjs`. |
| `test/` | 348 (305, counted with blank.html) | The renderer: three list cases, a reversed list cut at the end, two structured-marks cases, the words on the nested cases (14 cases in all, from 4). The plugin: a mark added inside an entry (12 cases). The box's fixture adopts the two sheets. |

**The studio as a dependency.** `npm install -D` by path wrote `"beltype-studio-experiment": "file:../../../../Users/egildo/Privata/dev/beltype-studio-experiment"` and a symlink; the brief's `../../../Users/…` resolves to `/Volumes/Users`, one level short. Nothing in the studio was written. The schema module's import graph is `schema-generic.js` → `schema.js` (for `facsimile`) → `repeat.js` → `store.js` → `binds.js` → `fontoxpath`, and `csv.js`. All of it loads in vite with no alias: `fontoxpath` resolves from the studio's own `node_modules`. Vite needed two things, in `vite.config.js`. The first is `server.fs.allow` for the studio's real path, which lies outside this root. The second is `resolve.dedupe` for the three pure libraries: without it the schema module imports the studio's own copy of `prosemirror-model`, whose nodes the state and the view here would not recognize.

## The renderer's words, and where each goes

The words are BelType's Cicero's, from its registry (`packages/engine-cicero/src/data-beltype.js`), spelled exactly as there, in the one attribute `data-beltype`, added to what an element carries and never overwriting it.

| Word | On | When | Rule (in the sheet named) |
| :-- | :-- | :-- | :-- |
| `away` | a shallow sibling: the outer element of a node, its attributes, no children | at every open depth whose node holds blocks (the document, and each divided ancestor), for the `$from.index(d)` children before the live one; none after the cut, since those are on later fragments; none for a textblock's inline children, which are the previous fragment's lines; none for a node the page does not draw | `display: none !important` (`AWAY_SHEET`) |
| `split` | every element the fragment divides | opened at the start (it began on an earlier fragment) or cut at the end (it goes on later) | |
| `end` | a divided piece that holds the box's end | opened at the start only | a `split` without `start` gives up its top margin, border and padding and its `text-indent`; an `li` also its `::marker` (`CONTINUATION_SHEET`) |
| `start` | a divided piece that holds the box's beginning | cut at the end only | a `split` without `end` gives up its bottom margin, border and padding (`CONTINUATION_SHEET`) |
| `fragment` | the root of a divided piece | the outermost divided element, a child of the fragment itself | |
| `adjoin` | the first-child chain after a cut between boxes | the nodes that open where the fragment starts (from `openedAt(doc, from)` up to `from`), not divided | `margin-top: 0 !important` (`CONTINUATION_SHEET`) |

Two attributes that are not words. **`value`** goes on the first displayed `li` of an `ol` the fragment opens, its ordinal by HTML's algorithm (§4.4.8: `start`, else the count of items when `reversed`, else 1; an earlier item's `value` resets the count; each item counts one, down when `reversed`), unless it has its own; and on the first `li` of a `reversed` `ol` without `start` cut at the end. **`data-txt-i`** carries the instance on every element written for a structured mark, and on an inline atom whose attributes carry an `instance` (the studio's empty inline). Under the nodes variant nothing is stamped.

The brief named `cut` for an element divided at the end. The registry has no such word: Cicero writes `split` on every piece and `start` or `end` on the piece that holds an edge, so a resumed piece is `split` without `start` and a cut-off one is `split` without `end`. Those are the words used. `adjoin` was not in the brief. It is added because the shallow siblings took the harness's `.fragview-box > div > :first-child { margin-top: 0 }` off the box's first displayed element, and Cicero's word for that margin is `adjoin`.

**Structured marks** are recognized by the mark type's spec (`structured: true`) and the instance's `{ instance, parent }`. **Unshown leaves** (whitespace and comments between blocks) are recognized by the node type's spec (`unshown: true`). Both conventions are the studio's own, and the renderer reads nothing else of the studio. The inline tree is rebuilt as the studio's serializer rebuilds it, with its `chainOf` copied (16 lines). Every mark element is made through `serializeMark`, so the position map records it; the studio's serializer makes them with `createElement`, which is why it could not be used as it is.

## Lossless under boxes

`npm run lossless`. The lab, 203 elements in the body, under 320 × 480 boxes: 7 fragments under structured marks (0–750, 750–1313, 1313–1779, 1779–2251, 2251–2525, 2525–2921, 2921–end) and 7 under inline nodes. Mounting changed no document (`doc.eq` against the parse).

**The file side.** The state written back by the studio's document serializer, compared as the studio's `scripts/generic-schema.mjs` compares (attributes sorted, nothing else normalized, child lists aligned by their longest common subsequence):

| Variant | Differences | Which |
| :-- | --: | :-- |
| structured marks | 6 | the `div.inside` lost from `span.wrapper` and added after it with a second `span.wrapper`, the text after it lost from the span; the `li` added in `ul.loose` and the text lost from the list |
| every inline a node | 6 | the same, with the text after the div added as text instead of a second span |

These are the lab's 6 known differences, all in the section written to be refused, as in the studio's runs three and four. Nothing else differs.

**The page side.** Every element a fragment shows, traced to the file by the `data-src` tag of a second, tagged parse. Not in the file means it has no tag, or its tag or its parent (through the schema's `txt-run`) is not the file's. Under structured marks:

| Fragment | Range | Elements | Away | Not in the file | Runs |
| --: | :-- | --: | --: | --: | --: |
| 0 | 0–750 | 34 | 0 | 0 | 0 |
| 1 | 750–1313 | 47 | 2 | 0 | 0 |
| 2 | 1313–1779 | 34 | 5 | 0 | 0 |
| 3 | 1779–2251 | 29 | 9 | 0 | 0 |
| 4 | 2251–2525 | 44 | 15 | 0 | 2 |
| 5 | 2525–2921 | 53 | 16 | 0 | 1 |
| 6 | 2921–end | 37 | 20 | 3 | 3 |

Every one of the 67 shallow siblings is in the file, under its file parent, and empty. The renderer invented no element: no wrapper and no trailing break (no textblock in the lab is empty). The three elements of fragment 6 not where the file has them are the parse's repairs in the refused section: `div.inside` under the host instead of the span, the span's instance written again inside it (the instance is written three times in that fragment), and the `li` the parse created in `ul.loose`. Under inline nodes the same table holds, with 35 elements in fragment 6 and 2 not in the file (no repeated span). The 6 runs are the lab's 5 mixed contents, the fieldset's run counted twice because the cut at 2921 falls inside it, in the button's "Print".

## Editable under boxes

`npm run acts`: under 320 × 480 boxes with structured marks, real mouse and keys, each act from the lab as parsed. Bold is the studio's `toggleStructured`; Enter is `prosemirror-commands`' `baseKeymap`. The expected document is the lab as parsed and written back, with the act's change applied as a string replacement written in the script from the source. "Boxes equal" compares each box's DOM with a fresh render of its entry's range.

| Act | Equal to the expected document | Valid | Boxes equal | Notes |
| :-- | :-- | :-- | :-- | :-- |
| "NOVA" typed inside `span.tag > a.ref > span.inner`, before "rasa" | yes | yes | 7 of 7 | `<span class="inner" lang="la">tabula NOVArasa</span>`, inside the link inside the outer span |
| Bold across the nested inline, "holds a link … and" | yes | yes | 7 of 7 | selection 354 → 401; one new instance, written as 3 `strong` elements on the page, each stamped with it |
| The same Bold, then Bold again | yes | yes | 7 of 7 | the paragraph as it was |
| Enter at the end of "One point one point one", then "fresh" | yes | yes | 7 of 7 | `<li>One point one point one</li><li>fresh</li>`, the list's own whitespace after it |
| "wide " typed inside the `pre`'s `code`, before "spaces" | yes | yes | 7 of 7 | the code mark goes on; the spaces and the tab stay |
| Enter at the end of `<li value="10">ten</li>`, then "ten and a half" in the new item | yes | yes | 7 of 7 | `<li value="10">ten</li><li>ten and a half</li><li>eleven</li>`: the new item has no `value` |
| A selection from fragment 0 into fragment 1 (745 → 755, in the heading the first cut divides), then Backspace | yes | yes | 7 of 7 | the highlight's ranges in boxes 0 and 1; the ten characters gone from the heading |
| … and undone (Mod-z) | yes | yes | 7 of 7 | the chain back to 0–750, 750–1313, 1313–1779, 1779–2251, 2251–2525, 2525–2921, 2921–end |

Eight of eight. The first run of the Bold act was equal on the document and wrong on the page; the fix is the first item under "What surprised".

## Numbering and selectors

`npm run fragments`. **Numbering.** The lab's lists section (positions 2180–2408) holds an `ol start="4"`, an `ol reversed`, an `ol` with `li value` attributes and an `ol` three deep. It was cut at the start of each of its 13 items' text in turn, as a box cuts at a line: one fragment from the section's start to `openedAt(cut)`, one from the cut to the section's end, with the view's renderer and the lab's and the renderer's sheets. `getComputedStyle(li, '::marker').content` is `normal`, and a counter in `content` computes to its specified form, so neither reads a number. Each marker's text was read from Chromium's accessibility tree instead, as the name of the item's ListMarker node (CDP `Accessibility.getFullAXTree`). It was compared with the same source item's marker in one rendering of the whole document. That rendering's markers are 4. 5., 3. 2. 1., 10. 11. 20., 1. 1. 1. 2. 2., HTML's ordinals for the file.

| Cut at the start of | Markers compared | Equal | The resumed items |
| :-- | --: | --: | :-- |
| four, five, three, two, one | 13 each | 13 each | none |
| ten, eleven, twenty | 13 each | 13 each | none |
| One | 13 | 13 | none |
| One point one | 13 | 13 | "One": no marker |
| One point one point one | 13 | 13 | "One", "One point one": no marker |
| One point one point two | 13 | 13 | "One", "One point one": no marker |
| Two | 13 | 13 | none |

Before the reversed-list fix, the cuts at "two" and "one" read 12 and 11 of 13: the fragment before the cut numbered "three" 1 and then 2 (see below).

**Selectors.** Three rules were added to the page: `:nth-child(2)`, `h2 + *` and `li + li`, each setting a custom property registered as not inherited. Every element each 320 × 480 fragment shows (shallow siblings and the inside of `svg` and `math` aside) was compared with the same source element in the whole rendering. The fragments are 0 to 6, with 34, 45, 29, 20, 27, 36 and 13 elements. They matched the three rules 60, 20 and 10 times, the `li + li` rule on 8 items of fragment 4 alone, and **0 differ** from the whole rendering. The whole rendering against the file itself, asked with `matches` on the laid-out lab, differs on 6 of 193 elements, and none of them is the renderer's. Two are the nested `ol`s of "One" and "One point one", which a `txt-run` holding the item's text makes the second child. Two are the fieldset's `label`s, which a `txt-run` holds. Two are the refused section's repairs. Those six are the cost of the schema's runs for mixed content.

## The regressions

- **Parity, one infinite box**: 18 of 19, the red row the same demonstration of `EditorView`'s late selection read.
- **Parity under 320 × 480 boxes**: 17 of 19, the same two as in phase 2 (that row, and the arrows' different line wraps at 320 pixels).
- **Chain**: every geometry check holds. `posAtDOM(domAtPos(p))` comes back for 2 476 of 2 476 positions, `posAtCoords(coordsAtPos(p))` for 2 434 of 2 434, and `nodeDOM` is right for 13 of 13 blocks. The 40-pixel boxes advance. The undo restores the chain.
- **The cuts moved**, because the continuation sheet takes the top margin off a resumed piece and the adjoining chain. The harness document is now 0–599, 599–1149, 1149–1555, 1555–2109, 2109–end (phase 2: …1512, …2089), and the long document is 46 boxes instead of 47.
- **Timings on the long document under 320 × 480 boxes**: the key's update has a median of 1.70 ms (phase 2: 1.60), and the chain settles in 2.40 (2.30).

## Owed by the studio

Nothing blocks. Two exports would let the package drop its copies:
- `chainOf`, exported from `src/schema-generic.js`. The renderer copies its 16 lines.
- A hook in the page serializer that hands over the element made for each instance. `options.onMark` gives only the id. With the element, the renderer could run the studio's serializer itself, and take its image `src` mapping and its verbatim `style` with it.

## What is not done

- **Shallow siblings cost a fragment the number of blocks before it.** A fragment near the end of a long document writes every earlier top-level block, shallow. ponytail: one element per earlier sibling per fragment, quadratic over a chain; reuse a fragment's siblings from the one before it when it matters. The long document's key costs 0.1 ms more than in phase 2.
- **Counters other than HTML's list numbering are not continued.** A shallow sibling takes no box and so increments nothing, so an author's counter (numbered headings, a figure counter) restarts in every fragment. Cicero delivers the counters at a page's start; this renderer only numbers `ol` items. Cicero's counter rules (`counter-reset`, `-increment`, `-set` as `none` on a resumed piece) are left out of `CONTINUATION_SHEET` for the same reason.
- **`::before` and `::after` stay on every piece.** Cicero keeps `::before` on the start piece and `::after` on the end piece; only a resumed `li`'s marker is taken off here. `wrapped` (`box-decoration-break: clone`) is not read.
- **A structured mark divided by a cut carries no word**, only its stamp. The words go on node elements.
- **`id`s repeat on the page**: a divided element's pieces and an away sibling carry the source's `id`, as copies do.
- **The inline list** (`list_inline`, the studio's `?lists=inline`) is not handled. The studio's page draws its whitespace leaves as empty text nodes; this renderer draws them as nothing.
- **The read-back.** `readComposition` under structured marks re-mints instances, and its parse would read the renderer's own attributes (`data-txt-i`, `data-beltype`, an added `value`) into the attribute maps. Phase 5's read-back uses the stamps; until then a composition inside a structured mark is lossy in identity.
- **Enter in a non-list twin** (a `td`, a `div`) is `baseKeymap`'s `splitBlock` here, not the studio's `splitTwin`. No act drives it.
- **Measured only through the accessibility tree and `matches`.** The continuation sheet's margins were not compared with Cicero's pages.

## What surprised

- **Bold changed the state and not the page.** A mark step's map is empty, so phase 2's plugin, which dirties from the maps' changed ranges, marked no entry dirty, and no fragment was refilled. Phase 1's parity compared documents only and never saw it. Every step whose map reports no range is now diffed (`findDiffStart` and `findDiffEnd` of the documents before and after it). The acts compare every box with a fresh render, so a stale fragment is now red.
- **A reversed list cut at the end numbered itself from what it held.** Chromium counts a `reversed` list without `start` down from the items present, and the fragment before a cut holds only those before it: "three" read 1. The first item now gets `value` from the whole list.
- **The brief's `cut` is not Cicero's word**, and the registry had a better grammar: `split` on every piece, `start` and `end` on the piece holding an edge.
- **The box cuts in the lab fall at line starts that are a textblock's start**, five of six (headings, a list item, a ruby, a run), since its sections are short. The first cut is the only one inside a textblock with five characters on each side, so the cross-fragment act selects inside that heading.
- **The probe properties inherited.** The first selector run read every descendant of a matching element as matching. Registered as not inherited, they read the element alone.
- **The lab's fonts are BelType's** (`/_beltype/vendor/…`) and are not served here, so the boxes are set in Georgia. Structured marks read display, padding, background and generated content, none of which the faces change.

## Where the plan was wrong

- **"Lossless (the saved file byte for byte)"** holds everywhere but the section written to be refused. The lab's 6 known differences stand under boxes as they did in the studio.
- **The plan's phases name the studio's branch and notes.** Phase 3 was built here, as phases 1 and 2 were, with the studio as a linked dependency and its lab copied.

# Phase 4a, the two doors: results

Written 2026-10-24, on the branch `phase/4a-the-two-doors`. A record, not a plan: the two doors phase 4 of [the plan](plan.md) keeps in this package for the paginator's own (`prosemirror-beltype`), what they do and do not do, and the regressions run again. Run it again with `npm test` (61 assertions, three of the suites in Chromium) and the five scripts; the invalidation act is the last but one section of `npm run chain`.

## What was built

| Module | Lines (phase 3) | What phase 4a changed |
| :--- | ---: | :--- |
| `src/slice-renderer.js` | 463 (402) | The `Words` registry and `DEFAULT_WORDS`; `sliceRenderer(words)` returns a renderer for a registry or part of one, and `renderSlice` is the default's; `awaySheet(words)` and `continuationSheet(words)`, with `AWAY_SHEET` and `CONTINUATION_SHEET` the default's text; `addWord` takes the attribute. The constants `WORDS`, `AWAY`, `SPLIT`, `START`, `END`, `FRAGMENT` and `ADJOIN` are gone. |
| `src/fragmented-view.js` | 974 (949) | The `words` prop, from which the view builds its renderer once and hands it to every fill; `invalidate()`; `setProps` invalidates on a new `containers` or `words`; a fill whose container was released since is ignored. |
| `src/fragments-plugin.js` | 179 (179) | `dirtied(tr)` with no key marks every entry dirty. The mapping is untouched. |
| `src/fragmentainer.js`, `src/index.js` | 69, 10 | A comment no longer names an engine; the new exports. |
| `harness/main.js` | 188 (182) | The view is given the default registry explicitly, and `harness.words` is it, for the scripts; `harness.resize(width, height)`. |
| `scripts/` | | `lossless.mjs` and `fragments.mjs` read the words through the registry; `chain.mjs` gains the invalidation act. |
| `test/` | | The renderer under another registry (3 cases and 1 assertion), the two sheets as functions (1), `dirtied` with no key (1), the view's invalidation in Chromium (3, `fragmented-view.test.js`); the naming sweep is no longer to do. |

## The words registry

The registry is `{ attribute, fragment, split, start, end, away, adjoin }`. The default, `DEFAULT_WORDS`, is `data-fragview` with the six words in plain English, as they were: they say what they mean, and only the attribute named an engine. `data-fragview` is the package's own name, already the marker of the view's selection style (`style[data-fragview]`), which carries an empty value and so matches no word. A partial registry takes the rest from the default, so `prosemirror-beltype` passes `{ attribute: 'data-beltype' }` and gets Cicero's spellings, which are these.

The renderer is a factory, `sliceRenderer(words)`, rather than a fourth argument of `renderSlice`, so `Fragmentainer.fill(doc, from, render)` and the `SliceRenderer` type are as they were: a container receives a renderer and never learns a word. The view builds it once from its `words` prop. The plugin never sees the registry, and neither do `pointAt`, `posAt` and `openedAt`, which never read the attribute: the position map holds no words. The words were read in three places inside the renderer, adding a word, finding an `ol`'s first displayed item past the siblings put away, and marking a divided piece's root `fragment`; all three read the registry.

The lab's sheets (`harness/fixtures/schema-lab/styles/`) select on no word, so the harness takes the default and passes it explicitly. Two scripts read the attribute (`lossless.mjs` counts the siblings put away, `fragments.mjs` skips them and reads the resumed items' words); they read it from `harness.words` and from `DEFAULT_WORDS`.

## Invalidation

`invalidate()` is the view's word for "the conditions every fill was made under have changed". It releases every built container and removes its element, drops every placeholder and every hint, and dispatches `dirtied(state.tr)`, a transaction with no step that marks every entry dirty, outside the history as every refill is. The next update finds the first entry dirty and unbuilt, asks the factory for a container, and the ripple refills the rest in order, each in a container the factory makes anew. `setProps` calls it when given a new `containers` or a new `words`, since a fragment drawn by the old factory or with the old words is stale.

It is a transaction because the chain's dirtiness lives in plugin state and every other change to it is one: a collaborator, a plugin view or a `dispatchTransaction` sees it as it sees a refill. The containers are the view's and are released on the view alone, before the dispatch, so the update that follows can only build. The name says what the caller knows, that what was filled is no longer good, and nothing about how the view repairs it; it takes no argument because nothing partial is offered.

What it does not do: it keeps the entries' keys and ranges, which the ripple corrects, and so a chain that grows or shrinks under the new conditions does so through `appended` and `refilled` as on any edit; it keeps the last box height for the placeholders until the first new fill measures one; and it does not know what changed, so a sheet that moves one page refills every page.

`npm run chain`, the invalidation act. The harness document under 320 × 480 boxes (0–599, 599–1149, 1149–1555, 1555–2109, 2109–end), then `harness.resize(280, 400)`:

| What | Measured |
| :-- | :-- |
| The transactions | `dirtied` (all 5 entries dirty), then 7 refills, the 5th and 6th with `appended` |
| The chain after | 0–347, 347–796, 796–1198, 1198–1500, 1500–1936, 1936–2372, 2372–end: 7 boxes, all 280 px × 400 px, none of the old ones left, no placeholder, every box showing its entry's text |
| Against a fresh load at 280 × 400 | the same cuts |
| A key typed after it | in the document, 1 refill, every box consistent; Mod-z undoes the key, not the invalidation |

Under the `near` window policy on the long document, scrolled to the middle, the same resize built the boxes in view and the first one again (6 boxes, all at the new size, each showing its entry's text), left one entry dirty past the viewport, to be filled when it comes near, and the chain grew from 28 entries to 33.

`npm test`, `fragmented-view.test.js`: twelve paragraphs under 300 × 200 boxes, then `invalidate()` with the factory making 400 × 300 boxes: every box new and 400 × 300, no placeholder, the cuts a fresh view's; a transaction after it refills the first box, which shows the text typed; `setProps({ containers })` with a 250 × 150 factory does the same.

**The demo.** `/Volumes/dev/alpha`'s page-size menu now calls `view.invalidate()`; the view is mounted once. Driven by Playwright on its own server: from 480 × 640 (3 boxes, 0–1238, 1238–2383, 2383–end) to 320 × 480 gave 5 boxes, every one 320 × 480, the first among them a new container; then 560 × 400 gave 4, every one 560 × 400. The chain was contiguous and every box showed its entry's text each time; a word typed after both changes reached the document and the box, and one Mod-z took it back; no page error.

## The regressions

Every count is phase 3's.

- **`npm test`**: 61 of 61 (`main`: 52, the naming sweep among them marked to do; the 9 new are listed above).
- **Parity, one infinite box**: 18 of 19, the same red row. **Under 320 × 480 boxes**: 17 of 19, the same two.
- **Chain**: the harness document 0–599, 599–1149, 1149–1555, 1555–2109, 2109–end; `posAtDOM(domAtPos(p))` for 2 476 of 2 476 positions, `posAtCoords(coordsAtPos(p))` for 2 434 of 2 434, `nodeDOM` 13 of 13; the long document 46 boxes.
- **Lossless**: 7 fragments under each variant, the same ranges, the 6 known differences, 67 siblings put away, 3 elements not in the file under structured marks and 2 under inline nodes.
- **Acts**: 8 of 8, every box equal to a fresh render, 7 of 7.
- **Fragments**: 13 of 13 markers at every one of the 13 cuts; the selectors matched 60, 20 and 10 times and 0 elements differ from the whole rendering; the whole rendering against the file, 6 of 193.

## What is not done

- **The registry covers the six words the renderer writes**, not a paginator's others (`slice:N`, `wrapped`, `artifact`, `has:`). A paginator that needs them writes them in its own fill, on the renderer's output.
- **`id`s, the read-back and the rest of phase 3's list** are unchanged.
- **Invalidation is all or nothing.** A change that moves one page (a late face in one paragraph) is `moved`'s, which dirties one entry; a change of conditions dirties all, and nothing between is offered.
- **A new state does not invalidate.** `updateState` with a fresh state keeps every container whose chain key survives, as before: a fresh state is not a change of conditions, and an app that means one calls `invalidate()`.

## What surprised

- **A released container's fill could still record its answer.** The view's answer handler checked the document and the entry's `from`, both the same after an invalidation, so a fill in flight in a released box would have cleaned its entry with the old geometry's `to`, and taken the new fill's flight record with it. The handler now ignores a fill whose container is no longer the entry's. No earlier path released a container with a fill in flight: the window policy skips one that is filling.
- **The six words needed no neutral spelling.** Only the attribute was the engine's; `split`, `start`, `end`, `fragment`, `away` and `adjoin` are plain English, so the default keeps them and a partial registry `{ attribute }` is the whole of the BelType package's choice.
- **The demo's remount lost the history.** It made a new state from the old document and selection, and with it an empty history, so no edit made before a size change could be undone after it. `invalidate()` keeps the state, so undo reaches across a size change.

# Compositions as committed text: the results

Written 2026-10-27, on the branch `fix/composition-committed-text`, on Egildo's ruling: a composition is applied as the text it committed, and the textblock is not read back from the DOM, as Slate and Lexical do. Run it again with `npm run compose`, `npm run compose -- --boxes` and `npm run compose -- --generic`.

## What was built

At `compositionend` the view inserts `event.data` through its own `insertText`, the typed key's path, at the model's selection: the one held since `compositionstart`, since the selection is not read while the browser composes, mapped through any transaction since. So `handleTextInput` is asked, the model chooses the marks (stored marks, or the position's, which keep a non-inclusive mark out at both its edges), a selection is replaced, the caret goes after the text, and the composition is one history event. The fragment the browser composed in is drawn again from the model: by the insert's refill, or, when the insert did not touch it (a cancelled composition, with empty `data`; a `handleTextInput` that took the text and did something else), by a `dirtied` transaction. `readComposition` is gone: nothing else called it.

## The check

`scripts/compose.mjs` drives Chromium's input method over CDP (`Input.imeSetComposition` k, か, かn, かな, then `Input.insertText` 仮名) on both sides of the harness, each from a fresh state, and compares the `FragmentedView` with `EditorView` after the act, one Mod-z and Shift-Mod-z. The right side must also draw what a fresh fill of its document draws (the chain invalidated and refilled), after the act and after the undo; draw the composed text as often as its document holds it; stand its DOM caret at its head; and, under the generic schema, keep every mark instance and write no view attribute into the document.

| Run | The read-back | Committed text |
| :-- | :-- | :-- |
| One infinite box, 9 acts | 8 of 9: a composition refused by `handleTextInput` is inserted all the same | 9 of 9 |
| 320 × 480 boxes, 9 acts | 6 of 9: the same, and at a link's two edges the parse of a textblock cut across two boxes deletes the rest of it (`replace 557-696`) | 9 of 9 |
| The schema lab under structured marks, 5 acts | 0 of 5: the paragraph replaced to its end (`replace 531-649`), 15 of 26 instances kept, `data-txt-i` in the document, 仮名 at the end of a `mark` drawn and not held | 5 of 5 |

The acts are plain text; both edges of a link (non-inclusive) and of `strong` (inclusive); over a three-character selection (`replace 178-181`); refused by a `handleTextInput` returning true; cancelled (k, か, then an empty composition: no step); and recomposing the word before the caret through a replacement range, which Chromium selects before `compositionstart` (`compositionstart "composition"`, `replace 5-16`). Under the lab, plain text, both edges of a `mark`, and both edges of the link inside two spans, where the text keeps the spans and not the link (`span+span` on both sides). Without the `dirtied` transaction the refused composition stays drawn and is not held (`no, 1 of 0`), 8 of 9. Chromium itself takes a cancelled composition's text out of the DOM, so that act passes either way.

The studio, on its branch `round/the-plugin` with this package aliased to the branch's worktree, where a field is held by a mark that is never inclusive: 仮名 composed at both edges of the quiet press book's title and of `#beginnings`' term "gravida", and in the paragraph holding the term, lands outside the field in one `replace N-N` step, every one of the 8 fields keeps its value, it is drawn once and held once, no `data-txt-i` reaches the document, and one Mod-z restores the document. With the read-back, the same five: the guard refuses three (`refused: inside a field`, the text lost), and the other two replace the paragraph to its end (`replace 762-1614`) with `data-txt-i` in the document. Its typing session, 61 of 61.

## The regressions

`npm test` 61 of 61. `npm run parity` 18 of 19, the red row as ever, and its IME act equal; with `--boxes` 17 of 19, the same two rows as phase 3. `npm run chain`, `npm run acts` (8 of 8, every box equal to a fresh render, 7 of 7), `npm run lossless` and `npm run fragments` (13 of 13 markers, 0 elements differing) as before.

## What is not done

- **A composition over text with the selection collapsed.** Android's keyboards set a composing region over the word before the caret, without selecting it, and commit its correction. The view inserts the commit at the caret, so the word it meant to replace stays and the two are drawn side by side. Reasoned, not measured: no CDP command sets such a region, and no device was driven.
- **A composition spanning blocks**, and a transaction from elsewhere during a composition touching the text being composed, are untested. The second is applied at the mapped selection; the browser's in-progress text is replaced by the refill.
