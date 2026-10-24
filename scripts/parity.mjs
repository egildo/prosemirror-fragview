// usage: node scripts/parity.mjs [--headed] [--boxes] — the parity acts over the harness, the right-hand side under one infinite box, or with --boxes under a chain of 320 × 480 boxes. Each act is performed identically on the EditorView (left) and on the FragmentedView (right), each from a fresh state: a click at the same model position through each view's own coordsAtPos, then the same keys. After the act, after Mod-z and after Shift-Mod-z, the two states' documents and selections are compared. Prints the table, then the typing timings.
import { open } from './browser.mjs';

const MOD = 'ControlOrMeta';
const SIDES = ['left', 'right'];
const session = await open(process.argv.includes('--boxes') ? 'harness/?boxes=320x480' : 'harness/', { headless: !process.argv.includes('--headed') });
const { page, context, url } = session;
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
await page.waitForFunction(() => window.harness && document.getElementById('toolbar').textContent.includes('equal'));
const cdp = await context.newCDPSession(page);

// The input events each view's root saw during an act, for the notes on composition and dead keys.
await page.evaluate(() => {
  window.eventLog = { left: [], right: [] };
  for (const side of ['left', 'right']) {
    for (const type of ['keydown', 'beforeinput', 'compositionstart', 'compositionupdate', 'compositionend']) {
      window.harness.view(side).dom.addEventListener(type, (e) => window.eventLog[side].push(type === 'keydown' ? `keydown ${e.key}` : type === 'beforeinput' ? `beforeinput ${e.inputType} ${JSON.stringify(e.data)}` : `${type} ${JSON.stringify(e.data)}`), true);
    }
  }
});

const settle = () => page.waitForTimeout(60);
const find = (text, occurrence = 0) => page.evaluate(([t, o]) => window.harness.find(t, o), [text, occurrence]);
const selectionHead = (side) => page.evaluate((s) => window.harness.view(s).state.selection.head, side);

/** Click at `pos` through the side's own coordsAtPos: just inside the character after it, or (bias −1) just inside the one before it. */
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

async function focus(side) {
  await page.evaluate((s) => window.harness.view(s).focus(), side);
  await settle();
}

async function setClipboard({ text, html }) {
  await page.evaluate(async ([t, h]) => {
    const items = { 'text/plain': new Blob([t], { type: 'text/plain' }) };
    if (h) items['text/html'] = new Blob([h], { type: 'text/html' });
    await navigator.clipboard.write([new ClipboardItem(items)]);
  }, [text, html]);
}

/** The acts: each a function performing the act on one side; `target` positions are read from the shared fixed document before the act. */
const acts = [
  { name: 'type a sentence in a paragraph', timed: true, async run(side) { await clickAt(side, await find('The answer is a position')); await page.keyboard.type('Typed here, letter by letter. ', { delay: 25 }); } },
  { name: 'type at a mark boundary (after bold)', async run(side) { await clickAt(side, (await find('fragmentainer')) + 'fragmentainer'.length, { bias: -1 }); await page.keyboard.type('XY'); } },
  { name: 'Enter in a paragraph', async run(side) { await clickAt(side, (await find('The view draws')) + 'The view draws'.length); await page.keyboard.press('Enter'); await page.keyboard.type('new'); } },
  { name: 'Enter in the third-level list item', async run(side) { await clickAt(side, (await find('on the second one.')) + 'on the second one.'.length, { bias: -1 }); await page.keyboard.press('Enter'); await page.keyboard.type('deep'); } },
  { name: 'Backspace at the start of a paragraph (join)', async run(side) { await clickAt(side, await find('ProseMirror keeps')); await page.keyboard.press('Backspace'); } },
  { name: 'Backspace at the start of a list item', async run(side) { await clickAt(side, await find('Its numbering')); await page.keyboard.press('Backspace'); } },
  { name: 'Delete at the end of a paragraph', async run(side) { await clickAt(side, (await find('DOM to learn it.')) + 'DOM to learn it.'.length, { bias: -1 }); await page.keyboard.press('Delete'); } },
  { name: 'Shift+Arrow selection, then type over it', async run(side) { await clickAt(side, await find('answers questions')); for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight'); await settle(); await page.keyboard.type('replies to'); } },
  { name: 'select across two blocks, then Delete', async run(side) { await clickAt(side, await find('history remembers')); await clickAt(side, (await find('Render the document')) + 'Render the'.length, { shift: true }); await page.keyboard.press('Delete'); } },
  { name: 'Mod-b on a selection', async run(side) { await clickAt(side, await find('survives every edit')); for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight'); await settle(); await page.keyboard.press(`${MOD}+b`); } },
  { name: 'Mod-b straight after the Shift+Arrows, with no pause', async run(side) { await clickAt(side, await find('survives every edit')); for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press(`${MOD}+b`); } },
  { name: 'the > input rule at a paragraph start', async run(side) { await clickAt(side, await find('The default fragmentainer')); await page.keyboard.type('> '); } },
  { name: 'Mod-a, then type', async run(side) { await focus(side); await page.keyboard.press(`${MOD}+a`); await page.keyboard.type('All gone.'); } },
  { name: 'paste plain text', async run(side) { await setClipboard({ text: 'pasted plain text\nand a second line' }); await clickAt(side, await find('nobody needs')); await page.keyboard.press(`${MOD}+v`); } },
  { name: 'paste HTML', async run(side) { await setClipboard({ text: 'An HTML paste with a list', html: '<p>An <strong>HTML</strong> paste</p><ul><li><p>with a list</p></li></ul>' }); await clickAt(side, await find('nobody needs')); await page.keyboard.press(`${MOD}+v`); } },
  { name: 'dead key for an accent (Alt+e, then e)', events: true, async run(side) { await clickAt(side, await find('without effort')); await page.keyboard.press('Alt+e'); await page.keyboard.press('e'); } },
  { name: 'IME composition (CDP imeSetComposition, then insertText)', events: true, async run(side) { await clickAt(side, await find('without effort')); await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 }); await cdp.send('Input.imeSetComposition', { text: 'かん', selectionStart: 2, selectionEnd: 2 }); await cdp.send('Input.insertText', { text: '漢' }); } },
  { name: 'a click placing the caret', clicks: true, async run(side) { await clickAt(side, (await find('break token')) + 3); } },
  { name: 'ArrowDown, ArrowDown, ArrowUp across line wraps, then type', async run(side) { await clickAt(side, (await find('The view draws')) + 9); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await settle(); await page.keyboard.type('|'); } },
];

const snapshot = () => page.evaluate(() => ({ left: window.harness.snapshot('left'), right: window.harness.snapshot('right') }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const yes = (b) => (b ? 'yes' : 'no');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

const rows = [];
let timing = null;
for (const act of acts) {
  await page.evaluate(() => { window.harness.reset(); window.eventLog.left.length = window.eventLog.right.length = 0; });
  const notes = [];
  const errors = [];
  const onError = (e) => errors.push(e.message);
  page.on('pageerror', onError);
  const before = await snapshot();
  for (const side of SIDES) {
    await act.run(side);
    await settle();
  }
  const after = await snapshot();
  const docEqual = same(after.left.doc, after.right.doc), selEqual = same(after.left.selection, after.right.selection);
  if (!docEqual) notes.push(`document changed by the act: EditorView ${yes(!same(after.left.doc, before.left.doc))}, FragmentedView ${yes(!same(after.right.doc, before.right.doc))}`);
  if (act.clicks) notes.push(`caret at ${after.left.selection.head} / ${after.right.selection.head}`);
  if (!selEqual) notes.push(`selection ${JSON.stringify(after.left.selection)} / ${JSON.stringify(after.right.selection)}`);
  if (act.events) {
    const log = await page.evaluate(() => window.eventLog);
    notes.push(`right saw: ${[...new Set(log.right)].join('; ')}`);
    const text = (s) => JSON.stringify(after[s].doc).match(/without effort|[^"]{0,12}without effort/)?.[0];
    notes.push(`text before "without effort": ${text('left')} / ${text('right')}`);
  }
  if (act.timed) {
    timing = await page.evaluate(() => JSON.parse(JSON.stringify(window.harness.timings)));
  }
  for (const side of SIDES) { await focus(side); await page.keyboard.press(`${MOD}+z`); await settle(); }
  const undone = await snapshot();
  const undoEqual = same(undone.left.doc, undone.right.doc) && same(undone.left.selection, undone.right.selection);
  const undoRestored = same(undone.right.doc, before.right.doc);
  for (const side of SIDES) { await focus(side); await page.keyboard.press(`Shift+${MOD}+z`); await settle(); }
  const redone = await snapshot();
  const redoEqual = same(redone.left.doc, redone.right.doc) && same(redone.left.selection, redone.right.selection);
  if (!undoEqual) notes.push(`after undo: docs ${yes(same(undone.left.doc, undone.right.doc))}, selections ${JSON.stringify(undone.left.selection)} / ${JSON.stringify(undone.right.selection)}`);
  if (!redoEqual) notes.push(`after redo: docs ${yes(same(redone.left.doc, redone.right.doc))}, selections ${JSON.stringify(redone.left.selection)} / ${JSON.stringify(redone.right.selection)}`);
  if (!undoRestored && !act.clicks) notes.push('undo did not restore the fixed document on the right');
  page.off('pageerror', onError);
  if (errors.length) notes.push(`page errors: ${errors.join(' | ')}`);
  rows.push({ act: act.name, doc: yes(docEqual), selection: yes(selEqual), undo: yes(undoEqual), redo: yes(redoEqual), notes: notes.join('; ') });
}

const header = ['act', 'docs equal', 'selections equal', 'after undo equal', 'after redo equal', 'notes'];
console.log(`| ${header.join(' | ')} |\n| ${header.map(() => ':--').join(' | ')} |`);
for (const r of rows) console.log(`| ${r.act} | ${r.doc} | ${r.selection} | ${r.undo} | ${r.redo} | ${r.notes.replace(/\|/g, '\\|')} |`);
if (timing) {
  const f = (x) => x.toFixed(2);
  console.log(`\nTyping timings over ${timing.right.length} keys (right) and ${timing.left.length} keys (left), milliseconds from keydown to the end of the updateState of the transaction the key made, layout forced:`);
  console.log(`  EditorView:      median ${f(median(timing.left))}, max ${f(Math.max(...timing.left))}`);
  console.log(`  FragmentedView:  median ${f(median(timing.right))}, max ${f(Math.max(...timing.right))}`);
  console.log(`  FragmentedView's own updateState (whole-fragment re-render included, layout not forced): median ${f(median(timing.rightUpdate))}, max ${f(Math.max(...timing.rightUpdate))}`);
}

// The same typing on the fixed document ten times over (4 240 words), for how the whole-fragment re-render scales.
await page.evaluate(() => window.harness.reset(10));
for (const side of SIDES) { await clickAt(side, await find('The answer is a position')); await page.keyboard.type('Typed here, letter by letter. ', { delay: 25 }); await settle(); }
const big = await page.evaluate(() => JSON.parse(JSON.stringify(window.harness.timings)));
const bigEqual = await page.evaluate(() => window.harness.hash(window.harness.left.state.doc.toJSON()) === window.harness.hash(window.harness.right.state.doc.toJSON()));
{
  const f = (x) => x.toFixed(2);
  console.log(`\nThe same on the document ten times over (documents equal after: ${yes(bigEqual)}):`);
  console.log(`  EditorView:      median ${f(median(big.left))}, max ${f(Math.max(...big.left))}`);
  console.log(`  FragmentedView:  median ${f(median(big.right))}, max ${f(Math.max(...big.right))}`);
  console.log(`  FragmentedView's own updateState: median ${f(median(big.rightUpdate))}, max ${f(Math.max(...big.rightUpdate))}`);
}
await session.close();
