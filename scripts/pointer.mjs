// usage: node scripts/pointer.mjs [--headed] — the mouse selection acts of the editing bugs, over the harness under 320 × 480 boxes, with the real mouse (Playwright). A press, a drag and a release are compared with where the view's own posAtCoords puts the pointer at each end: the model's anchor is the press and its head is the pointer's, whatever lies between (a box's foot, another box, a scrolled pane). (1) a drag from the foot of box 0 into box 1, with the highlight in both boxes; (2) a click in box 0 and a Shift+click in box 1; (3) a drag over three boxes; (4) a drag inside one box with the pane scrolled by script under the held button, against the same drag unscrolled; (5) a drag held at the pane's foot, which must scroll the pane and carry the head on; (6) a double click, which must still select the word; (7) the same drag as (1) with a Shift+click after it, which must extend from the drag's anchor. Prints a table and exits 1 when an act differs.
import { open } from './browser.mjs';

const session = await open('harness/?boxes=320x480', { headless: !process.argv.includes('--headed') });
const { page } = session;
await page.setViewportSize({ width: 1400, height: 1800 });
const settled = () => page.waitForFunction(() => window.harness && window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
await settled();
const settle = () => page.waitForTimeout(80);

/** The viewport point of `pos` on the right, scrolled into view first when `scroll`. */
const pointOf = (pos, { scroll = true, bias = 1 } = {}) => page.evaluate(([p, scroll, b]) => {
  const view = window.harness.right;
  if (scroll) { const { node } = view.domAtPos(p); (node.nodeType === 1 ? node : node.parentElement).scrollIntoView({ block: 'center' }); }
  const c = view.coordsAtPos(p, b);
  return { x: b >= 0 ? c.left + 1 : c.left - 1, y: (c.top + c.bottom) / 2 };
}, [pos, scroll, bias]);
/** What the view's posAtCoords answers at a viewport point. */
const posAt = (x, y) => page.evaluate(([x, y]) => window.harness.right.posAtCoords({ left: x, top: y })?.pos ?? null, [x, y]);
const selection = () => page.evaluate(() => { const s = window.harness.right.state.selection; return { anchor: s.anchor, head: s.head }; });
/** The boxes the selection highlight has a range in. */
const boxesPainted = () => page.evaluate(() => { const right = window.harness.right; const h = CSS.highlights.get('fragview-selection'); return h ? [...new Set([...h].map((r) => right.fragments.findIndex((e) => e.container.dom.contains(r.startContainer))))].sort() : []; });
/** The text the model selects, from the model alone. */
const selected = () => page.evaluate(() => { const { state } = window.harness.right; return state.doc.textBetween(state.selection.from, state.selection.to, ' '); });
const chain = () => page.evaluate(() => window.harness.chain().map((e) => ({ from: e.from, to: e.to })));
const reset = async () => { await page.evaluate(() => { window.harness.reset(); window.scrollTo(0, 0); }); await settled(); await settle(); };

const rows = [];
let failed = false;
function row(name, ok, note) { rows.push([name, ok ? 'yes' : '**no**', note]); if (!ok) failed = true; }
const same = (a, b) => a.anchor === b.anchor && a.head === b.head;

// (1) A drag from the foot of box 0 into box 1.
await reset();
{
  const { to } = (await chain())[0];
  const from = await pointOf(to - 40, { scroll: false }), into = await pointOf(to + 60, { scroll: false });
  const want = { anchor: await posAt(from.x, from.y), head: await posAt(into.x, into.y) };
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move((from.x + into.x) / 2, (from.y + into.y) / 2, { steps: 4 });
  await page.mouse.move(into.x, into.y, { steps: 6 });
  await page.mouse.up(); await settle();
  const got = await selection(), boxes = await boxesPainted();
  row(`a drag from the foot of box 0 into box 1 (${want.anchor} → ${want.head})`, same(got, want) && boxes.join() === '0,1', `selection ${got.anchor} → ${got.head}, highlight in boxes ${boxes.join(', ') || 'none'}`);
}

// (2) A click in box 0, then a Shift+click in box 1.
await reset();
{
  const { to } = (await chain())[0];
  const a = await pointOf(to - 40, { scroll: false }), b = await pointOf(to + 60, { scroll: false });
  const want = { anchor: await posAt(a.x, a.y), head: await posAt(b.x, b.y) };
  await page.mouse.click(a.x, a.y); await settle();
  await page.keyboard.down('Shift'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Shift'); await settle();
  const got = await selection(), boxes = await boxesPainted();
  row(`a click in box 0, then a Shift+click in box 1 (${want.anchor} → ${want.head})`, same(got, want) && boxes.join() === '0,1', `selection ${got.anchor} → ${got.head}, highlight in boxes ${boxes.join(', ') || 'none'}`);
}

// (3) A drag over three boxes, upwards, so that the anchor is the later end.
await reset();
{
  const c = await chain();
  const a = await pointOf(c[2].from + 80, { scroll: false }), b = await pointOf(c[0].from + 80, { scroll: false });
  const want = { anchor: await posAt(a.x, a.y), head: await posAt(b.x, b.y) };
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up(); await settle();
  const got = await selection(), boxes = await boxesPainted();
  row(`a drag upwards over three boxes (${want.anchor} → ${want.head})`, same(got, want) && boxes.join() === '0,1,2', `selection ${got.anchor} → ${got.head}, highlight in boxes ${boxes.join(', ') || 'none'}`);
}

// The pane for (4) and (5): the right column a scroller of its own, as the studio's pages are.
await page.evaluate(() => { const el = document.getElementById('right'); Object.assign(el.style, { height: '600px', overflow: 'auto' }); });
await reset();

// (4) A drag inside one box, the pane scrolled by script under the held button, against the same drag with no scroll.
{
  const pos = (await chain())[1].from + 120;
  const drag = async (scrollBy) => {
    await page.evaluate(() => { document.getElementById('right').scrollTop = 0; });
    const p = await pointOf(pos);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    if (scrollBy) await page.evaluate((dy) => { document.getElementById('right').scrollTop += dy; }, scrollBy);
    await page.mouse.move(p.x + 160, p.y + 40, { steps: 6 });
    await page.mouse.up(); await settle();
    return { sel: await selection(), press: await posAt(p.x, p.y), head: await posAt(p.x + 160, p.y + 40) };
  };
  const still = await drag(0);
  row(`a drag inside box 1, pane still (${still.press} → ${still.head})`, still.sel.anchor === still.press && still.sel.head === still.head && still.press !== still.head, `selection ${still.sel.anchor} → ${still.sel.head}`);
  const moved = await drag(94);
  row('the same drag, the pane scrolled 94 px under the held button', moved.sel.anchor === still.press && moved.sel.head === moved.head && moved.sel.anchor !== moved.sel.head, `selection ${moved.sel.anchor} → ${moved.sel.head}, the press at ${still.press}, the pointer over ${moved.head}`);
}

// (5) A drag held at the pane's foot: the pane scrolls and the head goes on.
await reset();
{
  const pos = (await chain())[0].from + 60;
  const press = await pointOf(pos);
  const box = await page.evaluate(() => { const r = document.getElementById('right').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left }; });
  const wantAnchor = await posAt(press.x, press.y);
  await page.mouse.move(press.x, press.y); await page.mouse.down();
  await page.mouse.move(press.x + 20, box.bottom - 6, { steps: 8 });
  const before = await page.evaluate(() => document.getElementById('right').scrollTop);
  const h0 = (await selection()).head;
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => document.getElementById('right').scrollTop);
  const h1 = (await selection()).head;
  await page.mouse.up(); await settle();
  const got = await selection();
  row('a drag held at the pane\'s foot scrolls the pane and carries the head on', after > before && h1 > h0 && got.anchor === wantAnchor, `scrollTop ${before} → ${after}, head ${h0} → ${h1}, selection ${got.anchor} → ${got.head}`);
}
await page.evaluate(() => { const el = document.getElementById('right'); el.style.height = ''; el.style.overflow = ''; });

// (6) A double click still selects the word, natively.
await reset();
{
  const pos = (await chain())[0].from + 80;
  const p = await pointOf(pos);
  await page.mouse.dblclick(p.x, p.y); await settle();
  const text = await selected();
  row('a double click selects a word', /^\S+$/.test(text.trim()) && text.trim().length > 1, `selected ${JSON.stringify(text)}`);
}

// (7) A drag across the cut, then a Shift+click further on: the anchor is the drag's.
await reset();
{
  const c = await chain();
  const a = await pointOf(c[0].to - 40, { scroll: false }), b = await pointOf(c[0].to + 60, { scroll: false }), d = await pointOf(c[1].to - 60, { scroll: false });
  const want = { anchor: await posAt(a.x, a.y), head: await posAt(d.x, d.y) };
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await settle();
  await page.keyboard.down('Shift'); await page.mouse.click(d.x, d.y); await page.keyboard.up('Shift'); await settle();
  const got = await selection();
  row(`a drag across the cut, then a Shift+click in the same box further on (${want.anchor} → ${want.head})`, same(got, want), `selection ${got.anchor} → ${got.head}`);
}

console.log('| Act | As expected | Notes |\n| :-- | :-- | :-- |');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
const bad = rows.filter((r) => r[1] !== 'yes').length;
console.log(`\n${rows.length - bad} of ${rows.length} acts as expected${bad ? `, ${bad} FAILED` : ''}.`);
await session.close();
process.exit(failed ? 1 : 0);
