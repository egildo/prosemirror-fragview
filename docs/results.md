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
