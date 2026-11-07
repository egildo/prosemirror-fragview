import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, page;
before(async () => {
  session = await open('test/blank.html');
  page = session.page;
  await page.evaluate(async () => { window.iso = (await import('/test/isolating.fixtures.js')).setup(); });
});
after(() => session?.close());

/** A fresh view, a click at the start or end of `text`, then `key`; the document read back. */
async function press(cells, { at, bias, key, commands = true }) {
  await page.evaluate(([c, k]) => window.iso.make(c, k), [cells, commands]);
  const p = await page.evaluate(([t, b]) => window.iso.point(t, b), [at, bias]);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(60);
  const before = await page.evaluate(() => window.iso.read());
  assert.equal(before.head, p.pos, `the click put the caret at ${p.pos}`);
  await page.keyboard.press(key);
  await page.waitForTimeout(60);
  return page.evaluate(() => window.iso.read());
}

test('Backspace at the start of an isolating node joins nothing', async () => {
  const r = await press([['one'], ['two']], { at: 'two', bias: 1, key: 'Backspace' });
  assert.deepEqual(r.cells, ['one', 'two']);
});

test('Delete at the end of an isolating node joins nothing', async () => {
  const r = await press([['one'], ['two']], { at: 'one', bias: -1, key: 'Delete' });
  assert.deepEqual(r.cells, ['one', 'two']);
});

test('without the commands, Backspace at the start of a paragraph joins nothing: the join is the commands’', async () => {
  const r = await press([['one', 'two']], { at: 'two', bias: 1, key: 'Backspace', commands: false });
  assert.deepEqual(r.paragraphs, [2]);
});

test('with the commands, Backspace at the start of a paragraph still joins it to the one before', async () => {
  const r = await press([['one', 'two']], { at: 'two', bias: 1, key: 'Backspace' });
  assert.deepEqual(r.paragraphs, [1]);
  assert.deepEqual(r.cells, ['onetwo']);
});

test('Backspace inside the text still deletes a character', async () => {
  const r = await press([['one'], ['two']], { at: 'wo', bias: 1, key: 'Backspace' });
  assert.deepEqual(r.cells, ['one', 'wo']);
});
