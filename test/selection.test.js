import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, page;
before(async () => {
  session = await open('test/blank.html');
  ({ page } = session);
  await page.evaluate(() => import('/test/selection.fixtures.js'));
});
after(() => session?.close());

test('a right-click leaves a selection across pages as it was, and the next Shift+Arrow extends it from its own anchor', async () => {
  await page.evaluate(() => window.fixture.fresh());
  const r = await page.evaluate(() => window.fixture.rightClick());
  assert.ok(r.spans, 'the selection spans more than one page');
  await page.keyboard.press('Shift+ArrowRight');
  const now = await page.evaluate(() => window.fixture.read());
  assert.equal(now.anchor, r.anchor);
  assert.equal(now.head, r.head + 1);
});

test('a triple click selects the text of the textblock under it', async () => {
  await page.evaluate(() => window.fixture.fresh());
  const r = await page.evaluate(() => window.fixture.triple());
  assert.equal(r.anchor, r.start);
  assert.equal(r.head, r.end);
});

test('a selection the view builds from two positions asks createSelectionBetween first', async () => {
  await page.evaluate(() => window.fixture.fresh());
  const r = await page.evaluate(() => window.fixture.between());
  assert.ok(r.asked > 0, 'the plugin was asked');
  assert.equal(r.anchor, r.head, 'the plugin\'s answer stands');
});
