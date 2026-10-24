/**
 * The harness's generic-schema mode, `?schema=generic&marks=structured|nodes` (phase 3): the studio's generic schema, imported from the linked dev dependency, and its lab document, copied into `fixtures/schema-lab/`.
 *
 * @remarks
 * The lab is laid out in an iframe under its own sheets, off screen, because structured marks read the source's computed style to decide which inline element can be a mark (the studio's `boxReason`): the parse takes the iframe's body as the laid-out source. The same sheets are returned for the harness page to adopt, so the fragments are set as the lab is. `marks=nodes` is the schema with every inline element a node (`buildSchema({ marks: false })`); `structured`, the default, is the studio's structured marks.
 *
 * @packageDocumentation
 */

import * as g from 'beltype-studio-experiment/src/schema-generic.js';
import typeCss from './fixtures/schema-lab/styles/type.css?raw';
import pageCss from './fixtures/schema-lab/styles/page.css?raw';

/**
 * Load the lab and build the schema.
 * @param {'structured' | 'nodes'} marks
 */
export async function setup(marks) {
  const schema = marks === 'nodes' ? g.buildSchema({ marks: false }) : g.structuredSchema;
  const serializer = marks === 'nodes' ? g.serializers(schema).doc : g.structuredDocumentSerializer;
  const frame = document.createElement('iframe');
  frame.src = new URL('./fixtures/schema-lab/index.html', import.meta.url).href;
  Object.assign(frame.style, { position: 'absolute', left: '-10000px', top: '0', width: '600px', height: '800px', border: '0' });
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  document.body.appendChild(frame);
  await loaded;
  const source = /** @type {Document} */ (frame.contentDocument).body;
  /**
   * Parse the lab's body into the schema. With `tag`, every source element first carries `data-src`, its index in document order from 1, so an element a fragment shows can be traced to the file; the attribute rides in the attribute maps.
   * @param {boolean} [tag]
   */
  function parse(tag = false) {
    let body = source;
    if (tag) {
      body = /** @type {HTMLElement} */ (source.cloneNode(true));
      [...body.querySelectorAll('*')].forEach((el, i) => el.setAttribute('data-src', String(i + 1)));
    }
    return g.parseBody(schema, body, {}, { layout: source });
  }
  /** The saved document's HTML for a doc: the studio's document serializer. @param {import('prosemirror-model').Node} doc */
  const serialize = (doc) => {
    const body = document.createElement('body');
    body.append(serializer.serializeFragment(doc.content));
    return body.innerHTML;
  };
  return { g, schema, serializer, serialize, source, parse, doc: parse(), css: `${typeCss}\n${pageCss}` };
}
