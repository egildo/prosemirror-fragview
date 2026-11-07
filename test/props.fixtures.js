/**
 * The props and DOM events a plugin reaches the view through: the page side of `props.test.js`. A view logs every `handleDOMEvents` handler, click handler, paste handler and paste transform it is asked, from its direct props and from its plugins, a plugin added after construction included.
 *
 * @packageDocumentation
 */

import { doc, p, schema } from 'prosemirror-test-builder';
import { EditorState, Plugin } from 'prosemirror-state';
import { FragmentedView, OverflowBox } from '../src/index.js';

/** @type {any[]} */
let log = [];
/** @type {FragmentedView | null} */
let view = null;

const logged = (/** @type {string} */ name) => (/** @type {FragmentedView} */ _view, /** @type {Event} */ event) => { log.push([name, event.type]); return false; };
const on = (/** @type {string} */ name) => (/** @type {any} */ _view, /** @type {number} */ pos, /** @type {any} */ node, /** @type {number} */ nodePos, /** @type {any} */ _event, /** @type {boolean} */ direct) => { log.push([name, node.type.name, nodePos, direct]); return false; };
const at = (/** @type {string} */ name) => (/** @type {any} */ _view, /** @type {number} */ pos) => { log.push([name, typeof pos]); return false; };

const plugin = new Plugin({
  props: {
    handleDOMEvents: { 'x-ping': logged('plugin'), focus: logged('plugin'), blur: logged('plugin') },
    handleClickOn: on('handleClickOn'), handleClick: at('handleClick'),
    handleDoubleClickOn: on('handleDoubleClickOn'), handleDoubleClick: at('handleDoubleClick'),
    handleTripleClickOn: on('handleTripleClickOn'), handleTripleClick: at('handleTripleClick'),
    handlePaste: (_view, _event, slice) => { log.push(['handlePaste', slice.size]); return false; },
    transformPastedText: (text) => text.toUpperCase(),
    transformPastedHTML: (html) => html.replace('lower', 'upper'),
    transformPasted: (slice) => { log.push(['transformPasted', slice.size]); return slice; },
  },
});

export function fresh() {
  view?.destroy();
  log = [];
  document.body.style.font = '16px/20px serif';
  view = new FragmentedView(document.body, {
    state: EditorState.create({ doc: doc(p('First paragraph of words.'), p('Second paragraph.')), plugins: [plugin] }),
    containers: () => new OverflowBox({ width: 400, height: 300 }),
    handleDOMEvents: { 'x-direct': logged('direct') },
  });
  view.dom.id = 'view';
}

/** A plugin added after construction, and a direct prop set after it, each with an event of its own. */
export function later() {
  const added = new Plugin({ props: { handleDOMEvents: { 'x-later': logged('later') } } });
  /** @type {FragmentedView} */ (view).updateState(/** @type {FragmentedView} */ (view).state.reconfigure({ plugins: [...(/** @type {FragmentedView} */ (view).state.plugins), added] }));
  /** @type {FragmentedView} */ (view).setProps({ handleDOMEvents: { 'x-set': logged('set') } });
}

/** @param {string} type */
export function fire(type) {
  /** @type {FragmentedView} */ (view).dom.dispatchEvent(new Event(type));
}

export function focusAndBlur() {
  /** @type {FragmentedView} */ (view).focus();
  /** @type {FragmentedView} */ (view).dom.blur();
}

/**
 * Paste a clipboard holding only what `fill` puts in it; the event's prevention and the first paragraph's text after it.
 * @param {(data: DataTransfer) => void} fill
 */
function paste(fill) {
  const v = /** @type {FragmentedView} */ (view);
  v.focus();
  const data = new DataTransfer();
  fill(data);
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
  v.dom.dispatchEvent(event);
  return { prevented: event.defaultPrevented, text: v.state.doc.textContent };
}

export const pasteFile = () => paste((data) => data.items.add(new File(['x'], 'image.png', { type: 'image/png' })));
export const pasteText = () => paste((data) => data.setData('text/plain', 'lower'));
export const pasteHTML = () => paste((data) => data.setData('text/html', '<p>lower</p>'));

export const read = () => log;

Object.assign(window, { fixture: { fresh, later, fire, focusAndBlur, pasteFile, pasteText, pasteHTML, read } });
void schema;
