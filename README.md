# prosemirror-fragview

A fragmented view for ProseMirror. `FragmentedView` holds an ordinary `EditorState`, speaks the same protocol to the same plugins as `prosemirror-view`'s `EditorView`, and renders the document into a chain of FRAGMENTAINERS: components that pull content from a position and give back the position where they had to stop. The basic fragmentainer, `OverflowBox`, reports the browser's own overflow. A paginator's page is a fragmentainer that reports the best cut under its own rules, with every paged-media feature behind it, and still, in the end, a position.

The design and its phases are in [docs/plan.md](docs/plan.md).

Phase 1 is built: the package, and the proof that a `FragmentedView` with one infinite `OverflowBox` behaves as an `EditorView` (18 of 19 parity acts equal on document, selection, undo and redo; the nineteenth shows `EditorView` reading a stale selection under keys pressed back to back). What was built, the parity table, the timings and what the view does not do yet are in [docs/results.md](docs/results.md); `npm test` and `npm run parity` run it again. Written with BelType's studio as the venue; the first paginator to implement the fragmentainer is BelType's Cicero.
