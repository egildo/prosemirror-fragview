// usage: node scripts/scroll.mjs [--headed] — a transaction that asks to be scrolled into view (`tr.scrollIntoView()`), on both sides of the harness, each in a pane of 500 px that scrolls (the right under 320 × 480 boxes). Each act checks whether the head's rectangle (`coordsAtPos`) lies inside the pane afterwards, as `EditorView` leaves it: (1) a selection set far below the pane's view; (2) the same far above it; (3) the same transaction without `scrollIntoView`, which must not scroll; (4) a head already in view, which must not scroll; (5) Enter in the line of a box's foot, with the pane scrolled so that the foot is its last line, the caret going to the box after it, whose box the ripple has yet to fill when the key is applied; (6) a typed key at the foot of the pane; (7) `handleScrollToSelection` taking the scroll; (8) the window as the scroller instead of a pane. Prints a table and exits 1 when an act differs.
import { open } from './browser.mjs';

const session = await open('harness/?boxes=320x480', { headless: !process.argv.includes('--headed') });
const { page } = session;
await page.waitForFunction(() => window.harness && document.getElementById('toolbar').textContent.includes('equal'), null, { timeout: 60000 });
const settled = () => page.waitForFunction(() => window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
await settled();
const settle = () => page.waitForTimeout(150);
const SIDES = ['left', 'right'];

const pane = (on) => page.evaluate((on) => { for (const id of ['left', 'right']) Object.assign(document.getElementById(id).style, on ? { height: '500px', overflow: 'auto' } : { height: '', overflow: '' }); }, on);
const reset = async () => { await page.evaluate(() => { window.harness.reset(); window.scrollTo(0, 0); for (const id of ['left', 'right']) document.getElementById(id).scrollTop = 0; }); await settled(); await settle(); };
const find = (text) => page.evaluate((t) => window.harness.find(t), text);
/** Whether the head's rectangle lies inside the scroller (the pane, or the window), and the scroller's offset. */
const seen = (side, paneOn) => page.evaluate(([side, paneOn]) => {
  const view = window.harness.view(side);
  const c = view.coordsAtPos(view.state.selection.head);
  const el = document.getElementById(side);
  const r = paneOn ? el.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  return { inView: c.top >= r.top - 1 && c.bottom <= r.bottom + 1, scroll: paneOn ? el.scrollTop : scrollY };
}, [side, paneOn]);
/** Set the selection with a transaction on a side, scrolled or not. */
const jump = (side, pos, scroll) => page.evaluate(([side, pos, scroll]) => {
  const view = window.harness.view(side);
  view.focus();
  return import('/src/index.js').then(() => {
    const sel = view.state.selection.constructor.near(view.state.doc.resolve(pos));
    const tr = view.state.tr.setSelection(sel);
    view.dispatch(scroll ? tr.scrollIntoView() : tr);
  });
}, [side, pos, scroll]);

const rows = [];
let failed = false;
function row(name, left, right, expectScroll) {
  const ok = left.inView === right.inView && right.inView === expectScroll.inView && (expectScroll.scrolled == null || (right.scroll !== expectScroll.from) === expectScroll.scrolled);
  if (!ok) failed = true;
  rows.push([name, ok ? 'yes' : '**no**', `EditorView ${left.inView ? 'in view' : 'out of view'} at ${Math.round(left.scroll)}, FragmentedView ${right.inView ? 'in view' : 'out of view'} at ${Math.round(right.scroll)}`]);
}

await pane(true);
const target = (await find('Where it goes next')) + 4;
const top = 12;

// (1) far below.
await reset();
for (const side of SIDES) await jump(side, target, true);
await settle(); await settled();
row('a selection far below the pane\'s view, with scrollIntoView', await seen('left', true), await seen('right', true), { inView: true, scrolled: true, from: 0 });

// (2) far above, from the scrolled position.
for (const side of SIDES) await jump(side, top, true);
await settle(); await settled();
row('the same far above it', await seen('left', true), await seen('right', true), { inView: true, scrolled: true, from: null });

// (3) without scrollIntoView.
await reset();
for (const side of SIDES) await jump(side, target, false);
await settle();
row('the same transaction without scrollIntoView does not scroll', await seen('left', true), await seen('right', true), { inView: false, scrolled: false, from: 0 });

// (4) a head already in view.
await reset();
for (const side of SIDES) await jump(side, top, true);
await settle();
row('a head already in view does not scroll', await seen('left', true), await seen('right', true), { inView: true, scrolled: false, from: 0 });

// (5) Enter in the last line of box 0, the pane scrolled so that line is its last.
await reset();
{
  const foot = await page.evaluate(() => window.harness.chain()[0].to - 3);
  await page.evaluate((foot) => {
    const right = window.harness.right;
    const c = right.coordsAtPos(foot);
    const el = document.getElementById('right');
    el.scrollTop += c.bottom - el.getBoundingClientRect().bottom + 6;
  }, foot);
  await settle();
  await page.evaluate((foot) => { window.harness.select('right', foot, foot); }, foot);
  const before = await seen('right', true);
  await page.keyboard.press('Enter');
  await settle(); await settled(); await settle();
  const right = await seen('right', true);
  const ok = right.inView && right.scroll !== before.scroll;
  if (!ok) failed = true;
  rows.push(['Enter in the last line of box 0 with the pane scrolled to it: the caret goes to box 1, filled after the key', ok ? 'yes' : '**no**', `FragmentedView ${before.inView ? 'in view' : 'out of view'} at ${Math.round(before.scroll)} before, ${right.inView ? 'in view' : 'out of view'} at ${Math.round(right.scroll)} after`]);
}

// (6) A typed key at the pane's foot.
await reset();
{
  const pos = (await find('The view draws')) + 100;
  await page.evaluate((pos) => {
    const right = window.harness.right;
    const c = right.coordsAtPos(pos);
    const el = document.getElementById('right');
    el.scrollTop += c.bottom - el.getBoundingClientRect().bottom + 2;
    window.harness.select('right', pos, pos);
  }, pos);
  await settle();
  const before = await seen('right', true);
  await page.keyboard.type('x'.repeat(60));
  await settle(); await settled();
  const right = await seen('right', true);
  const ok = right.inView;
  if (!ok) failed = true;
  rows.push(['sixty characters typed with the caret at the pane\'s foot', ok ? 'yes' : '**no**', `FragmentedView ${before.inView ? 'in view' : 'out of view'} at ${Math.round(before.scroll)} before, ${right.inView ? 'in view' : 'out of view'} at ${Math.round(right.scroll)} after`]);
}

// (7) handleScrollToSelection takes the scroll.
await reset();
{
  await page.evaluate(() => { window.taken = 0; for (const v of [window.harness.left, window.harness.right]) v.setProps({ handleScrollToSelection: () => { window.taken++; return true; } }); });
  for (const side of SIDES) await jump(side, target, true);
  await settle();
  const taken = await page.evaluate(() => { const n = window.taken; for (const v of [window.harness.left, window.harness.right]) v.setProps({ handleScrollToSelection: undefined }); return n; });
  const right = await seen('right', true);
  const ok = taken === 2 && right.scroll === 0;
  if (!ok) failed = true;
  rows.push(['handleScrollToSelection takes the scroll: asked once per side, nothing scrolled', ok ? 'yes' : '**no**', `asked ${taken} times, FragmentedView at ${Math.round(right.scroll)}`]);
}

// (8) The window as the scroller.
await pane(false);
await reset();
const window8 = {};
for (const side of SIDES) { await page.evaluate(() => window.scrollTo(0, 0)); await jump(side, target, true); await settle(); await settled(); window8[side] = await seen(side, false); }
row('the window as the scroller: a selection far below, with scrollIntoView (each side from the top)', window8.left, window8.right, { inView: true, scrolled: null });

console.log('| Act | As expected | Notes |\n| :-- | :-- | :-- |');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
const bad = rows.filter((r) => r[1] !== 'yes').length;
console.log(`\n${rows.length - bad} of ${rows.length} acts as expected${bad ? `, ${bad} FAILED` : ''}.`);
await session.close();
process.exit(failed ? 1 : 0);
