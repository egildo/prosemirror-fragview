// usage: node scripts/atoms.mjs [--headed] [--boxes] — the arrows and the click around an atom, on both sides of the harness. The document is two short paragraphs, a horizontal rule (a block atom the browser can put no caret in), two more short paragraphs and a paragraph with an inline image; `--boxes` puts the right side under 320 × 110 boxes, so that the rule and the image stand at cuts of the chain. Each act performs the same keys or click on the EditorView (left) and the FragmentedView (right) from a fresh state and compares the selection after every step, its kind and its range: ArrowRight from the end of the paragraph before the rule through to the paragraph after it, ArrowLeft back, ArrowDown and ArrowUp through the same, a click on the rule (which selects it, as `prosemirror-view` does for a selectable atom), the same arrows around the inline image and Shift+ArrowRight over it, and Backspace and Delete beside the rule. Shift+ArrowRight over the rule itself is left out: the browser's extension over a block atom is not the library's, and EditorView's own result is a collapsed range (measured: 17-17 then 20-20). Three more acts use a document with a facsimile (an `<object>` holding a canvas, as the studio draws one) alone in a blockquote between two others: the arrows across it equal EditorView's, and, for what Chromium does to the studio's facsimile and the harness's cannot be made to (it clears a selection drawn around the object when its page draws the canvas, leaving a caret at the start of the editing host), an act in which the step plays the browser: the node selection must stand and the arrows leave it, which the FragmentedView alone is asked, since EditorView reads a dropped selection too. Exits 1 when a step differs.
import { open } from './browser.mjs';

const boxes = process.argv.includes('--boxes');
const session = await open(boxes ? 'harness/?boxes=320x110' : 'harness/', { headless: !process.argv.includes('--headed') });
const { page } = session;
await page.waitForFunction(() => window.harness && document.getElementById('toolbar').textContent.includes('equal'), null, { timeout: 60000 });
const settled = () => page.waitForFunction(() => window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
const settle = () => page.waitForTimeout(90);
const SIDES = ['left', 'right'];
const MOD = 'ControlOrMeta';

const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const IMG = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2720%27 height=%2712%27%3E%3Crect width=%2720%27 height=%2712%27 fill=%27%23999%27/%3E%3C/svg%3E';
/** The documents of the acts: `flat`, paragraphs with a rule among them and a paragraph with an inline image; `wrapped`, a rule between two blockquotes (top-level wrappers, as a studio's sections are). */
const docs = {
  flat: [para('one one'), para('two two'), { type: 'horizontal_rule' }, para('three three'), para('four four'), { type: 'paragraph', content: [{ type: 'text', text: 'five ' }, { type: 'image', attrs: { src: IMG } }, { type: 'text', text: ' six' }] }],
  wrapped: [{ type: 'blockquote', content: [para('one one'), para('two two')] }, { type: 'horizontal_rule' }, { type: 'blockquote', content: [para('three three'), para('four four')] }],
  facsimile: [{ type: 'blockquote', content: [para('one one'), para('two two')] }, { type: 'blockquote', content: [{ type: 'facsimile' }] }, { type: 'blockquote', content: [para('three three'), para('four four')] }],
};
let docName = 'flat';
const mount = async () => {
  await page.evaluate(([content]) => window.harness.mount(window.harness.right.state.schema.nodeFromJSON({ type: 'doc', content })), [docs[docName]]);
  await settled();
  await settle();
};
/** The model position where the first occurrence of `text` ends. */
const endOf = (text) => page.evaluate((t) => { let found = null; window.harness.right.state.doc.descendants((n, pos) => { if (found == null && n.isText && n.text.includes(t)) found = pos + n.text.indexOf(t) + t.length; }); return found; }, text);
const state = (side) => page.evaluate((sd) => { const s = window.harness.view(sd).state.selection; return `${s.constructor.name} ${s.anchor}-${s.head}`; }, side);
/** Click at `pos` on a side, just before the character after it, or at the end of its line. */
async function clickAt(side, pos, bias = -1) {
  const c = await page.evaluate(([sd, p, b]) => { const v = window.harness.view(sd); const { node } = v.domAtPos(p); (node.nodeType === 1 ? node : node.parentElement).scrollIntoView({ block: 'center' }); return v.coordsAtPos(p, b); }, [side, pos, bias]);
  await page.mouse.click(bias >= 0 ? c.left + 1 : c.left - 1, (c.top + c.bottom) / 2);
  await settle();
}

const rows = [];
let failed = false;
/** Perform `steps` (a key, or a function) from a click at `pos` on each side; every step's selection must be equal. With `expect`, the FragmentedView alone performs them and its selection after every step must be `expect`: for an act `EditorView` cannot pass (it too reads a selection the browser drops). */
async function act(name, start, steps, expect = null) {
  await mount();
  const trail = { left: [], right: [] };
  for (const side of expect ? ['right'] : SIDES) {
    await mount();
    await clickAt(side, await start(), -1);
    trail[side].push(await state(side));
    for (const step of steps) {
      if (typeof step === 'string') await page.keyboard.press(step);
      else await step(side);
      await settle(); await settled();
      trail[side].push(await state(side));
    }
  }
  const ok = expect ? trail.right.join('|') === expect.join('|') : trail.left.join('|') === trail.right.join('|');
  if (!ok) failed = true;
  rows.push([name, ok ? 'yes' : '**no**', ok ? trail.right.join(' → ') : `${expect ? `expected ${expect.join(' → ')}` : `EditorView ${trail.left.join(' → ')}`}; FragmentedView ${trail.right.join(' → ')}`]);
}

docName = 'flat';
const R = 'ArrowRight', L = 'ArrowLeft', D = 'ArrowDown', U = 'ArrowUp';
await act('ArrowRight from the end of the paragraph before the rule, three times', () => endOf('two two'), [R, R, R]);
await act('ArrowLeft from the start of the paragraph after the rule, three times', async () => (await endOf('three three')) - 'three three'.length, [L, L, L]);
await act('Shift+ArrowRight over the inline image, three times', () => endOf('five '), ['Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowRight']);
await act('ArrowDown from the paragraph before the rule, three times', async () => (await endOf('two two')) - 3, [D, D, D]);
await act('ArrowUp from the paragraph after the rule, three times', async () => (await endOf('three three')) - 3, [U, U, U]);
await act('a click on the rule, then ArrowRight and ArrowLeft', () => endOf('two two'), [async (side) => {
  const c = await page.evaluate((sd) => { const r = window.harness.view(sd).dom.querySelector('hr').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, side);
  await page.mouse.click(c.x, c.y);
}, R, L]);
await act('ArrowRight and ArrowLeft across the inline image', () => endOf('five'), [R, R, R, L, L, L]);
await act('Backspace and Delete next to the rule', async () => (await endOf('three three')) - 'three three'.length, [L, 'Backspace', 'Delete']);

docName = 'facsimile';
await act('facsimile alone in its section: ArrowRight from the end of the paragraph before it, three times', () => endOf('two two'), [R, R, R]);
await act('facsimile alone in its section: ArrowLeft from the start of the paragraph after it, three times', async () => (await endOf('three three')) - 'three three'.length, [L, L, L]);
// What the studio's facsimile does and the harness's cannot be made to: Chromium clears a selection drawn around an `<object>` that holds a canvas once the page draws it, and leaves a caret at the start of the editing host. Here the browser's part is played by the step.
const dropped = async (side) => { await page.evaluate((sd) => { const v = window.harness.view(sd); getSelection().collapse(document.createTreeWalker(v.dom, NodeFilter.SHOW_TEXT).nextNode(), 0); }, side); };
await act('the browser drops the node selection of a facsimile (a caret at the start of the document): it stands, and the arrows leave it', () => endOf('two two'), [R, dropped, R, L, dropped, L],
  ['TextSelection 18-18', 'NodeSelection 21-22', 'NodeSelection 21-22', 'TextSelection 25-25', 'NodeSelection 21-22', 'NodeSelection 21-22', 'TextSelection 18-18']);

console.log('| Act | Selection after every step equal | Steps |\n| :-- | :-- | :-- |');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
const bad = rows.filter((r) => r[1] !== 'yes').length;
console.log(`\n${rows.length - bad} of ${rows.length} acts as expected${bad ? `, ${bad} FAILED` : ''}${boxes ? ' (under boxes)' : ''}.`);
await session.close();
process.exit(failed ? 1 : 0);
