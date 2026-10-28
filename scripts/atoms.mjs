// usage: node scripts/atoms.mjs [--headed] [--boxes] — the arrows and the click around an atom, on both sides of the harness. The document is two short paragraphs, a horizontal rule (a block atom the browser can put no caret in), two more short paragraphs and a paragraph with an inline image; `--boxes` puts the right side under 320 × 110 boxes, so that the rule and the image stand at cuts of the chain. Each act performs the same keys or click on the EditorView (left) and the FragmentedView (right) from a fresh state and compares the selection after every step, its kind and its range: ArrowRight from the end of the paragraph before the rule through to the paragraph after it, ArrowLeft back, ArrowDown and ArrowUp through the same, a click on the rule (which selects it, as `prosemirror-view` does for a selectable atom), the same arrows around the inline image and Shift+ArrowRight over it, and Backspace and Delete beside the rule. Shift+ArrowRight over the rule itself is left out: the browser's extension over a block atom is not the library's, and EditorView's own result is a collapsed range (measured: 17-17 then 20-20). Exits 1 when a step differs.
import { open } from './browser.mjs';

const boxes = process.argv.includes('--boxes');
const session = await open(boxes ? 'harness/?boxes=320x110' : 'harness/', { headless: !process.argv.includes('--headed') });
const { page } = session;
await page.waitForFunction(() => window.harness && document.getElementById('toolbar').textContent.includes('equal'), null, { timeout: 60000 });
const settled = () => page.waitForFunction(() => window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
const settle = () => page.waitForTimeout(90);
const SIDES = ['left', 'right'];
const MOD = 'ControlOrMeta';

const mount = async () => {
  await page.evaluate(() => {
    const schema = window.harness.right.state.schema;
    const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
    window.harness.mount(schema.nodeFromJSON({ type: 'doc', content: [para('one one'), para('two two'), { type: 'horizontal_rule' }, para('three three'), para('four four'), { type: 'paragraph', content: [{ type: 'text', text: 'five ' }, { type: 'image', attrs: { src: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2720%27 height=%2712%27%3E%3Crect width=%2720%27 height=%2712%27 fill=%27%23999%27/%3E%3C/svg%3E' } }, { type: 'text', text: ' six' }] }] }));
  });
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
/** Perform `steps` (a key, or a function) from a click at `pos` on each side; every step's selection must be equal. */
async function act(name, start, steps) {
  await mount();
  const trail = { left: [], right: [] };
  for (const side of SIDES) {
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
  const ok = trail.left.join('|') === trail.right.join('|');
  if (!ok) failed = true;
  rows.push([name, ok ? 'yes' : '**no**', ok ? trail.right.join(' → ') : `EditorView ${trail.left.join(' → ')}; FragmentedView ${trail.right.join(' → ')}`]);
}

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

console.log('| Act | Selection after every step equal | Steps |\n| :-- | :-- | :-- |');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
const bad = rows.filter((r) => r[1] !== 'yes').length;
console.log(`\n${rows.length - bad} of ${rows.length} acts as expected${bad ? `, ${bad} FAILED` : ''}${boxes ? ' (under boxes)' : ''}.`);
await session.close();
process.exit(failed ? 1 : 0);
