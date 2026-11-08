/**
 * Node views: the page side of `faces.test.js`. The schema has a block leaf, `embed`, drawn from `toDOM` as an image at its `height`, an inline leaf, `chip`, and a `table` of rows of cells. A leaf's face is a box of the node's height holding an iframe and an input, and `fixture.log` counts what the view asks of it. A table's face is modelled on `prosemirror-spreads`' table view: one element over the whole table with no `contentDOM`, drawing the cells as `toDOM` does, holding an input that writes into the first cell through its own dispatch, and reading `getPos()` in its constructor.
 *
 * @packageDocumentation
 */

import { DOMSerializer, Schema } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';
import { EditorState, NodeSelection, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { FragmentedView, OverflowBox, AWAY_SHEET } from '../src/index.js';

document.head.appendChild(document.createElement('style')).textContent = AWAY_SHEET;

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const schema = new Schema({
  nodes: basic.spec.nodes.append({
    embed: { group: 'block', atom: true, selectable: true, attrs: { label: { default: 'a' }, height: { default: 60 } }, toDOM: (/** @type {any} */ n) => ['img', { class: 'drawn', src: GIF, style: `display: block; width: 200px; height: ${n.attrs.height}px` }] },
    chip: { group: 'inline', inline: true, atom: true, selectable: true, toDOM: () => ['img', { class: 'drawn-chip', src: GIF, style: 'width: 16px; height: 16px' }] },
    table: { group: 'block', content: 'row+', toDOM: () => ['table', { class: 'drawn-table', style: 'width: 100%; border-collapse: collapse; margin: 0' }, ['tbody', 0]] },
    row: { content: 'cell+', toDOM: () => ['tr', 0] },
    cell: { content: 'inline*', toDOM: () => ['td', { style: 'padding: 0; line-height: 20px' }, 0] },
  }),
  marks: basic.spec.marks,
});
const p = (/** @type {string} */ text) => schema.node('paragraph', null, text ? [schema.text(text)] : []);
const embed = (/** @type {any} */ attrs) => schema.node('embed', attrs);
const table = (/** @type {number} */ rows) => schema.node('table', null, Array.from({ length: rows }, (_, i) => schema.node('row', null, [schema.node('cell', null, [schema.text(`R${i + 1}a`)]), schema.node('cell', null, [schema.text(`R${i + 1}b`)])])));

/** @type {Record<string, () => any>} */
const DOCS = {
  one: () => schema.node('doc', null, [p('Before the leaf.'), embed(), p('After the leaf.')]),
  two: () => schema.node('doc', null, [p('Before.'), embed({ label: 'a' }), p('Between.'), embed({ label: 'b' }), p('After.')]),
  chip: () => schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Before '), schema.node('chip'), schema.text(' after.')])]),
  // Three paragraphs fill a box of 100 and the leaf opens the second.
  foot: () => schema.node('doc', null, [p('One.'), p('Two.'), p('Three.'), embed({ height: 40 }), p('Four.')]),
  long: () => schema.node('doc', null, Array.from({ length: 30 }, (_, i) => (i === 25 ? embed() : p(`Paragraph ${i}.`)))),
  // A table of three rows, 60 px, fits a box of 200; one of fifteen, 300 px, does not.
  table: () => schema.node('doc', null, [p('Before the table.'), table(3), p('After the table.')]),
  tall: () => schema.node('doc', null, [p('Before the table.'), table(15), p('After the table.')]),
  cut: () => schema.node('doc', null, [p('Before the table.'), table(3), ...Array.from({ length: 8 }, (_, i) => p(`After ${i}.`))]),
  tallLeaf: () => schema.node('doc', null, [p('Before the leaf.'), embed({ height: 300 }), p('After the leaf.')]),
};

/** The plugin that puts a node decoration on the first table, its `data-grid-state` from the plugin's state, set by a transaction's meta: `prosemirror-spreads`' way of forcing its table view's `update`. */
const gridKey = new PluginKey('grid');
const grid = () => new Plugin({
  key: gridKey,
  state: { init: () => 'a', apply: (tr, value) => tr.getMeta(gridKey) ?? value },
  props: {
    decorations(state) {
      let found = -1, size = 0;
      state.doc.descendants((node, pos) => { if (found < 0 && node.type.name === 'table') { found = pos; size = node.nodeSize; } return found < 0; });
      return found < 0 ? null : DecorationSet.create(state.doc, [Decoration.node(found, found + size, { 'data-grid-state': gridKey.getState(state) })]);
    },
  },
});

/**
 * A face over a whole table: the cells drawn as `toDOM` draws them, so its box is the stand-in's, and an input laid over them that writes into the first cell through the face's own dispatch.
 * @param {any[]} args
 * @param {any} options `height` to draw it taller than `toDOM`, `update` false to refuse every update.
 */
function tableFace(args, options) {
  let [node, view, getPos, decorations] = args;
  log.made++;
  log.positions.push(getPos());
  log.decorations.push(decorations.map((/** @type {any} */ d) => d.type.attrs['data-grid-state']));
  const serializer = DOMSerializer.fromSchema(schema);
  const dom = document.createElement('div');
  dom.className = 'face table-face';
  dom.dataset.made = String(log.made);
  dom.style.position = 'relative';
  if (options.height) dom.style.height = options.height + 'px';
  dom.appendChild(serializer.serializeNode(node));
  const input = document.createElement('input');
  input.className = 'face-input';
  input.style.cssText = 'position: absolute; top: 0; right: 0; width: 40px; height: 16px; box-sizing: border-box';
  // The end of the first cell's text: the table's position, the row's and the cell's opening tokens, the cell's content.
  input.addEventListener('input', (/** @type {any} */ e) => { if (e.data) view.dispatch(view.state.tr.insertText(e.data, getPos() + 3 + node.firstChild.firstChild.content.size)); });
  dom.appendChild(input);
  return {
    dom,
    update(/** @type {any} */ next, /** @type {any[]} */ decos) {
      log.updated.push({ text: next.textContent.slice(0, 6), grid: decos.map((d) => d.type.attrs['data-grid-state']) });
      if (options.update === false || next.type !== node.type) return false;
      node = next;
      /** @type {Element} */ (dom.firstElementChild).replaceWith(serializer.serializeNode(node));
      return true;
    },
    setSelection(/** @type {number} */ anchor, /** @type {number} */ head, /** @type {any} */ root) { log.selections.push([anchor, head, root === document]); },
    stopEvent: (/** @type {Event} */ e) => e.target === input,
    ignoreMutation: () => true,
    destroy: () => { log.destroyed++; },
  };
}

/**
 * A fragmentainer that shows a leaf whole in two fragments, as a page engine slices a block taller than its page as a painted shell: the first shows up to the end of the first `embed`, the second shows it again and the rest, and answers the leaf as shown outside its range.
 * @param {number} index
 */
function halves(index) {
  const box = new OverflowBox({ width: 300 });
  box.fill = async (doc, from, render) => {
    let leaf = -1;
    doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => { if (leaf < 0 && node.type.name === 'embed') leaf = pos; return leaf < 0; });
    if (index === 0) { box.show(render(doc, from, leaf + 1, document)); return { to: leaf + 1 }; }
    box.show(render(doc, leaf, null, document));
    return { to: null, shows: { from: leaf, to: leaf + 1 } };
  };
  return box;
}

/** @type {FragmentedView | null} */
let view = null;
const log = { made: 0, updated: /** @type {any[]} */ ([]), destroyed: 0, selected: 0, deselected: 0, fills: 0, warnings: /** @type {string[]} */ ([]), errors: /** @type {string[]} */ ([]), positions: /** @type {any[]} */ ([]), decorations: /** @type {any[]} */ ([]), selections: /** @type {any[]} */ ([]) };
const warn = console.warn;
console.warn = (...args) => { log.warnings.push(String(args[0])); warn(...args); };
addEventListener('error', (e) => { log.errors.push(e.message); e.preventDefault(); });

/**
 * A face for `node`, drawn at its height unless `size` says otherwise.
 * @param {any} node
 * @param {any} options
 * @param {any} args
 */
function face(node, options, args) {
  log.made++;
  const dom = document.createElement('div');
  dom.className = 'face';
  dom.dataset.made = String(log.made);
  dom.style.cssText = `width: 200px; height: ${options.height ?? node.attrs.height}px; overflow: hidden`;
  dom.innerHTML = '<input class="face-input" style="display: block; height: 20px; box-sizing: border-box"><iframe srcdoc="<p>hello</p>" style="height: 30px; border: 0"></iframe>';
  /** @type {any} */
  const nodeView = { dom, destroy: () => { log.destroyed++; } };
  if ('stop' in options) nodeView.stopEvent = () => options.stop;
  if ('ignores' in options) nodeView.ignoreMutation = () => options.ignores;
  if ('update' in options) nodeView.update = (/** @type {any} */ next) => { log.updated.push(next.attrs.label); return options.update; };
  window.fixture.args = args;
  return nodeView;
}

const settled = () => {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    let calm = 0;
    const tick = () => {
      if (!view) return resolve(undefined);
      calm = view.filling.size === 0 && !view.rippling && (view.windowPolicy.build === 'near' || !view.entries.some((e) => e.dirty)) ? calm + 1 : 0;
      if (calm > 3) return resolve(undefined);
      if (performance.now() - started > 5000) return reject(new Error('the chain did not settle'));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
};

window.fixture = {
  schema, log, p, embed, settled, args: null, DOCS, NodeSelection, TextSelection, gridKey,
  /**
   * @param {string} doc
   * @param {any} [options] `box` the box's height; `nodeViews` given whole, or `stop`, `ignores` and `update`, what the default face's hooks answer, and `height`, its size when it is not the node's; `table` for the table's face instead of the leaf's; `grid` for the plugin that decorates the table; `halves` for the fragmentainer that shows a leaf in two fragments; `inPlugin` to register through a plugin's props; `window` the window policy.
   */
  async fresh(doc, options = {}) {
    view?.destroy();
    Object.assign(log, { made: 0, updated: [], destroyed: 0, selected: 0, deselected: 0, fills: 0, warnings: [], errors: [], positions: [], decorations: [], selections: [] });
    const nodeViews = options.nodeViews ?? (options.table ? { table: (/** @type {any} */ ...args) => tableFace(args, options) } : { embed: (/** @type {any} */ ...args) => face(args[0], options, args) });
    const plugins = [...(options.inPlugin ? [new Plugin({ props: { nodeViews } })] : []), ...(options.grid ? [grid()] : [])];
    view = new FragmentedView(document.getElementById('host'), {
      state: EditorState.create({ doc: DOCS[doc](), plugins }),
      containers: options.halves ? (/** @type {number} */ index) => halves(index) : () => new OverflowBox({ width: 300, height: options.box ?? Infinity }),
      ...(options.inPlugin ? {} : { nodeViews }),
      ...(options.window ? { window: options.window } : {}),
    });
    window.view = view;
    await settled();
    return view.dom.querySelectorAll('.face').length;
  },
  /** Refuse or take the props, for the tests that expect the constructor to throw. @param {any} nodeViews @param {string} doc */
  construct(nodeViews, doc = 'one') {
    view?.destroy();
    view = null;
    try {
      new FragmentedView(document.createElement('div'), { state: EditorState.create({ doc: DOCS[doc]() }), containers: () => new OverflowBox({ width: 300 }), nodeViews }).destroy();
      return null;
    } catch (error) {
      return { name: /** @type {Error} */ (error).name, message: /** @type {Error} */ (error).message };
    }
  },
  /** A state reconfigured with a plugin whose node view is refused, as a host registering a plugin at runtime: the refusal, and whether the view's state and DOM stood. */
  refusedAtRuntime() {
    const v = /** @type {FragmentedView} */ (view);
    const before = { state: v.state, html: v.dom.innerHTML };
    const plugin = new Plugin({ props: { nodeViews: { text: () => ({ dom: document.createElement('div') }) } } });
    let refusal = null;
    try { v.updateState(v.state.reconfigure({ plugins: [...v.state.plugins, plugin] })); } catch (error) { refusal = /** @type {Error} */ (error).name; }
    return { refusal, sameState: v.state === before.state, sameDom: v.dom.innerHTML === before.html };
  },
  /** The position of the first node of `type`. @param {string} [type] */
  posOf(type = 'embed') {
    let found = -1;
    /** @type {any} */ (view).state.doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => { if (found < 0 && node.type.name === type) found = pos; });
    return found;
  },
  /** Which entry's container holds the element. @param {Element} el */
  entryOf(el) {
    return /** @type {any} */ (view).entries.findIndex((/** @type {any} */ e) => /** @type {any} */ (view).containers.get(e.key)?.dom.contains(el));
  },
};
