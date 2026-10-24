/**
 * The slice renderer's position map, checked in a real DOM: the page side of `slice-renderer.test.js`, which loads this module through vite and asserts on what `run` returns.
 *
 * @packageDocumentation
 */

import { doc, p, ul, ol, li, blockquote, pre, h1, strong, em, img, br } from 'prosemirror-test-builder';
import { Schema } from 'prosemirror-model';
import { renderSlice, pointAt, posAt } from '../src/slice-renderer.js';

// A list schema with HTML's ordinal attributes, and one with structured marks (the studio's shape: an instance and its parent on each mark).
const lists = new Schema({
  nodes: {
    doc: { content: 'block+' },
    p: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    ol: { group: 'block', content: 'li+', attrs: { start: { default: null }, reversed: { default: null } }, toDOM: (n) => ['ol', n.attrs, 0] },
    li: { content: 'p+', attrs: { value: { default: null } }, toDOM: (n) => ['li', n.attrs, 0] },
    text: {},
  },
});
const L = (attrs, ...items) => lists.nodes.ol.create(attrs, items.map(([text, value = null]) => lists.nodes.li.create({ value }, lists.nodes.p.create(null, lists.text(text)))));
const listDoc = lists.nodes.doc.create(null, [L({ reversed: '' }, ['a'], ['b', '7'], ['c'], ['d']), L({ start: '4' }, ['e'], ['f'], ['g']), L({ reversed: '' }, ['h'], ['i'], ['j'])]);
/** The position of the first character of `text` in `d`. */
const at = (d, text) => { let found = -1; d.descendants((n, pos) => { if (found < 0 && n.isText && n.text === text) found = pos; return found < 0; }); return found; };
const markSpec = (tag) => ({ structured: true, excludes: '', attrs: { instance: {}, parent: { default: null } }, toDOM: () => [tag, 0] });
const marked = new Schema({ nodes: { doc: { content: 'p+' }, p: { content: 'text*', toDOM: () => ['p', 0] }, text: {} }, marks: { em: markSpec('em'), strong: markSpec('strong') } });
const s1 = marked.marks.strong.create({ instance: 's1', parent: null }), e1 = marked.marks.em.create({ instance: 'e1', parent: 's1' }), em2 = marked.marks.em.create({ instance: 'e2', parent: null });
const markedDoc = marked.nodes.doc.create(null, [marked.nodes.p.create(null, [marked.text('ab', [s1, e1]), marked.text('cd', [s1]), marked.text('ef', [em2])])]);


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
    ['lists, from the third item of a reversed list with a value', listDoc, at(listDoc, 'c'), null],
    ['lists, from the third item of a list that starts at 4', listDoc, at(listDoc, 'g'), null],
    ['lists, from the second item of a reversed list', listDoc, at(listDoc, 'i'), null],
    ['lists, a reversed list cut before its third item', listDoc, 0, at(listDoc, 'c') - 2],
    ['structured marks, whole', markedDoc, 0, null],
    ['structured marks, from inside the inner run', markedDoc, 2, null],
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
    const outside = [pointAt(root, rendered.positions, rendered.from - 1), pointAt(root, rendered.positions, end + 1)];
    const html = root.innerHTML;
    root.remove();
    return { name, expected, actual, misses, outside, html };
  });
}
