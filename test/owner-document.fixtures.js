/**
 * The view in a document of its own: the page side of `owner-document.test.js`. The view is mounted in an iframe's body with boxes made in the frame's document, while the main document's node and range factories count every call; then it fills, builds placeholders, answers geometry, takes a line break, a paste and a copy.
 *
 * @packageDocumentation
 */

import { doc, p } from 'prosemirror-test-builder';
import { EditorState, TextSelection } from 'prosemirror-state';
import { FragmentedView, OverflowBox } from '../src/index.js';

const d = doc(...Array.from({ length: 40 }, (_, i) => p(`${i + 1}. A paragraph long enough to wrap over a few lines of a narrow box.`)));
const FACTORIES = ['createElement', 'createRange', 'createTreeWalker', 'createDocumentFragment', 'createTextNode'];

/** @param {FragmentedView} view */
function settled(view) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (view.filling.size === 0 && view.entries.every((e) => !e.dirty || !view.containers.has(e.key))) resolve(undefined);
      else if (performance.now() - started > 5000) reject(new Error('the chain did not settle'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

export async function run() {
  const frame = document.body.appendChild(document.createElement('iframe'));
  frame.style.cssText = 'width: 400px; height: 500px';
  const fdoc = /** @type {Document} */ (frame.contentDocument);
  fdoc.body.style.font = '16px/20px serif';
  /** @type {string[]} */
  const calls = [];
  const own = /** @type {any} */ (document);
  for (const name of FACTORIES) own[name] = function (/** @type {any[]} */ ...args) { calls.push(name); return Object.getPrototypeOf(document)[name].apply(this, args); };
  const results = {};
  try {
    const view = new FragmentedView(fdoc.body, { state: EditorState.create({ doc: d }), window: { build: 'near', margin: 0 }, containers: () => new OverflowBox({ width: 300, height: 200, document: fdoc }) });
    await settled(view);
    results.built = view.containers.size;
    results.placeholders = view.placeholders.size;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)));
    view.coordsAtPos(5);
    view.endOfTextblock('down');
    view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true }));
    const data = new DataTransfer();
    data.setData('text/plain', 'pasted');
    view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 9)));
    view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }));
    await settled(view);
    results.text = view.state.doc.firstChild?.textContent.slice(0, 16);
    results.foreign = [...view.dom.querySelectorAll('*')].filter((el) => el.ownerDocument !== fdoc).length;
    view.destroy();
  } finally {
    for (const name of FACTORIES) delete own[name];
    frame.remove();
  }
  results.calls = calls;
  return results;
}
