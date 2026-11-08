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

test('a node view for text is refused by name', async () => {
  const refusal = await page.evaluate(() => window.fixture.construct({ text: () => ({ dom: document.createElement('div') }) }));
  assert.equal(refusal?.name, 'RangeError');
  assert.match(refusal.message, /nodeViews\["text"\] is refused: text is drawn by the renderer/);
});

test('a block whose view has no contentDOM is admitted, and one that answers a contentDOM is refused because a content hole would be divided', async () => {
  assert.equal(await page.evaluate(() => window.fixture.construct({ table: () => ({ dom: document.createElement('div') }), paragraph: () => ({ dom: document.createElement('div') }) }, 'table')), null);
  await page.evaluate(() => window.fixture.fresh('table', { nodeViews: { table: () => ({ dom: document.createElement('div'), contentDOM: document.createElement('div') }) } }));
  await page.evaluate(() => new Promise((r) => setTimeout(r, 20)));
  assert.ok((await logged()).errors.some((m) => m.includes('the node view for "table" returned a contentDOM; a fragmented view gives a node view only to a node drawn whole, since a content hole would be divided across fragments')));
  assert.equal(await page.locator('#host [data-fragview-face] > table.drawn-table').count(), 1);
});

test('a refused node view arriving with a reconfigured state throws before the view takes the state, which stands with its DOM', async () => {
  await fresh('one');
  assert.deepEqual(await page.evaluate(() => window.fixture.refusedAtRuntime()), { refusal: 'RangeError', sameState: true, sameDom: true });
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

test('a block\'s stand-in wraps the whole drawing, keeps its inside mapped, and pins nothing', async () => {
  const read = await page.evaluate(async () => {
    const { sliceRenderer, pointAt } = await import('/src/index.js');
    const render = sliceRenderer(undefined, { has: (type) => type.name === 'table', sizeOf: () => ({ inline: 123, block: 45 }) });
    const doc = window.fixture.DOCS.table();
    let pos = -1;
    doc.descendants((node, at) => { if (pos < 0 && node.type.name === 'table') pos = at; });
    const { fragment, positions } = render(doc, 0, null);
    const wrapper = fragment.querySelector('[data-fragview-face]');
    const point = pointAt(fragment, positions, pos + 3);
    return { child: wrapper.firstElementChild.localName, rows: wrapper.querySelectorAll('tr').length, blockSize: wrapper.firstElementChild.style.blockSize, display: wrapper.style.display, text: point?.node.textContent, offset: point?.offset };
  });
  assert.deepEqual(read, { child: 'table', rows: 3, blockSize: '', display: 'block', text: 'R1a', offset: 0 });
});

test('a table that fits has its face in its wrapper: getPos answered in the constructor, the wrapper placed, nodeDOM the wrapper and null inside', async () => {
  assert.equal(await fresh('table', { table: true, box: 200 }), 1);
  const read = await page.evaluate(() => {
    const { view, fixture } = window, pos = fixture.posOf('table');
    const face = view.dom.querySelector('.table-face'), wrapper = face.parentElement;
    return {
      constructedAt: fixture.log.positions, pos, placed: wrapper.getAttribute('data-fragview-face'),
      nodeDOM: view.nodeDOM(pos) === wrapper, cell: view.nodeDOM(pos + 2), row: view.nodeDOM(pos + 1),
      edge: view.coordsAtPos(pos + 3).left === wrapper.getBoundingClientRect().left,
    };
  });
  assert.deepEqual(read.constructedAt, [read.pos]);
  assert.equal(read.placed, 'placed');
  assert.equal(read.nodeDOM, true);
  assert.equal(read.cell, null);
  assert.equal(read.row, null);
  assert.equal(read.edge, true);
});

test('a table the cut divides keeps toDOM\'s drawing in a wrapper on each box, none placed, the constructor never runs, and one warning names it', async () => {
  await fresh('tall', { table: true, box: 200 });
  const read = await page.evaluate(() => {
    const { view, fixture } = window;
    const wrappers = [...view.dom.querySelectorAll('[data-fragview-face]')];
    return {
      wrappers: wrappers.map((w) => [w.getAttribute('data-fragview-face'), w.firstElementChild.localName]),
      boxes: new Set(wrappers.map((w) => fixture.entryOf(w))).size,
      made: fixture.log.made,
      warnings: fixture.log.warnings.filter((m) => m.includes('"table"')),
    };
  });
  assert.deepEqual(read.wrappers, [['', 'table'], ['', 'table']]);
  assert.equal(read.boxes, 2);
  assert.equal(read.made, 0);
  assert.equal(read.warnings.length, 1, read.warnings.join('\n'));
  assert.match(read.warnings[0], /stands in more than one fragment/);
});

test('a leaf shown whole in two fragments has one face, in the first, and the second keeps its drawing', async () => {
  await fresh('tallLeaf', { halves: true });
  const read = await page.evaluate(() => {
    const { view, fixture } = window;
    const wrappers = [...view.dom.querySelectorAll('[data-fragview-face]')];
    return {
      faces: [...view.dom.querySelectorAll('.face')].map((f) => fixture.entryOf(f)),
      made: fixture.log.made,
      wrappers: wrappers.map((w) => [fixture.entryOf(w), w.getAttribute('data-fragview-face'), w.firstElementChild.className]),
      warnings: fixture.log.warnings.filter((m) => m.includes('"embed"')).length,
    };
  });
  assert.deepEqual(read.faces, [0]);
  assert.equal(read.made, 1);
  assert.deepEqual(read.wrappers, [[0, 'placed', 'face'], [1, '', 'drawn']]);
  assert.equal(read.warnings, 1);
});

test('a node selection on a cell inside a placed face writes no browser selection, marks nothing inside the face, and asks setSelection once', async () => {
  await fresh('table', { table: true });
  const read = await page.evaluate(async () => {
    const { view, fixture } = window, pos = fixture.posOf('table');
    view.focus();
    const sel = document.getSelection(), before = [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset];
    view.dispatch(view.state.tr.setSelection(fixture.NodeSelection.create(view.state.doc, pos + 2)));
    await fixture.settled();
    const now = [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset];
    return { unmoved: now.every((v, i) => v === before[i]), marked: view.dom.querySelectorAll('.ProseMirror-selectednode').length, selections: fixture.log.selections, cell: view.state.doc.nodeAt(pos + 2).nodeSize };
  });
  assert.equal(read.unmoved, true);
  assert.equal(read.marked, 0);
  assert.deepEqual(read.selections, [[1, 1 + read.cell, true]]);
});

test('a node decoration on the table that changes asks update once with it, and false makes another face in the wrapper', async () => {
  await fresh('table', { table: true, grid: true });
  const kept = await page.evaluate(async () => {
    const { view, fixture } = window;
    const face = view.dom.querySelector('.table-face');
    view.dispatch(view.state.tr.setMeta(fixture.gridKey, 'b'));
    await fixture.settled();
    return { same: view.dom.querySelector('.table-face') === face, log: { ...fixture.log } };
  });
  assert.deepEqual(kept.log.decorations, [['a']]);
  assert.deepEqual(kept.log.updated, [{ text: 'R1aR1b', grid: ['b'] }]);
  assert.equal(kept.log.made, 1);
  assert.equal(kept.log.destroyed, 0);
  assert.equal(kept.same, true);
  await fresh('table', { table: true, grid: true, update: false });
  const remade = await page.evaluate(async () => {
    const { view, fixture } = window;
    view.dispatch(view.state.tr.setMeta(fixture.gridKey, 'b'));
    await fixture.settled();
    const faces = [...view.dom.querySelectorAll('.table-face')];
    return { faces: faces.map((f) => [f.dataset.made, f.parentElement.getAttribute('data-fragview-face')]), log: { ...fixture.log } };
  });
  assert.deepEqual(remade.faces, [['2', 'placed']]);
  assert.equal(remade.log.made, 2);
  assert.equal(remade.log.destroyed, 1);
  assert.deepEqual(remade.log.decorations, [['a'], ['b']]);
});

test('a block face drawn taller than toDOM warns once and is kept, and the chain is the same as with no face', async () => {
  const chain = () => page.evaluate(() => window.view.entries.map((e) => e.to));
  await fresh('cut', { nodeViews: {}, box: 200 });
  const bare = await chain();
  await fresh('cut', { table: true, box: 200, height: 150 });
  const faced = await chain();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  const log = await logged();
  assert.ok(bare.length > 1, 'the document is cut');
  assert.deepEqual(faced, bare);
  assert.equal(log.made, 1);
  assert.equal(await page.locator('#host [data-fragview-face="placed"] > .table-face').count(), 1);
  assert.equal(log.warnings.filter((m) => m.includes('"table" draws')).length, 1, log.warnings.join('\n'));
});

test('posAtCoords over a placed face answers the table\'s position', async () => {
  await fresh('table', { table: true });
  const read = await page.evaluate(() => {
    const { view, fixture } = window;
    const r = view.dom.querySelector('.table-face td').getBoundingClientRect();
    return { at: view.posAtCoords({ left: r.left + 5, top: r.top + 5 }), pos: fixture.posOf('table') };
  });
  assert.deepEqual(read.at, { pos: read.pos, inside: read.pos });
});

test('typing into an input the face holds changes the document only through the face\'s dispatch, and update keeps the element', async () => {
  await fresh('table', { table: true });
  const face = await page.evaluate(() => window.view.dom.querySelector('.table-face').dataset.made);
  await page.locator('#host .table-face .face-input').click();
  await page.keyboard.type('xy');
  await settle();
  const read = await page.evaluate(() => {
    const { view, fixture } = window;
    const el = view.dom.querySelector('.table-face');
    return { text: view.state.doc.textContent, made: fixture.log.made, face: el.dataset.made, value: el.querySelector('.face-input').value, focused: document.activeElement === el.querySelector('.face-input'), drawn: el.querySelector('td').textContent };
  });
  assert.equal(read.text, 'Before the table.R1axyR1bR2aR2bR3aR3bAfter the table.');
  assert.deepEqual({ made: read.made, face: read.face, value: read.value, focused: read.focused, drawn: read.drawn }, { made: 1, face, value: 'xy', focused: true, drawn: 'R1axy' });
});

test('a table moved whole to the next box by paragraphs inserted above keeps its face element', async () => {
  await fresh('table', { table: true, box: 200 });
  const read = await page.evaluate(async () => {
    const { view, fixture } = window;
    const face = view.dom.querySelector('.table-face');
    const before = fixture.entryOf(face);
    view.dispatch(view.state.tr.insert(0, Array.from({ length: 6 }, (_, i) => fixture.p(`New ${i}.`))));
    await fixture.settled();
    const now = view.dom.querySelector('.table-face');
    return { before, after: fixture.entryOf(now), same: now === face, placed: now.parentElement.getAttribute('data-fragview-face'), made: fixture.log.made, destroyed: fixture.log.destroyed };
  });
  assert.ok(read.after > read.before, `the table moved from box ${read.before} to box ${read.after}`);
  assert.deepEqual({ same: read.same, placed: read.placed, made: read.made, destroyed: read.destroyed }, { same: true, placed: 'placed', made: 1, destroyed: 0 });
});
