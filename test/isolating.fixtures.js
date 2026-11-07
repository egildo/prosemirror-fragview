/**
 * Backspace and Delete at the edge of a textblock: the page side of `isolating.test.js`. The schema has a `cell` node, `isolating: true`, holding paragraphs, as a table cell does. The keys are pressed by the browser, since a synthetic `beforeinput` carries no target range, so this module only builds views and reads them back; the test presses.
 *
 * @packageDocumentation
 */

import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { FragmentedView, OverflowBox } from '../src/index.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'cell+' },
    cell: { content: 'paragraph+', isolating: true, toDOM: () => ['div', { class: 'cell' }, 0] },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {},
  },
});

/** @param {FragmentedView} view */
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

export function setup() {
  document.body.style.font = '16px/20px serif';
  /** @type {FragmentedView | undefined} */
  let view;
  return {
    /**
     * A fresh view on cells of paragraphs, with or without `baseKeymap`.
     * @param {string[][]} cells
     * @param {boolean} commands
     */
    async make(cells, commands) {
      view?.destroy();
      const doc = schema.node('doc', null, cells.map((paras) => schema.node('cell', null, paras.map((t) => schema.node('paragraph', null, schema.text(t))))));
      view = new FragmentedView(document.body, { state: EditorState.create({ doc, plugins: commands ? [keymap(baseKeymap)] : [] }), containers: () => new OverflowBox() });
      await settled(view);
    },
    /**
     * Where to click for the caret at the start (`bias` 1) or the end (`bias` -1) of the first occurrence of `text`.
     * @param {string} text
     * @param {number} bias
     */
    point(text, bias) {
      const v = /** @type {FragmentedView} */ (view);
      let at = -1;
      v.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text?.includes(text)) at = pos + /** @type {string} */ (n.text).indexOf(text); });
      const pos = bias > 0 ? at : at + text.length;
      const c = v.coordsAtPos(pos, bias);
      return { x: bias > 0 ? c.left + 1 : c.left - 1, y: (c.top + c.bottom) / 2, pos, head: v.state.selection.head };
    },
    /** Each cell's text, and each cell's paragraph count. */
    read() {
      const doc = /** @type {FragmentedView} */ (view).state.doc;
      const cells = [], paragraphs = [];
      doc.forEach((cell) => { cells.push(cell.textContent); paragraphs.push(cell.childCount); });
      return { cells, paragraphs, head: /** @type {FragmentedView} */ (view).state.selection.head };
    },
  };
}
