/**
 * `prosemirror-fragview`: a fragmented view for ProseMirror. The exports are the view, the chain's plugin and its helpers, the basic fragmentainer and the default slice renderer; the seam's types live in `fragmentainer.js`.
 *
 * @packageDocumentation
 */

export { FragmentedView, SELECTION_HIGHLIGHT } from './fragmented-view.js';
export { fragmentsPlugin, fragmentsKey, refilled, appended, dirtied } from './fragments-plugin.js';
export { OverflowBox } from './overflow-box.js';
export { renderSlice, pointAt, posAt, openedAt, addWord, TRAILING_BREAK, INSTANCE_STAMP, WORDS, AWAY, SPLIT, START, END, FRAGMENT, ADJOIN, AWAY_SHEET, CONTINUATION_SHEET } from './slice-renderer.js';
