/**
 * The slice renderer's position map, checked in a real DOM: the page side of `slice-renderer.test.js`, which loads this module through vite and asserts on what `run` returns.
 *
 * @packageDocumentation
 */

import { doc, p, ul, ol, li, blockquote, pre, h1, strong, em, img, br } from 'prosemirror-test-builder';
import { renderSlice, pointAt, posAt } from '../src/slice-renderer.js';

const docs = {
  marks: doc(h1('Title'), p('one ', strong('two ', em('three')), ' four'), p(), p('after', br(), 'break')),
  nested: doc(
    ul(li(p('alpha'), ul(li(p('beta'), ul(li(p('gamma <a>delta'), p('epsilon'))))))),
    blockquote(p('quoted'), p('<b>twice')),
    pre('let x = 1;'),
    p('an image ', img(), ' inline'),
    ol(li(p('one')), li(p('two'))),
  ),
};

/**
 * Render each case and report, per case: the DOM text nodes' recorded starts against the model's, and every position in the slice whose trip through `pointAt` and `posAt` does not come back.
 */
export function run() {
  const cases = [
    ['marks, whole', docs.marks, 0, null],
    ['nested, whole', docs.nested, 0, null],
    ['nested, from inside the third-level item', docs.nested, docs.nested.tag.a, null],
    ['nested, from inside the third-level item to inside the quote', docs.nested, docs.nested.tag.a, docs.nested.tag.b],
  ];
  return cases.map(([name, d, from, to]) => {
    const rendered = renderSlice(d, from, to);
    const root = document.body.appendChild(document.createElement('div'));
    root.appendChild(rendered.fragment);
    const end = to ?? d.content.size;
    const expected = [];
    d.nodesBetween(from, end, (node, pos) => {
      if (node.isText) {
        const start = Math.max(pos, from), stop = Math.min(pos + node.nodeSize, end);
        if (stop > start) expected.push([start, node.text.slice(start - pos, stop - pos)]);
      }
    });
    const actual = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) actual.push([rendered.positions.get(t)?.start ?? null, t.data]);
    const misses = [];
    for (let pos = from; pos <= end; pos++) {
      const point = pointAt(root, rendered.positions, pos);
      const back = point && posAt(root, rendered.positions, point.node, point.offset);
      if (back !== pos) misses.push({ pos, back, node: point?.node.nodeName, offset: point?.offset });
    }
    const outside = [pointAt(root, rendered.positions, from - 1), pointAt(root, rendered.positions, end + 1)];
    const html = root.innerHTML;
    root.remove();
    return { name, expected, actual, misses, outside, html };
  });
}
