// usage: node scripts/acts.mjs [--headed] — phase 3's editing acts on the lab under 320 × 480 boxes, the generic schema with structured marks, with real mouse and keys (Playwright). The generic-schema round's four acts (the studio's scripts/generic-schema-edits.mjs): a word typed inside span > a > span, Bold across that nested inline (and off again), Enter at the end of an item three lists deep and a word typed in the new item, a word typed inside the pre's code; then Enter at the end of <li value="10">ten</li> and words typed in the new item after it; then a selection from one fragment into the next, deleted, and undone.
// Each act starts from the lab as parsed. After it, the state is written back by the studio's document serializer and compared with the expected document: the lab as parsed and written back, with the act's change applied as a string replacement written here by reasoning from the source. Prints the table and, for an act that differs, the difference.
import { open } from './browser.mjs';

const MOD = 'ControlOrMeta';
const session = await open('harness/?schema=generic&marks=structured&boxes=320x480', { headless: !process.argv.includes('--headed') });
const { page } = session;
const settled = () => page.waitForFunction(() => window.harness && window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
await settled();

/** The model position of the first character of `text`: in the `n`-th text node holding it, or, with `exact`, the `n`-th text node that is exactly it. */
const find = (text, { n = 0, exact = false } = {}) => page.evaluate(([text, n, exact]) => {
  let found = null, seen = 0;
  window.harness.generic.doc.descendants((node, pos) => {
    if (found != null) return false;
    if (!node.isText) return true;
    const at = exact ? (node.text === text ? 0 : -1) : node.text.indexOf(text);
    if (at >= 0 && seen++ === n) found = pos + at;
    return false;
  });
  return found;
}, [text, n, exact]);

/** Click at `pos` through the FragmentedView's own coordsAtPos, scrolled into view: just inside the character after it, or (bias −1) just inside the one before. */
async function clickAt(pos, { bias = 1, shift = false } = {}) {
  const c = await page.evaluate(([p, b]) => {
    const view = window.harness.right;
    const { node } = view.domAtPos(p);
    (node.nodeType === 1 ? node : node.parentElement).scrollIntoView({ block: 'center' });
    return view.coordsAtPos(p, b);
  }, [pos, bias]);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(bias >= 0 ? c.left + 1 : c.left - 1, (c.top + c.bottom) / 2);
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(60);
}
const state = () => page.evaluate(() => {
  const { right, generic } = window.harness;
  const { anchor, head } = right.state.selection;
  // Every built box shows the text of its entry's range, whitespace aside (the page draws no whitespace leaf).
  const squash = (t) => t.replace(/\s+/g, '');
  const shown = right.fragments.filter((e) => squash(e.container.content.textContent) === squash(right.state.doc.textBetween(e.from, e.to ?? right.state.doc.content.size))).length;
  return { html: generic.serialize(right.state.doc), anchor, head, shown, fragments: right.fragments.length, valid: (() => { try { right.state.doc.check(); return true; } catch (e) { return String(e); } })() };
});
const original = await page.evaluate(() => window.harness.generic.serialize(window.harness.generic.doc));

/** The expected document: the original with each `[old, new]` replaced, every `old` found exactly once. */
function expect(...pairs) {
  let html = original;
  for (const [a, b] of pairs) {
    const count = html.split(a).length - 1;
    if (count !== 1) throw new Error(`the expectation's anchor occurs ${count} times: ${a}`);
    html = html.replace(a, b);
  }
  return html;
}
/** The difference between two strings: the region between their common head and tail, with some context. */
function difference(a, b) {
  if (a === b) return null;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { expected: a.slice(Math.max(0, i - 40), a.length - j + 20), actual: b.slice(Math.max(0, i - 40), b.length - j + 20) };
}

const rows = [];
async function act(name, run, expected, note = () => '') {
  await page.evaluate(() => window.harness.reset());
  await settled();
  const info = await run();
  await settled();
  const now = await state();
  const diff = difference(expected, now.html);
  rows.push({ name, equal: !diff, diff, valid: now.valid, fragments: now.fragments, shown: now.shown, note: note(info, now) });
  return now;
}

// (1) A word typed inside span.tag > a.ref > span.inner, before "rasa".
await act('a word typed inside span > a > span', async () => {
  await clickAt((await find('tabula rasa')) + 7);
  await page.keyboard.type('NOVA');
}, expect(['<span class="inner" lang="la">tabula rasa</span>', '<span class="inner" lang="la">tabula NOVArasa</span>']));

// (2) Bold over "holds a link … and": one new instance, innermost on each run, written as three elements; then off again.
const nested = '<span class="tag" data-kind="outer" title="outer span"><a href="#tables" class="ref" data-n="1"><span class="inner" lang="la">';
await act('Bold across the nested inline', async () => {
  await clickAt(await find('holds a link'));
  await clickAt((await find('and after')) + 3, { bias: -1, shift: true });
  const selected = await page.evaluate(() => [window.harness.right.state.selection.anchor, window.harness.right.state.selection.head]);
  await page.keyboard.press(`${MOD}+b`);
  await settled();
  // The new instance on the page: every element written for it carries its stamp.
  const stamped = await page.evaluate(() => {
    let id = null;
    window.harness.right.state.doc.descendants((n) => { for (const m of n.marks) if (m.type.name === 'strong' && m.attrs.parent === '*') id = m.attrs.instance; });
    return { id, elements: document.querySelectorAll(`#right [data-txt-i="${id}"]`).length, tags: [...new Set([...document.querySelectorAll(`#right [data-txt-i="${id}"]`)].map((e) => e.localName))] };
  });
  return { selected, stamped };
}, expect([`A span holds a link that holds a span: ${nested}tabula rasa</span></a> and after</span>`, `A span <strong>holds a link that holds a span: </strong>${nested}<strong>tabula rasa</strong></span></a><strong> and</strong> after</span>`]), (info) => `selection ${info.selected.join(' → ')}; the new instance ${info.stamped.id} is ${info.stamped.elements} ${info.stamped.tags.join(', ')} elements on the page, each stamped`);
await (async () => {
  // Off again, from the bolded state: the same selection, Bold pressed twice.
  const name = 'Bold across the nested inline, then off again';
  await page.evaluate(() => window.harness.reset());
  await settled();
  await clickAt(await find('holds a link'));
  await clickAt((await find('and after')) + 3, { bias: -1, shift: true });
  await page.keyboard.press(`${MOD}+b`);
  await page.waitForTimeout(60);
  await page.keyboard.press(`${MOD}+b`);
  await settled();
  const now = await state();
  const diff = difference(original, now.html);
  rows.push({ name, equal: !diff, diff, valid: now.valid, fragments: now.fragments, shown: now.shown, note: '' });
})();

// (3) Enter at the end of an item three lists deep, then "fresh": a sibling item, the list's own whitespace after it.
await act('Enter at the end of an item three lists deep, then a word', async () => {
  await clickAt((await find('One point one point one')) + 23, { bias: -1 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('fresh');
}, expect(['<li>One point one point one</li>', '<li>One point one point one</li><li>fresh</li>']));

// (4) A word typed inside the pre's code, before "spaces": the code mark goes on, the spaces and the tab stay.
await act('a word typed inside the pre\'s code', async () => {
  await clickAt((await find('three spaces')) + 6);
  await page.keyboard.type('wide ');
}, expect(['/* three spaces */', '/* three wide spaces */']));

// (5) Enter at the end of <li value="10">ten</li>, then words in the new item: a sibling without the value, so it numbers 11.
await act('Enter at the end of <li value="10">ten</li>, then words in the new item', async () => {
  await clickAt((await find('ten', { exact: true })) + 3, { bias: -1 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('ten and a half');
}, expect(['<li value="10">ten</li><li>eleven</li>', '<li value="10">ten</li><li>ten and a half</li><li>eleven</li>']));

// (6) A selection from five characters before a cut inside a textblock of plain text to five after it, from one fragment into the next; deleted; undone. The expectation is the textblock's text with those ten characters taken out.
await page.evaluate(() => window.harness.reset());
await settled();
const cut = await page.evaluate(() => {
  const { right, generic } = window.harness;
  const doc = generic.doc;
  for (const [i, e] of right.fragments.entries()) {
    if (e.to == null) continue;
    const $to = doc.resolve(e.to);
    const block = $to.parent;
    if (!block.isTextblock || $to.parentOffset < 5 || block.content.size - $to.parentOffset < 5) continue;
    let plain = true;
    block.forEach((n) => { if (!n.isText || n.marks.length) plain = false; });
    if (!plain || /[&<>]/.test(block.textContent)) continue;
    return { box: i, to: e.to, text: block.textContent, kept: block.textContent.slice(0, $to.parentOffset - 5) + block.textContent.slice($to.parentOffset + 5), parent: block.type.name };
  }
  return null;
});
if (!cut) throw new Error('no cut inside plain text in a textblock');
const across = await act(`a selection from fragment ${cut.box} into fragment ${cut.box + 1} (${cut.to - 5} → ${cut.to + 5}, in a ${cut.parent}), deleted`, async () => {
  await clickAt(cut.to - 5);
  await clickAt(cut.to + 5, { shift: true });
  const drawn = await page.evaluate(() => {
    const { right } = window.harness;
    const highlight = CSS.highlights.get('fragview-selection');
    const ranges = highlight ? [...highlight] : [];
    return { anchor: right.state.selection.anchor, head: right.state.selection.head, boxes: ranges.map((r) => right.fragments.findIndex((e) => e.container.dom.contains(r.startContainer))) };
  });
  await page.keyboard.press('Backspace');
  return drawn;
}, expect([cut.text, cut.kept]), (info) => `the model's selection ${info.anchor} → ${info.head}, the highlight's ranges in boxes ${info.boxes.join(', ')}`);
await page.keyboard.press(`${MOD}+z`);
await settled();
const undone = await state();
const undoDiff = difference(original, undone.html);
rows.push({ name: '… and undone', equal: !undoDiff, diff: undoDiff, valid: undone.valid, fragments: undone.fragments, shown: undone.shown, note: `the chain ${await page.evaluate(() => window.harness.chain().map((e) => `${e.from}–${e.to ?? 'end'}`).join(', '))}` });

console.log('| Act | Equal to the expected document | Valid | Boxes showing their range | Notes |\n| :-- | :-- | :-- | :-- | :-- |');
for (const r of rows) console.log(`| ${r.name} | ${r.equal ? 'yes' : '**no**'} | ${r.valid === true ? 'yes' : r.valid} | ${r.shown} of ${r.fragments} | ${r.note} |`);
for (const r of rows) if (r.diff) console.log(`\n${r.name}:\n  expected: ${JSON.stringify(r.diff.expected)}\n  actual:   ${JSON.stringify(r.diff.actual)}`);
await session.close();
