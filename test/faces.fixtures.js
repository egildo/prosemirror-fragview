/**
 * Leaf node views: the page side of `faces.test.js`. The schema has a block leaf, `embed`, drawn from `toDOM` as an image at its `height`, and an inline leaf, `chip`. A face is a box of the node's height holding an iframe and an input, and `fixture.log` counts what the view asks of it.
 *
 * @packageDocumentation
 */

import { Schema } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';
import { EditorState, NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import { FragmentedView, OverflowBox, AWAY_SHEET } from '../src/index.js';

document.head.appendChild(document.createElement('style')).textContent = AWAY_SHEET;

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const schema = new Schema({
  nodes: basic.spec.nodes.append({
    embed: { group: 'block', atom: true, selectable: true, attrs: { label: { default: 'a' }, height: { default: 60 } }, toDOM: (/** @type {any} */ n) => ['img', { class: 'drawn', src: GIF, style: `display: block; width: 200px; height: ${n.attrs.height}px` }] },
    chip: { group: 'inline', inline: true, atom: true, selectable: true, toDOM: () => ['img', { class: 'drawn-chip', src: GIF, style: 'width: 16px; height: 16px' }] },
  }),
  marks: basic.spec.marks,
});
const p = (/** @type {string} */ text) => schema.node('paragraph', null, text ? [schema.text(text)] : []);
const embed = (/** @type {any} */ attrs) => schema.node('embed', attrs);

/** @type {Record<string, () => any>} */
const DOCS = {
  one: () => schema.node('doc', null, [p('Before the leaf.'), embed(), p('After the leaf.')]),
  two: () => schema.node('doc', null, [p('Before.'), embed({ label: 'a' }), p('Between.'), embed({ label: 'b' }), p('After.')]),
  chip: () => schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Before '), schema.node('chip'), schema.text(' after.')])]),
  // Three paragraphs fill a box of 100 and the leaf opens the second.
  foot: () => schema.node('doc', null, [p('One.'), p('Two.'), p('Three.'), embed({ height: 40 }), p('Four.')]),
  long: () => schema.node('doc', null, Array.from({ length: 30 }, (_, i) => (i === 25 ? embed() : p(`Paragraph ${i}.`)))),
};

/** @type {FragmentedView | null} */
let view = null;
const log = { made: 0, updated: /** @type {any[]} */ ([]), destroyed: 0, selected: 0, deselected: 0, fills: 0, warnings: /** @type {string[]} */ ([]), errors: /** @type {string[]} */ ([]) };
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
  schema, log, p, embed, settled, args: null, DOCS, NodeSelection, TextSelection,
  /**
   * @param {string} doc
   * @param {any} [options] `box` the box's height; `nodeViews` given whole, or `stop`, `ignores` and `update`, what the default face's hooks answer, and `height`, its size when it is not the node's; `inPlugin` to register through a plugin's props; `window` the window policy.
   */
  async fresh(doc, options = {}) {
    view?.destroy();
    Object.assign(log, { made: 0, updated: [], destroyed: 0, selected: 0, deselected: 0, fills: 0, warnings: [], errors: [] });
    const nodeViews = options.nodeViews ?? { embed: (/** @type {any} */ ...args) => face(args[0], options, args) };
    const plugins = options.inPlugin ? [new Plugin({ props: { nodeViews } })] : [];
    view = new FragmentedView(document.getElementById('host'), {
      state: EditorState.create({ doc: DOCS[doc](), plugins }),
      containers: () => new OverflowBox({ width: 300, height: options.box ?? Infinity }),
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
    const plugin = new Plugin({ props: { nodeViews: { paragraph: () => ({ dom: document.createElement('div') }) } } });
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
