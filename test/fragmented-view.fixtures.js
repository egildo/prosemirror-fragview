/**
 * The view's invalidation in a real layout: the page side of `fragmented-view.test.js`. A chain of boxes is built at one size, the size changes, and the view is told, once through `invalidate()` and once through `setProps` with a new factory; each time the chain is compared with a fresh view at the new size.
 *
 * @packageDocumentation
 */

import { doc, p } from 'prosemirror-test-builder';
import { EditorState } from 'prosemirror-state';
import { FragmentedView, OverflowBox, AWAY_SHEET, CONTINUATION_SHEET } from '../src/index.js';

const words = 'A change of conditions dirties every entry and every container of the chain '.repeat(4).trim();
const d = doc(...Array.from({ length: 12 }, (_, i) => p(`${i + 1}. ${words}`)));

/**
 * Resolve when no entry is dirty and no fill is in flight.
 * @param {FragmentedView} view
 */
function settled(view) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (view.filling.size === 0 && view.entries.every((e) => !e.dirty)) resolve(undefined);
      else if (performance.now() - started > 5000) reject(new Error('the chain did not settle'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

/** @param {FragmentedView} view */
const cuts = (view) => view.entries.map((e) => [e.from, e.to]);

/** Every entry's box: its size, and whether the factory made it after `old` was taken. @param {FragmentedView} view @param {Set<unknown>} old */
const boxes = (view, old) => view.fragments.map((f) => {
  const r = f.container?.dom.getBoundingClientRect();
  return { size: r ? [r.width, r.height] : null, fresh: !old.has(f.container) };
});

/** The cuts of a fresh view on `state` under boxes of `size`. @param {EditorState} state @param {number[]} size */
async function freshCuts(state, size) {
  const view = new FragmentedView(document.body, { state, containers: () => new OverflowBox({ width: size[0], height: size[1] }) });
  await settled(view);
  const out = cuts(view);
  view.destroy();
  return out;
}

export async function run() {
  document.body.style.font = '16px/20px serif';
  document.adoptedStyleSheets = [AWAY_SHEET, CONTINUATION_SHEET].map((text) => { const sheet = new CSSStyleSheet(); sheet.replaceSync(text); return sheet; });
  const results = {};
  let size = [300, 200];
  const view = new FragmentedView(document.body, { state: EditorState.create({ doc: d }), containers: () => new OverflowBox({ width: size[0], height: size[1] }) });
  await settled(view);
  results.before = cuts(view);

  // The door: the factory now makes boxes of another size, and the view is told.
  let old = new Set(view.fragments.map((f) => f.container));
  size = [400, 300];
  view.invalidate();
  await settled(view);
  results.invalidated = { cuts: cuts(view), boxes: boxes(view, old), fresh: await freshCuts(view.state, size), placeholders: view.placeholders.size };

  // Typing still works: a transaction refills the first box, which shows it.
  view.dispatch(view.state.tr.insertText('typed ', 1));
  await settled(view);
  results.typed = view.fragments[0].container?.dom.textContent.slice(0, 12);

  // A new factory through setProps invalidates too.
  old = new Set(view.fragments.map((f) => f.container));
  view.setProps({ containers: () => new OverflowBox({ width: 250, height: 150 }) });
  await settled(view);
  results.setProps = { cuts: cuts(view), boxes: boxes(view, old), fresh: await freshCuts(view.state, [250, 150]) };

  view.destroy();
  return results;
}
