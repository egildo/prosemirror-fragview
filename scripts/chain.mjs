// usage: node scripts/chain.mjs [--headed] — phase 2's acts over the harness with fixed-height boxes: the chain in motion (an edit that keeps its cut, one that moves it, undo), the DOM of untouched fragments, the selection across fragments, the geometry across the chain, the forced first line, the timings under one infinite box and under boxes, the window policy, and late truth (`moved`). Prints each act's numbers; docs/results.md records them.
import { open } from './browser.mjs';

const MOD = 'ControlOrMeta';
const LATE_MS = 800;
const session = await open('harness/', { headless: !process.argv.includes('--headed') });
const { page, url } = session;
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// The late image arrives LATE_MS after it is asked for, so it lands after the chain's first fills.
await page.route('**/late.svg', async (route) => { await new Promise((r) => setTimeout(r, LATE_MS)); await route.continue(); });

const settle = (ms = 80) => page.waitForTimeout(ms);
async function load(query) {
  await page.goto(new URL('?' + query, url).href, { waitUntil: 'domcontentloaded' }); // not `load`, which waits for the late image
  await page.waitForFunction(() => window.harness && window.harness.right.filling.size === 0);
  await settle(200);
}
const chain = () => page.evaluate(() => window.harness.chain());
const cuts = (c) => c.map((e) => `${e.from}–${e.to ?? 'end'}`).join(', ');
const find = (text, occurrence = 0) => page.evaluate(([t, o]) => window.harness.find(t, o), [text, occurrence]);
const mark = () => page.evaluate(() => { window.harness.fills.length = 0; window.harness.transactions.length = 0; });
const fills = () => page.evaluate(() => window.harness.fills.map((f) => ({ ...f, ms: Math.round(f.ms * 10) / 10 })));
const transactions = () => page.evaluate(() => window.harness.transactions);
const f = (x) => x.toFixed(2);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const section = (title) => console.log(`\n## ${title}\n`);
const sameCuts = (a, b) => a.length === b.length && a.every((e, i) => e.from === b[i].from && e.to === b[i].to);

/** Click at `pos` on a side through its own coordsAtPos, scrolled into view first. */
async function clickAt(side, pos, { bias = 1, shift = false } = {}) {
  const c = await page.evaluate(([s, p, b]) => {
    const view = window.harness.view(s);
    const { node } = view.domAtPos(p);
    (node.nodeType === 1 ? node : node.parentElement).scrollIntoView({ block: 'center' });
    return view.coordsAtPos(p, b);
  }, [side, pos, bias]);
  const x = bias >= 0 ? c.left + 1 : c.left - 1, y = (c.top + c.bottom) / 2;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  if (shift) await page.keyboard.up('Shift');
  await settle();
}
const selection = () => page.evaluate(() => { const { anchor, head } = window.harness.right.state.selection; return { anchor, head }; });
/** The browser's selection on the right: the indices of the boxes its anchor and focus are in, and whether it is collapsed. */
const domSelection = () => page.evaluate(() => {
  const sel = getSelection();
  const boxes = [...window.harness.right.dom.children];
  const box = (n) => boxes.findIndex((b) => b.contains(n));
  return { anchorBox: box(sel.anchorNode), focusBox: box(sel.focusNode), collapsed: sel.isCollapsed };
});
/** The selection highlight: its ranges and the box each one is in. */
const highlight = () => page.evaluate(() => {
  const h = CSS.highlights.get('fragview-selection');
  const boxes = [...window.harness.right.dom.children];
  return h ? [...h].map((r) => boxes.findIndex((b) => b.contains(r.startContainer))) : [];
});
/** Whether every built box shows exactly the text of its entry's range. */
const consistent = () => page.evaluate(() => {
  const view = window.harness.right;
  const { doc } = view.state;
  return view.fragments.every((e) => !e.container || e.dirty || e.container.content.textContent === doc.textBetween(e.from, e.to ?? doc.content.size, '', ''));
});
/** Whether the documents on the two sides are equal. */
const docsEqual = () => page.evaluate(() => window.harness.hash(window.harness.left.state.doc.toJSON()) === window.harness.hash(window.harness.right.state.doc.toJSON()));

// ---------------------------------------------------------------- the chain in motion

await load('boxes=320x480');
section('The chain, 424 words under 320 × 480 boxes');
{
  const c = await chain();
  const first = await fills();
  console.log(`first build: ${c.length} entries (${cuts(c)}); ${first.length} fills, ${first.map((x) => x.ms).join(' / ')} ms`);
}

// An edit in fragment one that does not move its cut, and the DOM of the fragments it did not touch.
{
  await page.evaluate(() => { for (const box of window.harness.right.dom.children) box.firstChild.firstChild.__mark = true; });
  const before = await chain();
  await clickAt('right', (await find('The answer is a position')) + 'The answer'.length);
  await mark();
  await page.keyboard.type('x');
  await settle();
  const trs = await transactions(), log = await fills(), after = await chain();
  const kept = await page.evaluate(() => [...window.harness.right.dom.children].map((box) => !!box.firstChild.firstChild.__mark));
  const edit = trs.find((t) => t.edit);
  console.log('### An edit in fragment one that does not move its cut (one character typed in the first paragraph)');
  console.log(`before: ${cuts(before)}`);
  console.log(`mapped by the edit: ${cuts(edit.chain)}; dirty: [${edit.chain.map((e) => e.dirty ? 1 : 0)}]`);
  console.log(`refills: ${log.length} (boxes ${log.map((x) => x.index)}), ${log.map((x) => x.ms).join(' / ')} ms; transactions after the edit: ${trs.length - 1} (${trs.slice(1).map((t) => Object.keys(t.meta ?? {}).join('+')).join(', ')})`);
  console.log(`after: ${cuts(after)}; dirty after the first refill: ${trs.at(-1).chain.filter((e) => e.dirty).length}`);
  console.log(`DOM kept (the same first element as before the edit), per box: [${kept.map((k) => (k ? 'kept' : 'new'))}]`);
  await mark();
  await page.keyboard.press(`${MOD}+z`);
  await settle();
  const undoTrs = await transactions(), undoLog = await fills(), undone = await chain();
  const undoEdit = undoTrs.find((t) => t.edit);
  console.log(`undo: mapped by the undo, before any refill: ${cuts(undoEdit.chain)}, equal to before the edit: ${sameCuts(undoEdit.chain, before) ? 'yes' : 'no'}; dirty [${undoEdit.chain.map((e) => (e.dirty ? 1 : 0))}]; refills ${undoLog.length} (boxes ${undoLog.map((x) => x.index)}); after: equal to before the edit: ${sameCuts(undone, before) ? 'yes' : 'no'}`);
}

// An edit that moves the cut: a one-line paragraph inserted near the top, then undo.
await page.evaluate(() => window.harness.reset());
await settle(200);
{
  const before = await chain();
  await clickAt('right', (await find('page begins there.')) + 'page begins there.'.length, { bias: -1 });
  await mark();
  await page.keyboard.press('Enter');
  await page.keyboard.type('A new line.');
  await settle(200);
  const trs = await transactions(), log = await fills(), after = await chain();
  const edits = trs.filter((t) => t.edit);
  console.log('\n### An edit that moves the cut (Enter at the end of the first paragraph, then "A new line.")');
  console.log(`before: ${cuts(before)}`);
  console.log(`edits: ${edits.length}; the first mapped: ${cuts(edits[0].chain)}`);
  console.log(`refills: ${log.length}, boxes in order ${log.map((x) => x.index)}, ${log.map((x) => x.ms).join(' / ')} ms`);
  console.log(`after: ${cuts(after)}; entries ${before.length} → ${after.length}; every built box shows its entry's text: ${(await consistent()) ? 'yes' : 'no'}`);

  await mark();
  await page.keyboard.press(`${MOD}+z`);
  await settle(200);
  const undoTrs = await transactions(), undoLog = await fills(), undone = await chain();
  const undoEdit = undoTrs.find((t) => t.edit);
  const docBack = await page.evaluate(() => window.harness.hash(window.harness.right.state.doc.toJSON()) === window.harness.hash(window.harness.left.state.doc.toJSON()));
  console.log('\n### Undo of that edit (one Mod-z)');
  console.log(`document back to the fixed one: ${docBack ? 'yes' : 'no'}`);
  console.log(`mapped by the undo, before any refill: ${cuts(undoEdit.chain)}; dirty [${undoEdit.chain.map((e) => (e.dirty ? 1 : 0))}]; equal to the chain before the edit: ${sameCuts(undoEdit.chain, before) ? 'yes' : 'no'}`);
  console.log(`refills: ${undoLog.length}, boxes ${undoLog.map((x) => x.index)}; after: ${cuts(undone)}; equal to before the edit: ${sameCuts(undone, before) ? 'yes' : 'no'}`);
}

// ---------------------------------------------------------------- the selection across fragments

await page.evaluate(() => window.harness.reset());
await settle(200);
section('The selection across fragments');
{
  const c = await chain();
  const cut = c[0].to;
  // Shift-click from fragment one into fragment two.
  await clickAt('right', (await find('ProseMirror keeps')) + 3);
  await clickAt('right', (await find('What the view has to do')) + 4, { shift: true });
  console.log(`Shift-click from box 0 into box 1: model ${JSON.stringify(await selection())}; browser ${JSON.stringify(await domSelection())}; highlight ranges in boxes [${await highlight()}]`);

  // Shift+ArrowRight across the cut, then ArrowLeft back across it, then Shift+ArrowLeft across it.
  await clickAt('right', cut - 3);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await settle();
  console.log(`Shift+ArrowRight ×6 from the cut − 3 (cut at ${cut}): model ${JSON.stringify(await selection())}; browser ${JSON.stringify(await domSelection())}; highlight in boxes [${await highlight()}]`);
  await clickAt('right', cut + 3);
  const heads = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowLeft'); await settle(30); heads.push((await selection()).head); }
  console.log(`ArrowLeft ×6 from the cut + 3: heads ${heads.join(', ')}; browser ${JSON.stringify(await domSelection())}`);
  const rights = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await settle(30); rights.push((await selection()).head); }
  console.log(`ArrowRight ×6 back: heads ${rights.join(', ')}; browser ${JSON.stringify(await domSelection())}`);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
  await settle();
  console.log(`Shift+ArrowLeft ×6 from the cut + 3: model ${JSON.stringify(await selection())}; browser ${JSON.stringify(await domSelection())}; highlight in boxes [${await highlight()}]`);

  // Typing over a selection across the cut, on both sides from the same model selection.
  const from = await find('Mapping'), to = (await find('the cut moves by three')) + 4;
  await clickAt('right', from);
  await clickAt('right', to, { shift: true });
  const sel = await selection();
  await mark();
  await page.keyboard.type('Z');
  await settle(200);
  const log = await fills();
  await page.evaluate(([a, h]) => window.harness.select('left', a, h), [sel.anchor, sel.head]);
  await page.keyboard.type('Z');
  await settle();
  console.log(`Typing over a selection ${sel.anchor}–${sel.head} across the cut at ${cut}: refills ${log.length} (boxes ${log.map((x) => x.index)}); documents equal with the EditorView typing over the same selection: ${(await docsEqual()) ? 'yes' : 'no'}; chain after ${cuts(await chain())}`);

  console.log(`every built box shows its entry's text after typing over the cross-fragment selection: ${(await consistent()) ? 'yes' : 'no'}`);

  // Copy across the cut: the model's selection, not the browser's (which holds the head's box only).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  await page.evaluate(() => window.harness.reset());
  await settle(200);
  await clickAt('right', (await find('ProseMirror keeps')) + 3);
  await clickAt('right', (await find('What the view has to do')) + 4, { shift: true });
  await page.keyboard.press(`${MOD}+c`);
  await settle();
  const copied = await page.evaluate(async () => {
    const { state } = window.harness.right;
    return { clipboard: await navigator.clipboard.readText(), model: state.doc.textBetween(state.selection.from, state.selection.to, '\n\n', '\ufffc') };
  });
  console.log(`Mod-c over a selection from box 0 into box 1: the clipboard's text is the model's selection: ${copied.clipboard === copied.model ? 'yes' : 'no'} (${copied.clipboard.length} characters)`);

  // Mod-a.
  await page.evaluate(() => window.harness.reset());
  await settle(200);
  await clickAt('right', await find('ProseMirror keeps'));
  await page.keyboard.press(`${MOD}+a`);
  await settle();
  const built = (await chain()).filter((e) => e.built).length;
  console.log(`Mod-a: model ${JSON.stringify(await selection())}; highlight ranges in boxes [${await highlight()}] of ${built} built; browser ${JSON.stringify(await domSelection())}`);
}

// ---------------------------------------------------------------- geometry across the chain

await page.evaluate(() => window.harness.reset());
await settle(200);
section('Geometry across the chain');
{
  const result = await page.evaluate(() => {
    const view = window.harness.right;
    const boxes = [...view.dom.children];
    const boxOf = (n) => boxes.findIndex((b) => b.contains(n));
    const entries = view.fragments;
    const atCuts = entries.slice(0, -1).map((e, i) => {
      const point = view.domAtPos(e.to);
      const c = view.coordsAtPos(e.to);
      const next = boxes[i + 1].getBoundingClientRect();
      return { cut: e.to, domBox: boxOf(point.node), coordsInNext: c.top >= next.top && c.bottom <= next.bottom, fragmentAt: entries.indexOf(entries.find((x) => x.key === view.fragmentAt(e.to).key)) };
    });
    const size = view.state.doc.content.size;
    let shown = 0, roundTrip = 0, viaCoords = 0, textPositions = 0;
    const misses = [];
    for (let p = 0; p <= size; p++) {
      let point;
      try { point = view.domAtPos(p); } catch { continue; }
      shown++;
      if (view.posAtDOM(point.node, point.offset) === p) roundTrip++; else if (misses.length < 6) misses.push(p);
      const $p = view.state.doc.resolve(p);
      if (!$p.parent.isTextblock) continue;
      textPositions++;
      const c = view.coordsAtPos(p);
      boxes[view.fragments.findIndex((e) => e.key === view.fragmentAt(p).key)].scrollIntoView({ block: 'center' });
      const c2 = view.coordsAtPos(p);
      const hit = view.posAtCoords({ left: c2.left + 0.5, top: (c2.top + c2.bottom) / 2 });
      if (hit && hit.pos === p) viaCoords++;
      void c;
    }
    let nodes = 0, nodesRight = 0;
    view.state.doc.forEach((node, offset) => {
      nodes++;
      const dom = view.nodeDOM(offset);
      const at = view.fragments.findIndex((e) => e.key === view.fragmentAt(offset + 1)?.key);
      if (dom && boxes[at]?.contains(dom)) nodesRight++;
    });
    return { atCuts, size, shown, roundTrip, misses, textPositions, viaCoords, nodes, nodesRight };
  });
  for (const c of result.atCuts) console.log(`cut ${c.cut}: domAtPos in box ${c.domBox}, coordsAtPos inside the next box: ${c.coordsInNext ? 'yes' : 'no'}, fragmentAt is entry ${c.fragmentAt}`);
  console.log(`positions 0–${result.size}: ${result.shown} shown by domAtPos, ${result.roundTrip} come back through posAtDOM (misses at ${result.misses.join(', ') || 'none'}); ${result.viaCoords} of ${result.textPositions} textblock positions come back through posAtCoords(coordsAtPos); nodeDOM of ${result.nodesRight} of ${result.nodes} top-level blocks lies in the box fragmentAt names for their first position`);
}

// ---------------------------------------------------------------- the forced first line

await load('boxes=320x40');
section('The forced first line, 40-pixel boxes');
{
  const c = await chain();
  const advancing = c.every((e) => e.to == null || e.to > e.from);
  const h1 = await page.evaluate(() => { const b = window.harness.right.dom.children[0]; return { lineHeight: getComputedStyle(b.querySelector('h1')).lineHeight, text: b.textContent }; });
  console.log(`${c.length} boxes, every to > from: ${advancing ? 'yes' : 'no'}, the last runs to the end: ${c.at(-1).to == null ? 'yes' : 'no'}; box 0 holds "${h1.text}" (the h1's line is ${h1.lineHeight}), its to ${c[0].to}`);
}

// ---------------------------------------------------------------- timings

section('Timings: 30 keys typed, milliseconds from keydown, layout forced');
const rows = [];
for (const [query, label] of [['', 'one infinite box'], ['boxes=320x480', '320 × 480 boxes'], ['boxes=320x480&window=near', '320 × 480 boxes, window near']]) {
  for (const times of [1, 10]) {
    await load(query + (times === 10 ? (query ? '&' : '') + 'long=1' : ''));
    const c = await chain();
    for (const side of ['left', 'right']) { await clickAt(side, await find('The answer is a position')); await page.keyboard.type('Typed here, letter by letter. ', { delay: 25 }); await settle(); }
    const t = await page.evaluate(() => JSON.parse(JSON.stringify(window.harness.timings)));
    const equal = await docsEqual();
    rows.push({ label, words: times * 424, boxes: c.length, built: c.filter((e) => e.built).length, t, equal });
  }
}
console.log('| Document | Right side | Boxes (built) | EditorView median (max) | FragmentedView, the key\'s update, median (max) | the chain settled, median (max) | own updateState, median (max) | documents equal |');
console.log('| :-- | :-- | --: | :-- | :-- | :-- | :-- | :-- |');
for (const r of rows) {
  const m = (xs) => `${f(median(xs))} (${f(Math.max(...xs))})`;
  console.log(`| ${r.words} words | ${r.label} | ${r.boxes} (${r.built}) | ${m(r.t.left)} | ${m(r.t.right)} | ${m(r.t.rightSettled)} | ${m(r.t.rightUpdate)} | ${r.equal ? 'yes' : 'no'} |`);
}

// ---------------------------------------------------------------- the window policy

await load('boxes=320x480&long=1&window=near');
section('The window policy, 4 240 words, window near, margin 1');
{
  const state = () => page.evaluate(() => {
    const view = window.harness.right;
    const entries = window.harness.chain();
    const tail = view.dom.lastElementChild;
    return { entries: entries.length, built: entries.filter((e) => e.built).map((_, i, a) => i).length, builtIdx: entries.flatMap((e, i) => (e.built ? [i] : [])), dirty: entries.filter((e) => e.dirty).length, last: entries.at(-1), tailHeight: tail.classList.contains('fragview-placeholder') ? tail.offsetHeight : null, height: document.documentElement.scrollHeight, fills: window.harness.fills.length };
  });
  const first = await state();
  console.log(`first build: ${first.entries} entries, built [${first.builtIdx}], ${first.fills} fills; the last entry ${first.last.from}–${first.last.to ?? 'end'} unbuilt with a placeholder of ${first.tailHeight} px; the page ${first.height} px tall`);
  const estimate = await page.evaluate(() => {
    const view = window.harness.right;
    const pos = Math.floor(view.state.doc.content.size * 0.7);
    let thrown = null;
    try { view.domAtPos(pos); } catch (e) { thrown = e.message; }
    return { pos, coords: view.coordsAtPos(pos), thrown };
  });
  console.log(`coordsAtPos(${estimate.pos}), in the unbuilt rest: ${JSON.stringify(estimate.coords)}; domAtPos: ${estimate.thrown}`);
  await mark();
  let t = Date.now();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.waitForFunction(() => window.harness.right.filling.size === 0);
  await settle(400);
  const middle = await state();
  console.log(`scrolled to the middle: ${middle.entries} entries, built [${middle.builtIdx}], ${middle.fills} fills in ${Date.now() - t} ms (wall clock, settle included); placeholder of the rest ${middle.tailHeight} px; the page ${middle.height} px`);
  await mark();
  t = Date.now();
  for (let i = 0; i < 20; i++) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await settle(150); }
  const bottom = await state();
  console.log(`scrolled to the bottom: ${bottom.entries} entries, built [${bottom.builtIdx}], the last ${bottom.last.from}–${bottom.last.to ?? 'end'}, ${bottom.fills} fills; the page ${bottom.height} px`);
  // An edit at the top that moves the cut, with the top in view: the ripple stops after the last near entry.
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(300);
  await clickAt('right', (await find('page begins there.')) + 'page begins there.'.length, { bias: -1 });
  await mark();
  await page.keyboard.press('Enter');
  await page.keyboard.type('A new line.');
  await settle(300);
  const edited = await state();
  const log = await fills();
  console.log(`a line inserted at the top, the top in view: refills of boxes [${log.map((x) => x.index)}]; built [${edited.builtIdx}]; ${edited.dirty} entries left dirty, to be filled when they come near`);
  await mark();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.waitForFunction(() => window.harness.right.filling.size === 0);
  await settle(400);
  const resumed = await state();
  const resumedFills = await fills();
  console.log(`then scrolled to the middle: ${resumedFills.length} fills (the ripple resumed from box ${resumedFills[0]?.index}); built [${resumed.builtIdx}]; dirty ${resumed.dirty}; every built box shows its entry's text: ${(await consistent()) ? 'yes' : 'no'}`);
}

// ---------------------------------------------------------------- moved

await load('boxes=320x480&late=1');
section(`Late truth: an image in the second paragraph arrives ${LATE_MS} ms after it is asked for`);
{
  const before = await chain();
  const started = await page.evaluate(() => { window.harness.fills.length = 0; window.harness.transactions.length = 0; return performance.now(); });
  await page.waitForFunction(() => document.querySelector('#right img[src="late.svg"]')?.complete && document.querySelector('#right img[src="late.svg"]').naturalWidth > 0, null, { timeout: 5000 });
  await settle(400);
  const after = await chain();
  const log = await fills();
  const trs = await transactions();
  const arrived = await page.evaluate(() => performance.getEntriesByType('resource').find((e) => e.name.endsWith('/late.svg')).responseEnd);
  console.log(`before the image: ${cuts(before)}`);
  console.log(`transactions: ${trs.map((t) => Object.keys(t.meta ?? {}).join('+')).join(', ')}; the dirtied one ${f(trs[0].at - arrived)} ms after the image's response ended, the last refill ${f(trs.at(-1).at - trs[0].at)} ms after the dirtied one`);
  console.log(`refills: ${log.length}, boxes ${log.map((x) => x.index)}, ${log.map((x) => x.ms).join(' / ')} ms`);
  console.log(`after: ${cuts(after)} (the act waited ${Math.round(arrived - started)} ms for the image)`);
}

if (errors.length) console.log(`\npage errors: ${errors.join(' | ')}`);
await session.close();
