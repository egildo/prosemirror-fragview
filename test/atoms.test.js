import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, r;
before(async () => {
  session = await open('test/blank.html');
  r = await session.page.evaluate(async () => (await import('/test/atoms.fixtures.js')).run());
});
after(() => session?.close());

test('a leaf drawn with text is not editable', () => {
  assert.equal(r.editable, 'false');
});

test('nodeDOM of an inline atom after text, plain or marked, is its element', () => {
  assert.deepEqual(r.nodeDOM, ['a', 'b']);
});

test('a click on the text of an atom selects it', () => {
  assert.equal(r.clicked, `NodeSelection ${r.at}-${r.at + 1}`);
});

test('redraw at a position refills only the fragment that shows it, in the same container', () => {
  assert.equal(r.text, 'the Eternal City, which was not built in a day');
  assert.deepEqual(r.refilled, [r.holder]);
  assert.ok(r.kept);
});

test('nodeDOM of a node that opens at a cut inside another that opens there is its element', () => {
  assert.equal(r.nested.cut, r.nested.section + 2, 'the cut opens the section and its first paragraph');
  assert.equal(r.nested.section_dom, 'SECTION');
  assert.equal(r.nested.paragraph_dom, 'P');
  assert.equal(r.nested.paragraph_text, 'first');
  assert.ok(r.nested.section_in_second);
});
