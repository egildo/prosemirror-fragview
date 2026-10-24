// usage: node scripts/fragments.mjs [--headed] — phase 3's measurements of the fragment against a single unfragmented rendering, in Chromium, the lab under the generic schema with structured marks.
//   (1) NUMBERING. The lab's lists section (an ol starting at 4, a reversed ol, an ol with li values, an ol three deep) is cut at the start of each of its list items' text in turn, as a box cuts at a line: the fragment before the cut renders from the section to `openedAt(cut)`, the fragment after from the cut to the section's end, both with the renderer the view uses, under the lab's sheets and the renderer's two sheets. Every list marker's text is read from Chromium's accessibility tree (a ListMarker's name), since `getComputedStyle(li, '::marker').content` is `normal` and a counter in `content` computes to its specified form; each marker is compared with the marker of the same source item in one rendering of the whole document. A resumed item (divided, not its start) must show no marker.
//   (2) SELECTORS. Three rules are added to the page (`:nth-child(2)`, `h2 + *` and `li + li`, each setting a custom property registered as not inherited), the lab is mounted under 320 × 480 boxes, and every element each fragment shows is compared, rule by rule, with the same source element in the whole rendering; and the whole rendering with the file itself (the laid-out lab, `matches`).
import { open } from './browser.mjs';

const session = await open('harness/?schema=generic&marks=structured&boxes=320x480', { headless: !process.argv.includes('--headed') });
const { page, context } = session;
const cdp = await context.newCDPSession(page);
const settled = () => page.waitForFunction(() => window.harness && window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
await settled();

// ---- (1) numbering ----
const cuts = await page.evaluate(async () => {
  const { generic } = window.harness;
  const doc = generic.parse(true);
  window.__fv = { doc };
  let section = null;
  doc.forEach((n, pos) => { if (n.attrs.attrs?.id === 'lists') section = { from: pos, to: pos + n.nodeSize }; });
  const cuts = [];
  doc.nodesBetween(section.from, section.to, (n, pos) => {
    if (n.isTextblock && /^li$/.test(n.type.spec.toDOM(n)[0]) ? true : n.isTextblock && doc.resolve(pos).parent.type.spec.toDOM?.(doc.resolve(pos).parent)?.[0] === 'li') cuts.push({ at: pos + 1, text: n.textContent.trim() });
  });
  window.__fv.section = section;
  return { section, cuts };
});
/** Every ListMarker in the accessibility tree whose list item carries `data-fv`: its key and its name. */
async function markers() {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const out = {};
  for (const n of nodes) {
    if (n.role?.value !== 'ListMarker') continue;
    const item = byId.get(n.parentId);
    if (!item?.backendDOMNodeId) continue;
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: item.backendDOMNodeId });
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { return this.getAttribute && this.getAttribute("data-fv"); }', returnByValue: true });
    if (result.value) out[result.value] = n.name?.value ?? '';
  }
  return out;
}
await page.evaluate(() => { document.getElementById('columns').style.display = 'none'; });
const rows = [];
for (const cut of [null, ...cuts.cuts]) {
  const items = await page.evaluate(async (at) => {
    const { renderSlice, openedAt } = await import('/src/index.js');
    const { doc, section } = window.__fv;
    for (const el of document.querySelectorAll('.fv-measure')) el.remove();
    const place = (name, rendered) => {
      const box = document.body.appendChild(document.createElement('div'));
      box.className = `fv-measure fragview ${name}`;
      Object.assign(box.style, { width: '320px', display: 'flow-root' });
      box.append(rendered.fragment);
      for (const li of box.querySelectorAll('li')) li.setAttribute('data-fv', `${name}:${li.getAttribute('data-src')}`);
      return [...box.querySelectorAll('li')].map((li) => ({ key: li.getAttribute('data-fv'), words: li.getAttribute('data-beltype') ?? '', value: li.getAttribute('value') }));
    };
    const whole = place('whole', renderSlice(doc, 0, null));
    if (at == null) return { whole };
    return { before: place('before', renderSlice(doc, section.from, openedAt(doc, at))), after: place('after', renderSlice(doc, at, section.to)) };
  }, cut?.at ?? null);
  const names = await markers();
  if (cut == null) { rows.whole = Object.fromEntries(Object.entries(names).filter(([k]) => k.startsWith('whole:')).map(([k, v]) => [k.slice(6), v])); continue; }
  const row = { cut: cut.at, item: cut.text, compared: 0, equal: 0, differ: [], resumed: [] };
  for (const side of ['before', 'after']) {
    for (const li of items[side]) {
      const words = li.words.split(' ');
      if (words.includes('away')) continue;
      const src = li.key.slice(side.length + 1);
      const shown = names[li.key] ?? null;
      if (words.includes('split') && !words.includes('start') && side === 'after') { row.resumed.push(shown == null ? 'no marker' : `marker ${JSON.stringify(shown)}`); continue; }
      row.compared++;
      if (shown === rows.whole[src]) row.equal++;
      else row.differ.push({ side, src, shown, whole: rows.whole[src], value: li.value });
    }
  }
  rows.push(row);
}
console.log(`\n(1) Numbering: the lists section (${cuts.section.from}–${cuts.section.to}) cut at the start of each item's text; every displayed item's marker against the whole rendering's.`);
console.log(`the whole rendering's markers: ${Object.values(rows.whole).map((v) => JSON.stringify(v)).join(' ')}`);
console.log('| Cut at | Item | Markers compared | Equal | The resumed items |\n| --: | :-- | --: | --: | :-- |');
for (const r of rows) console.log(`| ${r.cut} | ${r.item} | ${r.compared} | ${r.equal} | ${r.resumed.join(', ') || '—'} |`);
for (const r of rows) for (const d of r.differ) console.log('  differs:', r.cut, JSON.stringify(d));

// ---- (2) selectors ----
await page.evaluate(() => { document.getElementById('columns').style.display = ''; for (const el of document.querySelectorAll('.fv-measure')) el.remove(); });
await page.evaluate(() => window.harness.mount(window.harness.generic.parse(true)));
await settled();
const selectors = await page.evaluate(async () => {
  const { renderSlice } = await import('/src/index.js');
  const RULES = [[':nth-child(2)', '--fv-nth'], ['h2 + *', '--fv-adj'], ['li + li', '--fv-li']];
  // A custom property inherits unless registered: each is registered as an integer that does not, so it reads 1 on the elements the rule matches and nowhere below them.
  for (const [, name] of RULES) CSS.registerProperty({ name, syntax: '<integer>', inherits: false, initialValue: '0' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(RULES.map(([sel, prop]) => `.fragview ${sel} { ${prop}: 1; }`).join('\n'));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  const { right, generic } = window.harness;
  const doc = right.state.doc;
  const whole = document.body.appendChild(document.createElement('div'));
  whole.className = 'fragview';
  whole.append(renderSlice(doc, 0, null).fragment);
  const reads = (el) => RULES.map(([, prop]) => getComputedStyle(el).getPropertyValue(prop).trim() === '1');
  /** The first element of the whole rendering for each source element. */
  const inWhole = new Map();
  for (const el of whole.querySelectorAll('[data-src]')) if (!inWhole.has(el.getAttribute('data-src'))) inWhole.set(el.getAttribute('data-src'), el);
  const out = { rules: RULES.map(([sel]) => sel), fragments: [], file: { compared: 0, differ: [] } };
  for (const [index, entry] of right.fragments.entries()) {
    const f = { index, compared: 0, matched: [0, 0, 0], differ: [] };
    for (const el of entry.container.content.querySelectorAll('[data-src]')) {
      if ((el.getAttribute('data-beltype') ?? '').split(' ').includes('away') || el.closest('svg, math') !== null && el.closest('svg, math') !== el) continue;
      const twin = inWhole.get(el.getAttribute('data-src'));
      if (!twin) continue;
      f.compared++;
      const a = reads(el), b = reads(twin);
      a.forEach((v, i) => { if (v) f.matched[i]++; });
      if (a.some((v, i) => v !== b[i])) f.differ.push({ element: el.localName, src: el.getAttribute('data-src'), fragment: a, whole: b });
    }
    out.fragments.push(f);
  }
  // The whole rendering against the file: the same selectors asked of the laid-out lab's own elements.
  const all = [...generic.source.querySelectorAll('*')];
  for (const [src, el] of inWhole) {
    const file = all[Number(src) - 1];
    if (el.closest('svg, math') !== null && el.closest('svg, math') !== el) continue;
    out.file.compared++;
    const a = RULES.map(([sel]) => file.matches(sel)), b = reads(el);
    if (a.some((v, i) => v !== b[i])) out.file.differ.push({ element: el.localName, path: generic.g.pathOf(file, generic.source), file: a, rendering: b });
  }
  whole.remove();
  return out;
});
console.log(`\n(2) Selectors: ${selectors.rules.join(', ')}; every element each 320 × 480 fragment shows against the same source element in the whole rendering.`);
console.log('| Fragment | Elements compared | Matching each rule in the fragment | Differing from the whole rendering |\n| --: | --: | :-- | --: |');
for (const f of selectors.fragments) console.log(`| ${f.index} | ${f.compared} | ${f.matched.join(', ')} | ${f.differ.length} |`);
for (const f of selectors.fragments) for (const d of f.differ) console.log('  differs:', f.index, JSON.stringify(d));
console.log(`the whole rendering against the file: ${selectors.file.compared} elements, ${selectors.file.differ.length} differ`);
for (const d of selectors.file.differ) console.log('  ', JSON.stringify(d));
await session.close();
