/**
 * `prosemirror-fragview`: a fragmented view for ProseMirror. The exports are the view, the chain's plugin and its helpers, the basic fragmentainer and the default slice renderer; the seam's types live in `fragmentainer.js`.
 *
 * @packageDocumentation
 */

export { FragmentedView, SELECTION_HIGHLIGHT } from './fragmented-view.js';
export { fragmentsPlugin, fragmentsKey, refilled, appended, dirtied } from './fragments-plugin.js';
export { OverflowBox } from './overflow-box.js';
export { renderSlice, pointAt, posAt, openedAt, TRAILING_BREAK } from './slice-renderer.js';
