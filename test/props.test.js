import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, page;
before(async () => {
  session = await open('test/blank.html');
  ({ page } = session);
  await page.evaluate(() => import('/test/props.fixtures.js'));
});
after(() => session?.close());

const call = (name) => page.evaluate((n) => window.fixture[n](), name);
const fresh = () => call('fresh');

test('a handleDOMEvents handler runs for an event the view has no handler of its own for, from a plugin and from the direct props', async () => {
  await fresh();
  await page.evaluate(() => { window.fixture.fire('x-ping'); window.fixture.fire('x-direct'); });
  assert.deepEqual(await call('read'), [['plugin', 'x-ping'], ['direct', 'x-direct']]);
});

test('a handleDOMEvents handler registered after construction, by a plugin in a new state or by setProps, runs', async () => {
  await fresh();
  await call('later');
  await page.evaluate(() => { window.fixture.fire('x-later'); window.fixture.fire('x-set'); });
  assert.deepEqual(await call('read'), [['later', 'x-later'], ['set', 'x-set']]);
});

test('handleDOMEvents.focus and blur run', async () => {
  await fresh();
  await call('focusAndBlur');
  assert.deepEqual(await call('read'), [['plugin', 'focus'], ['plugin', 'blur']]);
});

test('a paste holding only a file reaches handlePaste with an empty slice', async () => {
  await fresh();
  const r = await call('pasteFile');
  assert.equal(r.prevented, true);
  assert.deepEqual((await call('read')).filter(([n]) => n === 'handlePaste'), [['handlePaste', 0]]);
});

test('transformPastedText, transformPastedHTML and transformPasted apply to a paste', async () => {
  await fresh();
  assert.match((await call('pasteText')).text, /LOWER/);
  assert.match((await call('pasteHTML')).text, /upper/);
  assert.equal((await call('read')).filter(([n]) => n === 'transformPasted').length, 2);
});

const box = async () => {
  const r = await page.evaluate(() => { const range = document.createRange(); const t = document.querySelector('#view p').firstChild; range.setStart(t, 3); range.setEnd(t, 4); const b = range.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  return r;
};
const named = (log, kind) => log.filter(([n]) => n.startsWith(kind));

test('a click asks handleClickOn for the textblock and handleClick', async () => {
  await fresh();
  const { x, y } = await box();
  await page.mouse.click(x, y);
  const log = await call('read');
  assert.deepEqual(named(log, 'handleClickOn'), [['handleClickOn', 'paragraph', 0, true]]);
  assert.deepEqual(log.filter(([n]) => n === 'handleClick'), [['handleClick', 'number']]);
});

test('a double and a triple click ask their handlers, the On form for the textblock first', async () => {
  await fresh();
  const { x, y } = await box();
  await page.mouse.click(x, y, { clickCount: 2 });
  let log = await call('read');
  assert.deepEqual(named(log, 'handleDoubleClick'), [['handleDoubleClickOn', 'paragraph', 0, true], ['handleDoubleClick', 'number']]);
  await fresh();
  await page.mouse.click(x, y, { clickCount: 3 });
  log = await call('read');
  assert.deepEqual(named(log, 'handleTripleClick'), [['handleTripleClickOn', 'paragraph', 0, true], ['handleTripleClick', 'number']]);
});

/** The root's attributes at each step of the fixture: without the prop, with a direct object and two plugins, after a state that changes a plugin's answer, after `setProps`, and after `setProps` drops the direct object. */
let steps;
const attributeSteps = async () => (steps ??= await call('attributesProp'));

test('without any attributes prop the root has role="textbox" and aria-multiline="true", beside its own class and opt-outs', async () => {
  const [plain] = await attributeSteps();
  assert.equal(plain.role, 'textbox');
  assert.equal(plain['aria-multiline'], 'true');
  assert.equal(plain.class, 'fragview');
  assert.equal(plain.translate, 'no');
});

test('a direct attributes object and a plugin\'s function of the state reach the root, the first to give a name winning, classes and styles adding up in plugin order', async () => {
  const [, first] = await attributeSteps();
  assert.equal(first['aria-label'], 'Body');
  assert.equal(first['data-direct'], 'yes');
  assert.deepEqual(first.class.split(' '), ['fragview', 'one', 'later']);
  assert.match(first.style, /margin: 2px/);
  assert.match(first.style, /color: red/);
  assert.match(first.style, /white-space: break-spaces/);
});

test('a prop giving role replaces the default role and its aria-multiline', async () => {
  const [, first] = await attributeSteps();
  assert.equal(first.role, 'document');
  assert.equal(first['aria-multiline'], undefined);
});

test('the attributes prop cannot override contenteditable, translate or the writer opt-outs', async () => {
  const [, first] = await attributeSteps();
  assert.equal(first.contenteditable, 'true');
  assert.equal(first.translate, 'no');
  assert.equal(first['data-gramm'], 'false');
});

test('a new state that changes a plugin\'s answer sets its new attributes and removes those it stopped giving', async () => {
  const [, , changed] = await attributeSteps();
  assert.deepEqual(changed.class.split(' ').sort(), ['fragview', 'later', 'many']);
  assert.equal(changed['data-count'], '2');
  assert.equal(changed['aria-label'], 'Body');
});

test('setProps({ attributes }) sets what the new object gives and removes what the old one gave', async () => {
  const [, , , set, unset] = await attributeSteps();
  assert.equal(set['data-set'], 'on');
  assert.equal(set['data-direct'], undefined);
  assert.equal(set['aria-label'], undefined);
  assert.doesNotMatch(set.style, /margin/);
  assert.match(set.style, /color: red/);
  assert.match(set.style, /white-space: break-spaces/);
  assert.equal(unset['data-set'], undefined);
  assert.equal(unset.role, 'document');
});
