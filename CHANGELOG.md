# Changelog

## Unreleased

Fixes from the assessment of 2026-11-07.

- A plugin's DOM events, clicks and paste transforms reach it. The view listens to every event a `handleDOMEvents` names, in the direct props or in any plugin's, a plugin added after construction or a prop given to `setProps` included; `focus` runs its handler and `blur` has a listener. It used to listen only to the events it answers itself. A click asks `handleClickOn` and `handleClick` at the release, a double or triple click asks `handleDoubleClickOn` and `handleDoubleClick`, or the triple forms, at the press, as in `prosemirror-view`. A paste applies `transformPastedHTML`, `transformPastedText` and `transformPasted`, and a clipboard holding only a file (a pasted image) reaches `handlePaste` with an empty slice, where it used to be swallowed.
- A later page renumbers after an edit an earlier page absorbs. An item inserted or removed before a cut in a list left the next page's `value` and away siblings as they were, so its numbers and its `:nth-child` and `+` selectors read stale on screen while print was right. A step that inserts or removes a child of one of an entry's divided ancestors before the one it opens in now dirties the entry. The document's own children are left out, since counting them would refill every later page on every new paragraph.
- A refused node view arriving with a new state throws before the view takes the state. A host that registers such a plugin at runtime (Tiptap's `registerPlugin`) used to leave the view holding a state its DOM never drew. `setProps` with a refused `nodeViews` keeps the old props the same way.
- A selection read back from a page not yet refilled, or an input's target range there, no longer resolves a position past the document's end: it is passed over, as `posAtCoords` and `leafAround` already passed it.
- The view answers `root`, `_root`, `props`, `isDestroyed` and `dragging` as `EditorView` does, so a plugin that reads them at construction (`prosemirror-tables`) no longer throws. `root` is the document or shadow root the view lives in, and `hasFocus()` and the selection's stand-down ask it, so a view inside a shadow root sees its focus. `dragging` is always null. `root` does not patch `getSelection` onto a shadow root's prototype as `prosemirror-view` does.

A clean checkout passes its tests. Vite's dependency optimizer is off for the harness and the suites, since every dependency here is an ES module; with it on, parallel suite files fought over one cache and 57 to 61 of 157 tests failed on the first run. `FRAGVIEW_VITE_CACHE` goes with it.

The harness stands on its own.

- The generic schema the harness and the phase 3 scripts parse with is now `harness/schema-generic.js`, copied from the old studio. `BELTYPE_STUDIO` is gone, so a clean clone runs every script. The file is exported as `prosemirror-fragview/schema-generic` for `prosemirror-beltype`'s measurement. It is no part of the view's API.

Leaf node views, by the ruling of 2026-11-07.

- A `nodeViews` prop in `prosemirror-view`'s shape, for leaf node types only. The host's element is shown once, in the page that holds the node, and keeps its state across refills and across a move to another page, by `moveBefore`. `update`, `destroy`, `selectNode`, `deselectNode`, `stopEvent`, `ignoreMutation` and `getPos` hold their meanings.
- A node view for a block or for text throws a `RangeError` at the prop. A plugin that registers one for a block, as `prosemirror-tables`' `columnResizing` does for `table`, now gets that refusal, where its view used to be ignored. A `markViews` prop warns once.
- A leaf with a node view is drawn in every copy as a stand-in: a wrapper around `toDOM`'s element, `display: block` or `display: inline`, marked `data-fragview-face`. `toDOM` stays what prints. `nodeDOM` answers the wrapper. A selector on the leaf's siblings sees the wrapper in the leaf's place.
- `sliceRenderer(words, faces)` takes a second, optional argument, and `FACE_STAMP` is exported.

A delete at a block's edge.

- A caret at the edge of its textblock no longer deletes across the boundary. Backspace at the start of an `isolating` node (a table cell) poured it into the one before: the view applied the browser's target range, and `tr.delete` joins across any boundary. Now, as `prosemirror-view`'s `stopNativeHorizontalDelete` has it, Backspace and Delete at a textblock's edge are the commands' alone (`joinBackward`, `joinForward`), which honour `isolating`; without them nothing joins.

Fixes from the integration review of 2026-11-04.

- A `ReplaceAroundStep` (`setNodeMarkup`, a wrap, a lift) now dirties every fragment it covers. It used to dirty only the fragments holding its two tokens, so the middle of a list or section of three or more pages kept its old markup.
- A key on a view that is not editable no longer reaches the keymaps, as in `prosemirror-view`.
- A `dirtied` or `redraw` that arrives while the fragment is filling is no longer lost. The fragment is filled again after the fill in flight. Entries carry a new `asked` count.
- A fill may answer `reach`, the last position its decision read, and a change up to there dirties the fragment. Without it the first word after the cut stands for it, as before.
- A text node changed, added or removed under a fragment outside a composition now dirties that fragment, which is drawn again from the model. Three such redraws per entry and per document, then one warning.
- The root carries `translate="no"` and the opt-out attributes of Grammarly and LanguageTool. A host removes one from `view.dom` to allow that writer.
- A `compositionend` taken by a handler still redraws its fragment from the model.
- A refill that keeps its `to` but changes its hint now fills the next fragment, which was cut under the old hint. Hints are compared by their JSON.
- A clean clone installs and tests: the private studio is no longer a dev dependency. `BELTYPE_STUDIO` names its checkout for the harness's `schema=generic` mode.
- `LICENSE` carries the notice of `prosemirror-view`, for the code ported from it.
- `hasFocus()` answers whether the root itself has focus, as in `prosemirror-view`. `hasFocus()` used to be true for anything focused inside the root. The view has its own test, `ownsSelection()`: it neither reads nor writes the browser's selection while focus is on a form control or inside a leaf's drawing, so such an element keeps its focus. A focusable element that holds the document's text (a mark or a block with a `tabindex`) is still the view's, and a click in it moves the selection.
- An event from a form control (`input`, `textarea`, `select`, `button`, or anything inside one) or from an editing host nested in a leaf's drawing belongs to that element: neither `handleDOMEvents` nor the view's handlers see it. Any other element with input of its own stops propagation at its own root. A plain `toDOM` `<input>` can now be typed in. It used to lose every key, and Backspace ran the keymaps against the document.
- A click or a drag that the view answers brings the focus back to the root from anything focusable the press landed on (a link, a `tabindex`), and the root taking focus back from such a control or leaf draws the model's selection, as a `focus` handler does in `prosemirror-view`. The old `hasFocus()` did the first by accident.
- A text node changed inside a leaf's own drawing is no longer a foreign write, so a custom element in a leaf can render text without refilling its page. Foreign writes to the document's text are caught as before, in a fragment not yet refilled too: the walk and `posAtCoords` no longer throw on a position past the document's end.
- `view.docView` is truthy until `destroy()` and null after, for `y-prosemirror`'s cursor plugin, which reads it to ask whether the view is alive.

## 0.1.1 (2026-11-04)

No code change. The first version published by the workflow: a tag `v0.1.1` publishes by trusted publishing, with provenance.

## 0.1.0 (2026-11-04)

The first release to npm, published by hand.
