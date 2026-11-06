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
- A clean clone installs and tests: the private studio is no longer a dev dependency. `BELTYPE_STUDIO` names its checkout for the harness's `schema=generic` mode.
- `LICENSE` carries the notice of `prosemirror-view`, for the code ported from it.

## 0.1.1 (2026-11-04)

No code change. The first version published by the workflow: a tag `v0.1.1` publishes by trusted publishing, with provenance.

## 0.1.0 (2026-11-04)

The first release to npm, published by hand.
