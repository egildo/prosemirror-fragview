import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, page, c;
before(async () => {
  session = await open('test/blank.html');
  ({ page } = session);
  await page.evaluate(() => import('/test/home-end.fixtures.js'));
  await page.evaluate(() => window.fixture.fresh());
  c = await page.evaluate(() => window.fixture.cases());
});
after(() => session?.close());

const place = (pos, anchor) => page.evaluate(([p, a]) => window.fixture.place(p, a), [pos, anchor ?? pos]);
const read = () => page.evaluate(() => window.fixture.read());
const middle = (line) => Math.floor((line.first + line.last) / 2);

test('End moves the caret to the end of its visible line, not the paragraph, and the window does not scroll', async () => {
  const start = await place(middle(c.wrapped));
  assert.ok(start.scrollTop > 0, 'the window is scrolled before the key');
  await page.keyboard.press('End');
  const now = await read();
  assert.equal(now.prevented, true);
  assert.equal(now.head, c.wrapped.last);
  assert.equal(now.anchor, c.wrapped.last);
  assert.equal(now.scrollTop, start.scrollTop);
});

test('Home moves the caret to the start of its visible line, and the window does not scroll', async () => {
  const start = await place(middle(c.wrapped));
  await page.keyboard.press('Home');
  const now = await read();
  assert.equal(now.prevented, true);
  assert.equal(now.head, c.wrapped.first);
  assert.equal(now.scrollTop, start.scrollTop);
});

test('an end of line stays on its line: End twice stands, and Home from there goes to the same line start', async () => {
  await place(middle(c.wrapped));
  await page.keyboard.press('End');
  await page.keyboard.press('End');
  assert.equal((await read()).head, c.wrapped.last);
  await page.keyboard.press('Home');
  assert.equal((await read()).head, c.wrapped.first);
});

test('Shift+End and Shift+Home extend the selection from the caret to the line edge', async () => {
  const pos = middle(c.wrapped);
  await place(pos);
  await page.keyboard.press('Shift+End');
  let now = await read();
  assert.deepEqual([now.anchor, now.head], [pos, c.wrapped.last]);
  await page.keyboard.press('Shift+Home');
  now = await read();
  assert.deepEqual([now.anchor, now.head], [pos, c.wrapped.first]);
});

test('Home and End with Cmd, Ctrl or Alt are left to the browser', async () => {
  for (const mod of ['Meta', 'Control', 'Alt']) {
    for (const key of ['Home', 'End']) {
      await place(middle(c.wrapped));
      await page.keyboard.press(`${mod}+${key}`);
      assert.equal((await read()).prevented, false, `${mod}+${key}`);
    }
  }
});

test('End leaves a node selection alone', async () => {
  const start = await page.evaluate(() => window.fixture.selectImage());
  assert.equal(start.kind, 'NodeSelection');
  await page.keyboard.press('End');
  const now = await read();
  assert.deepEqual([now.kind, now.anchor, now.head], [start.kind, start.anchor, start.head]);
});

test('End on the last line of a page goes to that line\'s end on the same page', async () => {
  const start = await place(middle(c.lastOfPage));
  assert.equal(start.headBox, c.page);
  await page.keyboard.press('End');
  const now = await read();
  assert.equal(now.head, c.lastOfPage.last);
  assert.ok(now.head < c.cut, `the head ${now.head} is before the cut ${c.cut}`);
  assert.equal(now.box, c.page, 'the browser\'s caret is in the same box');
});
