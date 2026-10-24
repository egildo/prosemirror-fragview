/**
 * `prosemirror-fragview`: a fragmented view for ProseMirror. The exports are the view, the chain's plugin and its helpers, the basic fragmentainer, the slice renderer for a words registry and for the default one; the seam's types live in `fragmentainer.js`.
 *
 * @packageDocumentation
 */

export { FragmentedView, SELECTION_HIGHLIGHT } from './fragmented-view.js';
export { fragmentsPlugin, fragmentsKey, refilled, appended, dirtied } from './fragments-plugin.js';
export { OverflowBox } from './overflow-box.js';
export { renderSlice, sliceRenderer, pointAt, posAt, openedAt, addWord, TRAILING_BREAK, INSTANCE_STAMP, DEFAULT_WORDS, awaySheet, continuationSheet, AWAY_SHEET, CONTINUATION_SHEET } from './slice-renderer.js';
