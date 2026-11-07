import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../scripts/browser.mjs';

let session, page;
before(async () => {
  session = await open('test/blank.html');
  ({ page } = session);
  await page.evaluate(() => {
    if (!document.getElementById('host')) document.body.insertAdjacentHTML('beforeend', '<div id="host"></div>');
    return import('/test/faces.fixtures.js');
  });
});
after(() => session?.close());

const fresh = (doc, options) => page.evaluate(([d, o]) => window.fixture.fresh(d, o), [doc, options]);
const settle = () => page.evaluate(() => window.fixture.settled());
const logged = () => page.evaluate(() => { const { log } = window.fixture; return { ...log }; });

test('a node view for anything but a leaf is refused by name', async () => {
  for (const [name, says] of [['paragraph', 'nodeViews["paragraph"] is refused'], ['text', 'text is drawn by the renderer']]) {
    const refusal = await page.evaluate((n) => window.fixture.construct({ [n]: () => ({ dom: document.createElement('div') }) }), name);
    assert.equal(refusal?.name, 'RangeError', name);
    assert.match(refusal.message, new RegExp(says.replace(/[[\]"]/g, '\\$&')));
  }
});

test('a name the schema lacks is passed over, as prosemirror-view does', async () => {
  assert.equal(await page.evaluate(() => window.fixture.construct({ nothing: () => ({ dom: document.createElement('div') }) })), null);
});

test('a view that answers a contentDOM says so, and the node keeps its drawing', async () => {
  await page.evaluate(() => window.fixture.fresh('one', { nodeViews: { embed: () => ({ dom: document.createElement('div'), contentDOM: document.createElement('div') }) } }));
  await page.evaluate(() => new Promise((r) => setTimeout(r, 20)));
  assert.ok((await logged()).errors.some((m) => m.includes('contentDOM')));
  assert.equal(await page.locator('#host img.drawn').count(), 1);
});

test('markViews are said to be unread, once', async () => {
  await page.evaluate(() => window.fixture.fresh('one', { nodeViews: {} }));
  await page.evaluate(() => { window.view.setProps({ markViews: { em: () => ({}) } }); window.view.setProps({ markViews: { em: () => ({}) } }); });
  assert.equal((await logged()).warnings.filter((m) => m.includes('markViews')).length, 1);
});

test('with no node view nothing is wrapped', async () => {
  await page.evaluate(() => window.fixture.fresh('one', { nodeViews: {} }));
  assert.equal(await page.locator('#host [data-fragview-face]').count(), 0);
  assert.equal(await page.locator('#host img.drawn').count(), 1);
});

test('a constructor that answers nothing leaves the drawing, in its stand-in', async () => {
  await page.evaluate(() => window.fixture.fresh('one', { nodeViews: { embed: () => null } }));
  assert.equal(await page.locator('#host [data-fragview-face] img.drawn').count(), 1);
});

test('a plugin\'s nodeViews are read', async () => {
  assert.equal(await fresh('one', { inPlugin: true }), 1);
});

test('the stand-in keeps a percentage: a block wrapper is display block, an inline one display inline, and each is uneditable', async () => {
  const shapes = await page.evaluate(async () => {
    const { sliceRenderer } = await import('/src/index.js');
    const { schema, DOCS } = window.fixture;
    const render = sliceRenderer(undefined, { has: (type) => type.isLeaf, sizeOf: () => null });
    const read = (doc) => [...render(doc, 0, null).fragment.querySelectorAll('[data-fragview-face]')].map((w) => [w.localName, w.style.display, w.getAttribute('contenteditable'), w.firstElementChild.localName]);
    return { block: read(DOCS.one()), inline: read(DOCS.chip()), schema: !!schema };
  });
  assert.deepEqual(shapes.block, [['div', 'block', 'false', 'img']]);
  assert.deepEqual(shapes.inline, [['span', 'inline', 'false', 'img']]);
});

test('a size from the pool pins the drawing inside the wrapper, border box included', async () => {
  const style = await page.evaluate(async () => {
    const { sliceRenderer } = await import('/src/index.js');
    const render = sliceRenderer(undefined, { has: (type) => type.isLeaf, sizeOf: () => ({ inline: 123, block: 45 }) });
    const block = render(window.fixture.DOCS.one(), 0, null).fragment.querySelector('[data-fragview-face] > img');
    const inline = render(window.fixture.DOCS.chip(), 0, null).fragment.querySelector('[data-fragview-face] > img');
    return [block.style.inlineSize, block.style.blockSize, block.style.boxSizing, block.style.display, inline.style.display];
  });
  assert.deepEqual(style, ['123px', '45px', 'border-box', 'block', 'inline-block']);
});

test('the geometry answers through the wrapper: nodeDOM, posAtDOM, posAtCoords, coordsAtPos', async () => {
  await fresh('one');
  const read = await page.evaluate(() => {
    const { view } = window, pos = window.fixture.posOf(), face = view.dom.querySelector('.face');
    const wrapper = face.parentElement, r = face.getBoundingClientRect();
    return {
      pos,
      isWrapper: view.nodeDOM(pos) === wrapper && wrapper.hasAttribute('data-fragview-face'),
      atDOM: view.posAtDOM(face.firstChild, 0),
      inside: view.posAtCoords({ left: r.left + 5, top: r.top + 5 })?.inside,
      left: view.coordsAtPos(pos).left,
      wrapperLeft: wrapper.getBoundingClientRect().left,
      getPos: window.fixture.args[2](),
      decorations: window.fixture.args[3],
      sameView: window.fixture.args[1] === view,
    };
  });
  assert.equal(read.isWrapper, true);
  assert.equal(read.atDOM, read.pos);
  assert.equal(read.inside, read.pos);
  assert.equal(read.left, read.wrapperLeft);
  assert.equal(read.getPos, read.pos);
  assert.deepEqual(read.decorations, []);
  assert.equal(read.sameView, true);
});

test('getPos follows the document, and a kept element after a refill', async () => {
  await fresh('one');
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const face = view.dom.querySelector('.face');
    view.dispatch(view.state.tr.insertText('xyz', 1));
    await fixture.settled();
    return { same: view.dom.querySelector('.face') === face, getPos: fixture.args[2](), pos: fixture.posOf(), made: fixture.log.made };
  });
  assert.equal(read.same, true);
  assert.equal(read.getPos, read.pos);
  assert.equal(read.made, 1);
});

test('state held in the element lives through a refill: an iframe\'s document, a focused input\'s focus and value', async () => {
  await fresh('one');
  await page.locator('#host .face-input').click();
  await page.keyboard.type('held');
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const frame = view.dom.querySelector('.face iframe');
    if (frame.contentDocument.readyState !== 'complete' || !frame.contentDocument.body?.textContent) await new Promise((r) => frame.addEventListener('load', r, { once: true }));
    frame.contentDocument.body.textContent = 'written';
    let loads = 0;
    frame.addEventListener('load', () => loads++);
    const fills = view.fillCount.get(view.entries[0].key);
    view.dispatch(view.state.tr.insertText('xyz', 1));
    await fixture.settled();
    await new Promise((r) => setTimeout(r, 50));
    const input = view.dom.querySelector('.face-input');
    return { refilled: view.fillCount.get(view.entries[0].key) > fills, text: view.dom.querySelector('.face iframe').contentDocument.body.textContent, loads, value: input.value, focused: document.activeElement === input };
  });
  assert.deepEqual(read, { refilled: true, text: 'written', loads: 0, value: 'held', focused: true });
});

test('a cut that moves takes the same element to the next box', async () => {
  await fresh('foot', { box: 100 });
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const face = view.dom.querySelector('.face');
    const before = fixture.entryOf(face);
    const text = (n) => fixture.schema.node('paragraph', null, [fixture.schema.text(n)]);
    view.dispatch(view.state.tr.insert(0, [text('New one.'), text('New two.'), text('New three.'), text('New four.')]));
    await fixture.settled();
    const now = view.dom.querySelector('.face');
    return { before, after: fixture.entryOf(now), same: now === face, made: fixture.log.made, destroyed: fixture.log.destroyed };
  });
  assert.ok(read.after > read.before, `the leaf moved from box ${read.before} to box ${read.after}`);
  assert.equal(read.same, true);
  assert.equal(read.made, 1);
  assert.equal(read.destroyed, 0);
});

test('setNodeMarkup: update is asked once with the new node, and true keeps the element', async () => {
  await fresh('one', { update: true });
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const face = view.dom.querySelector('.face');
    view.dispatch(view.state.tr.setNodeAttribute(fixture.posOf(), 'label', 'new'));
    await fixture.settled();
    return { same: view.dom.querySelector('.face') === face };
  });
  const log = await logged();
  assert.equal(read.same, true);
  assert.deepEqual(log.updated, ['new']);
  assert.equal(log.made, 1);
  assert.equal(log.destroyed, 0);
});

test('setNodeMarkup: false destroys the element and another is made', async () => {
  await fresh('one', { update: false });
  await page.evaluate(async () => {
    const { view, fixture } = window;
    view.dispatch(view.state.tr.setNodeAttribute(fixture.posOf(), 'label', 'new'));
    await fixture.settled();
  });
  const log = await logged();
  assert.deepEqual(log.updated, ['new']);
  assert.equal(log.made, 2);
  assert.equal(log.destroyed, 1);
  assert.equal(await page.locator('#host .face').count(), 1);
});

test('a view with no update keeps its element only under the same markup', async () => {
  await fresh('one');
  await page.evaluate(async () => {
    const { view, fixture } = window;
    view.dispatch(view.state.tr.setNodeAttribute(fixture.posOf(), 'label', 'new'));
    await fixture.settled();
  });
  const log = await logged();
  assert.equal(log.made, 2);
  assert.equal(log.destroyed, 1);
});

test('update is not offered a face whose own node still stands in the document', async () => {
  await fresh('two', { box: 100, update: true });
  await page.evaluate(async () => {
    const { view, fixture } = window;
    view.dispatch(view.state.tr.insert(0, fixture.embed({ label: 'new' })));
    await fixture.settled();
  });
  const log = await logged();
  assert.deepEqual(log.updated, []);
  assert.equal(log.made, 3);
  assert.equal(log.destroyed, 0);
});

test('deleting the node destroys the face once the chain settles, and getPos answers undefined', async () => {
  await fresh('one');
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const getPos = fixture.args[2], pos = fixture.posOf();
    view.dispatch(view.state.tr.delete(pos, pos + 1));
    await fixture.settled();
    return { getPos: getPos() === undefined, left: document.querySelectorAll('.face').length };
  });
  assert.deepEqual(read, { getPos: true, left: 0 });
  assert.equal((await logged()).destroyed, 1);
});

test('view.destroy destroys every face and leaves nothing in the document', async () => {
  await fresh('two');
  const left = await page.evaluate(() => { window.view.destroy(); return document.querySelectorAll('.face').length; });
  assert.equal(left, 0);
  assert.equal((await logged()).destroyed, 2);
});

test('under the near window a far face is destroyed, and made when its page comes near', async () => {
  await fresh('long', { box: 200, window: { build: 'near', margin: 0 } });
  assert.equal(await page.evaluate(() => document.querySelectorAll('.face').length), 0, 'the far page is not built');
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const { TextSelection } = fixture;
    const settle = async () => { await fixture.settled(); await new Promise((r) => setTimeout(r, 100)); await fixture.settled(); };
    // The head's page is always built: a selection near the leaf brings its page, and a selection at the start lets it go.
    const toLeaf = () => view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(fixture.posOf() + 1), 1)));
    toLeaf();
    await settle();
    const made = fixture.log.made;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    window.scrollTo(0, 0);
    await settle();
    const destroyed = fixture.log.destroyed;
    toLeaf();
    await settle();
    return { made, destroyed, again: fixture.log.made, shown: document.querySelectorAll('.face').length };
  });
  assert.deepEqual(read, { made: 1, destroyed: 1, again: 2, shown: 1 });
});

test('stopEvent true: typing stays in the input, and the document, the selection and the focus stand', async () => {
  await fresh('one', { stop: true });
  const start = await page.evaluate(() => ({ doc: window.view.state.doc.textContent, selection: window.view.state.selection.toJSON() }));
  await page.locator('#host .face-input').click();
  await page.keyboard.type('hi');
  await page.keyboard.press('Backspace');
  const read = await page.evaluate(() => ({ doc: window.view.state.doc.textContent, selection: window.view.state.selection.toJSON(), value: document.querySelector('.face-input').value, active: document.activeElement.className, hasFocus: window.view.hasFocus() }));
  assert.deepEqual(read, { ...start, value: 'h', active: 'face-input', hasFocus: false });
});

test('stopEvent false gives the event to the view, a control or not', async () => {
  await fresh('one', { stop: false });
  const taken = await page.evaluate(() => {
    let seen = 0;
    window.view.setProps({ handleDOMEvents: { keydown: () => { seen++; return false; } } });
    document.querySelector('.face-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true }));
    return seen;
  });
  assert.equal(taken, 1);
});

test('a face with no stopEvent still has its control\'s input, and the document stands', async () => {
  await fresh('one');
  const doc = await page.evaluate(() => window.view.state.doc.textContent);
  await page.locator('#host .face-input').click();
  await page.keyboard.type('hi');
  assert.equal(await page.inputValue('#host .face-input'), 'hi');
  assert.equal(await page.evaluate(() => window.view.state.doc.textContent), doc);
});

test('a node selection selects the face, and the next selection deselects it', async () => {
  await fresh('one');
  const read = await page.evaluate(() => {
    const { view, fixture } = window;
    const face = view.dom.querySelector('.face');
    view.dispatch(view.state.tr.setSelection(fixture.NodeSelection.create(view.state.doc, fixture.posOf())));
    const on = face.classList.contains('ProseMirror-selectednode');
    view.dispatch(view.state.tr.setSelection(fixture.TextSelection.create(view.state.doc, 1)));
    return { on, off: face.classList.contains('ProseMirror-selectednode') };
  });
  assert.deepEqual(read, { on: true, off: false });
});

test('a view\'s own selectNode and deselectNode are asked instead of the class', async () => {
  const read = await page.evaluate(async () => {
    const calls = [];
    const dom = document.createElement('div');
    dom.style.cssText = 'width: 200px; height: 60px';
    await window.fixture.fresh('one', { nodeViews: { embed: () => ({ dom, selectNode: () => calls.push('select'), deselectNode: () => calls.push('deselect') }) } });
    const { view, fixture } = window;
    view.dispatch(view.state.tr.setSelection(fixture.NodeSelection.create(view.state.doc, fixture.posOf())));
    view.dispatch(view.state.tr.insertText('x', 1));
    await fixture.settled();
    view.dispatch(view.state.tr.setSelection(fixture.TextSelection.create(view.state.doc, 1)));
    return { calls, cls: dom.classList.contains('ProseMirror-selectednode') };
  });
  assert.deepEqual(read, { calls: ['select', 'deselect'], cls: false });
});

test('a face that writes text to itself refills nothing, and ignoreMutation false asks for a refill', async () => {
  await fresh('one');
  const quiet = await page.evaluate(async () => {
    const { view } = window;
    const fills = view.fillCount.get(view.entries[0].key);
    view.dom.querySelector('.face').appendChild(document.createTextNode('own text'));
    await new Promise((r) => setTimeout(r, 50));
    return view.fillCount.get(view.entries[0].key) - fills;
  });
  assert.equal(quiet, 0);
  await fresh('one', { ignores: false });
  const loud = await page.evaluate(async () => {
    const { view } = window;
    const fills = view.fillCount.get(view.entries[0].key);
    view.dom.querySelector('.face').appendChild(document.createTextNode('own text'));
    await new Promise((r) => setTimeout(r, 50));
    return view.fillCount.get(view.entries[0].key) - fills;
  });
  assert.ok(loud >= 1);
});

test('a face that grows refills its box, and the next cut is made against its size', async () => {
  await fresh('foot', { box: 100 });
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const face = view.dom.querySelector('.face');
    const box = fixture.entryOf(face);
    const to = view.entries[box].to;
    face.style.height = '95px';
    await new Promise((r) => setTimeout(r, 100));
    await fixture.settled();
    return { to, now: view.entries[box].to, same: view.dom.querySelector('.face') === face, height: face.offsetHeight };
  });
  assert.notEqual(read.now, read.to, 'the cut moved');
  assert.equal(read.same, true);
  assert.equal(read.height, 95);
});

test('a drawing that lies about its size costs one more fill, and the cut is made at the face\'s size', async () => {
  await fresh('foot', { box: 100, height: 95 });
  const read = await page.evaluate(() => {
    const { view, fixture } = window;
    const face = view.dom.querySelector('.face');
    const box = view.entries[fixture.entryOf(face)];
    const rect = view.containers.get(box.key).dom.getBoundingClientRect();
    return { height: face.offsetHeight, inside: face.getBoundingClientRect().bottom <= rect.bottom + 0.5, pinned: fixture.log.made };
  });
  assert.equal(read.height, 95);
  assert.equal(read.inside, true, 'the face stands inside its box');
  assert.equal(read.pinned, 1);
});

test('where moveBefore is missing the face still moves, at the cost of its state', async () => {
  await fresh('one');
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const kept = Element.prototype.moveBefore;
    delete Element.prototype.moveBefore;
    try {
      const face = view.dom.querySelector('.face');
      view.dispatch(view.state.tr.insertText('xyz', 1));
      await fixture.settled();
      return { same: view.dom.querySelector('.face') === face, missing: typeof document.body.moveBefore };
    } finally {
      Element.prototype.moveBefore = kept;
    }
  });
  assert.deepEqual(read, { same: true, missing: 'undefined' });
});

test('an inline leaf gets its face in the line', async () => {
  const read = await page.evaluate(async () => {
    const dom = document.createElement('b');
    dom.className = 'chip-face';
    dom.textContent = 'chip';
    await window.fixture.fresh('chip', { nodeViews: { chip: () => ({ dom }) } });
    const { view, fixture } = window;
    const wrapper = dom.parentElement;
    return { name: wrapper.localName, display: wrapper.style.display, pos: view.posAtDOM(dom, 0) === fixture.posOf('chip'), inParagraph: wrapper.parentElement.localName };
  });
  assert.deepEqual(read, { name: 'span', display: 'inline', pos: true, inParagraph: 'p' });
});
