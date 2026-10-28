// usage: node scripts/compose.mjs [--headed] [--boxes] [--generic] — compositions driven through Chromium's input method over CDP (`Input.imeSetComposition` k, か, かn, かな, then `Input.insertText "仮名"`), each performed identically on the EditorView (left) and on the FragmentedView (right) of the harness from a fresh state: in plain text, at both edges of a non-inclusive mark (a link) and of an inclusive one (strong), over a selection, refused by `handleTextInput`, with no `compositionstart` and with one a `handleDOMEvents` handler takes, cancelled, and recomposing the word before the caret through a replacement range, and, under `--boxes`, in a paragraph divided between two boxes. `--boxes` puts the right side under 320 × 480 boxes; `--generic` runs the plain and edge acts on the studio's schema lab under structured marks instead. For each act it prints whether the two documents and selections are equal after the act, after one Mod-z and after Shift-Mod-z, the marks the composed text carries on each side, whether the right side's text is the text a fresh fill of its document draws (the chain invalidated and refilled from the model), after the act and after the undo, and whether it draws the composed text (for a cancelled composition, its last in-progress text) as often as its document holds it, where its DOM caret stands, the steps it applied, and, under `--generic`, whether its mark instances survived and whether a view attribute reached the document. Exits 1 when an act fails any of these.
import { open } from './browser.mjs';

const MOD = 'ControlOrMeta';
const SIDES = ['left', 'right'];
const generic = process.argv.includes('--generic');
const path = `harness/?${[process.argv.includes('--boxes') && 'boxes=320x480', generic && 'schema=generic&marks=structured'].filter(Boolean).join('&')}`;
const session = await open(path, { headless: !process.argv.includes('--headed') });
const { page, context } = session;
await page.waitForFunction(() => window.harness && document.getElementById('toolbar').textContent.includes('equal'), null, { timeout: 60000 });
const cdp = await context.newCDPSession(page);

// The right side's applied steps and the input events its root saw.
await page.evaluate(() => {
  const right = window.harness.right;
  window.steps = [];
  window.events = [];
  const dispatch = right.dispatch.bind(right);
  right.dispatch = (tr) => { if (tr.docChanged) window.steps.push(tr.steps.map((s) => { const j = s.toJSON(); return `${j.stepType} ${j.from}-${j.to}`; }).join(' ')); return dispatch(tr); };
  for (const type of ['compositionstart', 'compositionend']) right.dom.addEventListener(type, (e) => { const n = getSelection().focusNode; window.events.push(`${type} ${JSON.stringify(e.data)} in ${(n?.nodeType === 1 ? n : n?.parentElement)?.localName}`); }, true);
});

const settle = () => page.waitForTimeout(80);
const settled = () => page.waitForFunction(() => window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
const find = (text) => page.evaluate((t) => window.harness.find(t), text);
/** Whether the right side's text is what the chain draws when it is invalidated and filled again from the model; the right is left so refilled. */
async function drawnAsFresh() {
  const drawn = await page.evaluate(() => { const t = window.harness.right.dom.textContent; window.harness.right.invalidate(); return t; });
  await settled();
  return drawn === await page.evaluate(() => window.harness.right.dom.textContent);
}

/** Click at `pos` through the side's own coordsAtPos: just inside the character after it, or (bias −1) just inside the one before it, so the browser puts the caret where a reader's click would. */
async function clickAt(side, pos, bias) {
  const c = await page.evaluate(([s, p, b]) => {
    const view = window.harness.view(s);
    const { node } = view.domAtPos(p);
    (node.nodeType === 1 ? node : node.parentElement).scrollIntoView({ block: 'center' });
    return view.coordsAtPos(p, b);
  }, [side, pos, bias]);
  await page.mouse.click(bias >= 0 ? c.left + 1 : c.left - 1, (c.top + c.bottom) / 2);
  await settle();
}

async function compose(steps = ['k', 'か', 'かn', 'かな'], commit = '仮名') {
  for (const text of steps) { await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length }); await page.waitForTimeout(40); }
  if (commit != null) await cdp.send('Input.insertText', { text: commit });
}

/** The acts: `at` is the model position of the click and its bias; `run` what follows it; `commit` the text committed and `probe` the text counted on the page and in the document. */
const word = generic ? 'marked' : 'Layout API';
const acts = generic ? [
  { name: 'plain text, in a paragraph with structured marks', at: async () => [(await find('abbreviation')) + 3, 1] },
  { name: 'at the end of a structured mark (mark)', at: async () => [(await find('marked')) + 6, -1] },
  { name: 'at the start of a structured mark (mark)', at: async () => [await find('marked'), 1] },
  { name: 'at the end of a link inside spans (a non-inclusive, the spans inclusive)', at: async () => [(await find('tabula rasa')) + 'tabula rasa'.length, -1] },
  { name: 'at the start of a link inside spans', at: async () => [await find('tabula rasa'), 1] },
] : [
  { name: 'plain text', at: async () => [await find('without effort'), 1] },
  { name: 'at the end of a link (non-inclusive)', at: async () => [(await find(word)) + word.length, -1] },
  { name: 'at the start of a link (non-inclusive)', at: async () => [await find(word), 1] },
  { name: 'at the end of strong (inclusive)', at: async () => [(await find('fragmentainer')) + 'fragmentainer'.length, -1] },
  { name: 'at the start of strong (inclusive)', at: async () => [await find('fragmentainer'), 1] },
  { name: 'over a selection of three characters', at: async () => [await find('without effort'), 1], async run() { for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight'); await settle(); await compose(); } },
  { name: 'refused by a handleTextInput that takes the text and does nothing', props: 'refuse', at: async () => [await find('without effort'), 1] },
  { name: 'with no compositionstart (stopped by a capture listener on the window)', undoToClick: true, at: async () => [await find('without effort'), 1], async run() {
    await page.evaluate(() => { window.stopStart = (e) => e.stopImmediatePropagation(); window.addEventListener('compositionstart', window.stopStart, true); });
    await compose();
    await page.evaluate(() => window.removeEventListener('compositionstart', window.stopStart, true));
  } },
  { name: 'compositionstart taken by a handleDOMEvents handler', props: 'takeStart', at: async () => [await find('without effort'), 1] },
  { name: 'cancelled (k, か, then an empty composition)', at: async () => [await find('without effort'), 1], async run() { await compose(['k', 'か', ''], null); }, commit: '', probe: 'か' },
  // Only under boxes: a textblock divided between two boxes, composed in the piece before the cut. The document must keep the piece after it (the read-back parsed only the piece the caret's box shows and deleted the rest).
  { name: 'in a paragraph divided between two boxes', boxes: true, at: async () => [await page.evaluate(() => {
    const { right } = window.harness;
    for (const e of right.entries) {
      if (e.to == null) continue;
      const $to = right.state.doc.resolve(e.to);
      if ($to.parent.isTextblock && $to.parentOffset > 12 && $to.parent.content.size - $to.parentOffset > 5) return e.to - 10;
    }
    return null;
  }), -1] },
  { name: 'recomposing the word before the caret (a replacement range)', at: async () => [(await find('composition')) + 'composition'.length, -1], async run() {
    // The composition is set over the word before the caret, then committed as its correction. Chromium selects the replacement range before `compositionstart`, so this is a reconversion over a selection; Android's composing region, set over text with the selection left collapsed, has no CDP command. The word is in the first textblock, where the editing host's plain-text offsets, which the range counts in, are the text's.
    const offset = await page.evaluate(() => { const s = getSelection(); const r = document.createRange(); r.setStart(document.activeElement, 0); r.setEnd(s.focusNode, s.focusOffset); return r.toString().length; });
    await cdp.send('Input.imeSetComposition', { text: 'compositon', selectionStart: 10, selectionEnd: 10, replacementStart: offset - 11, replacementEnd: offset });
    await page.waitForTimeout(40);
    await cdp.send('Input.insertText', { text: 'compositions' });
  }, commit: 'compositions' },
];

const snapshot = () => page.evaluate(() => ({ left: window.harness.snapshot('left'), right: window.harness.snapshot('right') }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const yes = (b) => (b ? 'yes' : 'no');

/** What the right side draws, and the marks the composed text carries on a side. */
const look = (commit) => page.evaluate((c) => {
  const right = window.harness.right;
  const count = (text) => (c ? text.split(c).length - 1 : 0);
  const marks = (side) => {
    const found = [];
    window.harness.view(side).state.doc.descendants((n) => { if (n.isText && c && n.text.includes(c)) found.push(n.marks.map((m) => m.type.name).join('+') || 'none'); });
    return found.join(',') || '-';
  };
  const sel = getSelection();
  const caret = sel.focusNode && right.dom.contains(sel.focusNode) ? right.posAt(sel.focusNode, sel.focusOffset) : null;
  const instances = (doc) => { const ids = []; doc.descendants((n) => { for (const m of n.marks) if (m.attrs.instance != null) ids.push(m.attrs.instance); }); return [...new Set(ids)]; };
  return {
    marks: { left: marks('left'), right: marks('right') },
    drawn: count(right.dom.textContent), held: count(right.state.doc.textContent),
    caret, head: right.state.selection.head,
    leak: JSON.stringify(right.state.doc.toJSON()).includes('data-txt-i'),
    instances: instances(right.state.doc),
  };
}, commit);

const rows = [];
let failed = false;
for (const act of acts) {
  if (act.boxes && !process.argv.includes('--boxes')) continue;
  const commit = act.commit ?? '仮名';
  const probe = act.probe ?? commit;
  const notes = [];
  await page.evaluate(() => { window.harness.reset(); window.steps.length = window.events.length = 0; });
  await settled();
  const before = await snapshot();
  const instancesBefore = (await look('')).instances;
  const errors = [];
  const onError = (e) => errors.push(e.message);
  page.on('pageerror', onError);
  // A prop set on both views for the act: a handleTextInput refusing the text, or a handleDOMEvents taking compositionstart.
  const setProps = (key, on) => page.evaluate(([k, on]) => { const props = k === 'refuse' ? { handleTextInput: on ? () => true : undefined } : { handleDOMEvents: on ? { compositionstart: () => true } : undefined }; for (const v of [window.harness.left, window.harness.right]) v.setProps(props); }, [key, on]);
  if (act.props) await setProps(act.props, true);
  const heads = {};
  for (const side of SIDES) {
    const [pos, bias] = await act.at();
    await clickAt(side, pos, bias);
    heads[side] = await page.evaluate((s) => window.harness.view(s).state.selection.head, side);
    await (act.run ? act.run() : compose());
    await settle();
  }
  await settled();
  const after = await snapshot();
  if (act.props) await setProps(act.props, false);
  const seen = await look(probe);
  seen.drawsFresh = await drawnAsFresh();
  const steps = await page.evaluate(() => window.steps.slice());
  const events = await page.evaluate(() => window.events.slice());
  const docEqual = same(after.left.doc, after.right.doc), selEqual = same(after.left.selection, after.right.selection);
  if (!docEqual) notes.push(`document changed by the act: EditorView ${yes(!same(after.left.doc, before.left.doc))}, FragmentedView ${yes(!same(after.right.doc, before.right.doc))}`);
  if (!selEqual) notes.push(`selection ${JSON.stringify(after.left.selection)} / ${JSON.stringify(after.right.selection)}`);
  for (const side of SIDES) { await page.evaluate((s) => window.harness.view(s).focus(), side); await settle(); await page.keyboard.press(`${MOD}+z`); await settle(); }
  await settled();
  const undone = await snapshot();
  // An act that changed neither document leaves nothing to undo: its Mod-z is compared on the documents, since EditorView's selection after a focus with nothing to undo is not the composition's (measured: at 1 after the refused act).
  const changed = !same(after.left.doc, before.left.doc) || !same(after.right.doc, before.right.doc);
  // With no compositionstart, EditorView's state had not yet read the click's selectionchange when the composition began (its head measured at 1), so its undo returns there: the right is held to its own click instead.
  const undoEqual = same(undone.left.doc, undone.right.doc) && (!changed || (act.undoToClick ? undone.right.selection.head === heads.right && undone.right.selection.anchor === heads.right : same(undone.left.selection, undone.right.selection)));
  if (act.undoToClick) notes.push(`heads after the click ${heads.left} / ${heads.right}, after undo ${undone.left.selection.head} / ${undone.right.selection.head}`);
  const undoRestored = same(undone.right.doc, before.right.doc);
  for (const side of SIDES) { await page.evaluate((s) => window.harness.view(s).focus(), side); await settle(); await page.keyboard.press(`Shift+${MOD}+z`); await settle(); }
  await settled();
  const redone = await snapshot();
  const redoEqual = same(redone.left.doc, redone.right.doc) && same(redone.left.selection, redone.right.selection);
  if (!undoEqual) notes.push(`after undo: docs ${yes(same(undone.left.doc, undone.right.doc))}, selections ${JSON.stringify(undone.left.selection)} / ${JSON.stringify(undone.right.selection)}`);
  if (!undoRestored) notes.push('one undo did not restore the fixed document on the right');
  const drawnAfterUndo = await drawnAsFresh();
  page.off('pageerror', onError);
  if (errors.length) notes.push(`page errors: ${errors.join(' | ')}`);
  if (generic) {
    const kept = instancesBefore.filter((id) => seen.instances.includes(id)).length;
    notes.push(`instances kept ${kept} of ${instancesBefore.length}, a view attribute in the document: ${yes(seen.leak)}`);
  }
  notes.push(`right saw ${events.join(', ')}`);
  const ok = (docEqual && selEqual && undoEqual && redoEqual && undoRestored && seen.drawsFresh && drawnAfterUndo && seen.drawn === seen.held && seen.caret === seen.head && !seen.leak && (!generic || instancesBefore.every((id) => seen.instances.includes(id))));
  if (!ok) failed = true;
  rows.push([act.name, yes(docEqual), yes(selEqual), yes(undoEqual && undoRestored), yes(redoEqual), `${seen.marks.left} / ${seen.marks.right}`, `${yes(seen.drawsFresh)}, ${seen.drawn} of ${seen.held}, after undo ${yes(drawnAfterUndo)}`, `${seen.caret} / ${seen.head}`, steps.join('; ') || 'none', notes.join('; '), ok ? 'ok' : 'FAILED']);
}

const header = ['act', 'docs equal', 'selections equal', 'one undo restores, equal', 'redo equal', 'marks of the text, left / right', 'right drawn as a fresh fill; the text drawn of held', 'right DOM caret / model head', 'right steps', 'notes', 'verdict'];
console.log(`| ${header.join(' | ')} |\n| ${header.map(() => ':--').join(' | ')} |`);
for (const r of rows) console.log(`| ${r.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`);
const bad = rows.filter((r) => r.at(-1) === 'FAILED').length;
console.log(`\n${rows.length - bad} of ${rows.length} acts as expected${bad ? `, ${bad} FAILED` : ''} (${path}).`);
await session.close();
process.exit(failed ? 1 : 0);
