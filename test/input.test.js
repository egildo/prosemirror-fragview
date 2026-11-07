import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

const MOD = 'ControlOrMeta';

let session, page, cdp;
before(async () => {
  session = await open('test/blank.html');
  ({ page } = session);
  await session.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(session.url).origin });
  cdp = await session.context.newCDPSession(page);
  await page.evaluate(() => import('/test/input.fixtures.js'));
});
after(() => session?.close());

const fresh = (kind, options) => page.evaluate(([k, o]) => window.fixture.fresh(k, o), [kind, options]);
const read = () => page.evaluate(() => window.fixture.quiet().then(() => window.fixture.read()));
const unchanged = (start, now, active) => {
  assert.equal(now.doc, start.doc, 'the document is unchanged');
  assert.equal(now.selection, start.selection, 'the model selection is unchanged');
  assert.equal(now.writes, 0, 'no selection was written');
  assert.equal(now.hasFocus, false, 'hasFocus() is false');
  assert.equal(now.active, active, 'the focus stayed');
};

for (const [kind, selector, active] of [['input', '.k-input', 'k-input'], ['wrapped', '.k-wrapped-input', 'k-wrapped-input'], ['textarea', '.k-textarea', 'k-textarea']]) {
  test(`typing into a toDOM ${kind}: the control holds the text, the document and the selection stand`, async () => {
    const start = await fresh(kind);
    await page.click(selector);
    await page.keyboard.type('hi', { delay: 10 });
    unchanged(start, await read(), active);
    assert.equal(await page.inputValue(selector), 'hi');
  });

  test(`Backspace in a toDOM ${kind} deletes in the control and not in the document`, async () => {
    const start = await fresh(kind);
    await page.click(selector);
    await page.keyboard.type('hi');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    unchanged(start, await read(), active);
    assert.equal(await page.inputValue(selector), '');
  });

  test(`pasting into a toDOM ${kind} goes to the control and leaves the document`, async () => {
    const start = await fresh(kind);
    await page.evaluate(() => navigator.clipboard.writeText('pasted'));
    await page.click(selector);
    await page.keyboard.press(`${MOD}+v`);
    unchanged(start, await read(), active);
    assert.equal(await page.inputValue(selector), 'pasted');
  });

  test(`copy and cut in a toDOM ${kind} leave the model's selection on the clipboard unwritten`, async () => {
    await fresh(kind);
    const { selection: range } = await page.evaluate(() => window.fixture.select(3, 9));
    await page.click(selector);
    const start = await read();
    for (const type of ['copy', 'cut']) {
      const after = await page.evaluate(([s, t]) => window.fixture.clipboard(s, t), [selector, type]);
      assert.equal(after.prevented, false);
      assert.equal(after.written, '');
      assert.equal(after.doc, start.doc);
      assert.equal(after.selection, range);
    }
  });

  test(`a composition in a toDOM ${kind} is the control's: the view does not hold rendering`, async () => {
    const start = await fresh(kind);
    await page.click(selector);
    await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
    await page.waitForTimeout(30);
    assert.equal((await page.evaluate(() => window.fixture.read())).composing, false);
    await cdp.send('Input.insertText', { text: '仮名' });
    unchanged(start, await read(), active);
    assert.equal(await page.inputValue(selector), '仮名');
  });
}

test('a transaction that moves the model selection while a control has focus writes nothing and takes no focus', async () => {
  await fresh('input');
  await page.click('.k-input');
  const now = await page.evaluate(() => window.fixture.select(5));
  assert.equal(now.selection, 'TextSelection 5-5');
  assert.equal(now.active, 'k-input');
  assert.equal(now.writes, 0);
});

test('hasFocus() is true while editing, false in a control, and true again; typing goes where the focus is', async () => {
  const start = await fresh('input');
  assert.equal(start.hasFocus, true);
  assert.equal(start.active, 'root');
  const { x, y } = await page.evaluate(() => window.fixture.pointInText());
  await page.mouse.click(x, y);
  await page.keyboard.type('A');
  const editing = await read();
  assert.equal(editing.hasFocus, true);
  assert.equal(editing.text.length, start.text.length + 1);
  await page.click('.k-input');
  await page.keyboard.type('hi');
  const inControl = await read();
  assert.equal(inControl.hasFocus, false);
  assert.equal(inControl.doc, editing.doc);
  assert.equal(await page.inputValue('.k-input'), 'hi');
  await page.mouse.click(x, y);
  await page.keyboard.type('B');
  const back = await read();
  assert.equal(back.hasFocus, true);
  assert.equal(back.active, 'root');
  assert.equal(back.text.length, start.text.length + 2);
});

test('the focus coming back by the keyboard finds the model\'s selection, and typing lands there', async () => {
  await fresh('input');
  await page.evaluate(() => window.fixture.select(3));
  await page.click('.k-input');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('Z');
  const now = await read();
  assert.equal(now.active, 'root');
  assert.match(now.text, /^ThZe paragraph/);
});

test('Shift+click after a control keeps the anchor the model had', async () => {
  await fresh('input');
  await page.evaluate(() => window.fixture.select(3));
  await page.click('.k-input');
  const { x, y } = await page.evaluate(() => window.fixture.pointInText());
  await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  await page.keyboard.up('Shift');
  const now = await read();
  assert.match(now.selection, /^TextSelection 3-/);
});

test('hasFocus() is true for a caret in text slotted through a page\'s shadow root, and typing reaches the model', async () => {
  const start = await fresh('input', { shadow: true });
  assert.equal(start.hasFocus, true);
  const { x, y } = await page.evaluate(() => window.fixture.pointInText());
  await page.mouse.click(x, y);
  await page.keyboard.type('A');
  const now = await read();
  assert.equal(now.active, 'root');
  assert.equal(now.hasFocus, true);
  assert.equal(now.text.length, start.text.length + 1);
  await page.click('.k-input');
  await page.keyboard.type('hi');
  assert.equal(await page.inputValue('.k-input'), 'hi');
  assert.equal((await read()).text.length, start.text.length + 1);
});

test('a select: pressing it selects no atom, and its keys are its own', async () => {
  const start = await fresh('select');
  await page.focus('.k-select');
  await page.selectOption('.k-select', 'b');
  await page.keyboard.press('Backspace');
  unchanged(start, await read(), 'k-select');
  assert.equal(await page.inputValue('.k-select'), 'b');
  await page.click('.k-select');
  await page.keyboard.press('Escape');
  const now = await read();
  assert.equal(now.selection, start.selection);
  assert.equal(now.pointer, false);
});

test('a button: a press on it or inside it selects no atom, it clicks, and its keys are its own', async () => {
  const start = await fresh('button');
  await page.evaluate(() => { window.clicks = 0; document.querySelector('.k-button').addEventListener('click', () => window.clicks++); });
  await page.click('.k-button-face');
  assert.equal(await page.evaluate(() => window.clicks), 1);
  await page.keyboard.press('Backspace');
  unchanged(start, await read(), 'k-button');
});

test('a nested editing host in a drawing edits itself: the model stands and the fragment is not refilled', async () => {
  const start = await fresh('nested');
  await page.click('.k-nested-host');
  await page.keyboard.type('xy');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  const now = await read();
  unchanged(start, now, 'k-nested-host');
  assert.equal(now.fills, start.fills);
  assert.match(now.html, /xy|editxy|xyedit/);
});

test('an input in an open shadow root inside a drawing is seen through the retargeting', async () => {
  const start = await fresh('shadow');
  await page.click('.in-shadow');
  await page.keyboard.type('hi');
  await page.keyboard.press('Backspace');
  const now = await read();
  assert.equal(now.doc, start.doc);
  assert.equal(now.selection, start.selection);
  assert.equal(now.writes, 0);
  assert.equal(now.hasFocus, false);
  assert.equal(now.shadowActive, 'in-shadow');
  assert.equal(await page.inputValue('.in-shadow'), 'h');
});

test('an element that stops propagation at its own root needs no word from the view', async () => {
  const start = await fresh('stopper');
  await page.click('.k-stopper');
  await page.keyboard.press('Backspace');
  unchanged(start, await read(), 'k-stopper');
});

for (const [kind, selector] of [['text', '.k-text'], ['focusable', '.k-focusable'], ['link', '.k-link']]) {
  test(`a click on a ${kind} leaf selects the atom with the focus on the root, and the keys go on from it`, async () => {
    const start = await fresh(kind);
    await page.click(selector);
    const selected = await read();
    assert.equal(selected.selection, `NodeSelection 27-28`);
    assert.equal(selected.active, 'root');
    assert.equal(selected.hasFocus, true);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('Z');
    const typed = await read();
    assert.equal(typed.active, 'root');
    assert.equal(typed.text.length, start.text.length + 1);
    assert.match(typed.selection, /^TextSelection 29-29/);
  });
}

const clickChar = async (selector) => {
  const at = await page.evaluate((s) => window.fixture.charOf(s), selector);
  await page.mouse.click(at.x, at.y);
  return at;
};

for (const selector of ['.k-tab', '.k-tabblock', '.k-caption', '.k-beside-hole', '.k-plain']) {
  test(`a click in document text held by ${selector} moves the model selection there, and typing lands there`, async () => {
    await page.evaluate(() => window.fixture.freshHolders());
    await page.evaluate(() => window.fixture.select(3));
    const at = await clickChar(selector);
    const clicked = await read();
    assert.equal(clicked.selection, `TextSelection ${at.pos}-${at.pos}`);
    await page.keyboard.type('Z');
    const typed = await read();
    assert.ok(typed.text.includes(at.typed), `Z went elsewhere: ${typed.text}`);
    assert.equal(typed.selection, `TextSelection ${at.pos + 1}-${at.pos + 1}`);
  });
}

test('clicks in turn on focusable marks follow each click, from a control too, and Z lands at the last', async () => {
  await page.evaluate(() => window.fixture.freshHolders());
  for (const selector of ['.k-tab', '.k-tabblock', '.k-tab-two']) {
    const at = await clickChar(selector);
    assert.equal((await read()).selection, `TextSelection ${at.pos}-${at.pos}`, selector);
  }
  await page.click('.k-input');
  await page.keyboard.type('hi');
  assert.equal(await page.inputValue('.k-input'), 'hi');
  const at = await clickChar('.k-tab');
  assert.equal((await read()).selection, `TextSelection ${at.pos}-${at.pos}`, 'from the control');
  await page.keyboard.type('Z');
  assert.ok((await read()).text.includes(at.typed));
});

test('a button beside a content hole keeps its press: the view takes no pointer and the document stands', async () => {
  const start = await page.evaluate(() => window.fixture.freshHolders());
  await page.mouse.move(...(await page.locator('.k-beside').boundingBox().then((b) => [b.x + 3, b.y + 3])));
  await page.mouse.down();
  const pressed = await page.evaluate(() => window.fixture.read());
  await page.mouse.up();
  assert.equal(pressed.pointer, false);
  assert.equal((await read()).doc, start.doc);
});

test('a page not yet refilled answers old positions: the walk does not throw, and a foreign write there is no error', async () => {
  await page.evaluate(() => window.fixture.freshLong());
  const out = await page.evaluate(() => window.fixture.staleWindow());
  assert.equal(out.connected, true, 'the last page is still drawn in the window');
  assert.ok(out.stale > out.size, `${out.stale} past ${out.size}`);
  assert.equal(out.leaf, null);
  assert.ok(out.coords === null || typeof out.coords === 'object', String(out.coords));
  assert.deepEqual(out.errors, []);
  assert.equal(out.shown.replace(/\s+/g, ''), out.model.replace(/\s+/g, ''));
});

test('a custom element in a leaf that appends text to itself causes no refill and no warning', async () => {
  await fresh('writer');
  const out = await page.evaluate(() => window.fixture.selfWrites('.k-writer'));
  assert.equal(out.fills, 0);
  assert.equal(out.warnings, 0);
  assert.match(out.shown, /tick 5/);
});

test('text changed in place in a leaf\'s drawing is the drawing\'s', async () => {
  await fresh('text');
  const out = await page.evaluate(() => window.fixture.atomTextWrite());
  assert.equal(out.fills, 0);
  assert.equal(out.shown, 'Tiber');
});

test('a foreign write into ordinary text beside a leaf is still drawn over from the model', async () => {
  await fresh('text');
  const out = await page.evaluate(() => window.fixture.foreignWrite());
  assert.equal(out.beside.fills, 1);
  assert.equal(out.beside.drawn, 'Rome and some text after it.');
  assert.equal(out.added.fills, 1);
  assert.equal(out.added.drawn, 'The paragraph after it.');
});

test('docView is truthy while the view lives and null after destroy', async () => {
  await fresh('text');
  assert.deepEqual(await page.evaluate(() => window.fixture.docViewLife()), { alive: true, gone: null });
});
