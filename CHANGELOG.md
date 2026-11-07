# Changelog

## Unreleased

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
