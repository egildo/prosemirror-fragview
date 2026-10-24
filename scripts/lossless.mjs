// usage: node scripts/lossless.mjs [--headed] — phase 3's lossless check, under 320 × 480 boxes, for the lab under the generic schema with structured marks and with every inline a node.
//   (1) THE FILE SIDE. The lab's body is parsed into the schema and mounted in the FragmentedView under boxes; once the chain is settled, the state is written back by the studio's document serializer and compared with the source body as the studio's scripts/generic-schema.mjs compares them: both serialized with attribute order sorted and nothing else normalized, child lists aligned by their longest common subsequence, every difference listed. The lab's known differences are 6, in the section written to be refused.
//   (2) THE PAGE SIDE. The lab is parsed again with every source element tagged (`data-src`, its index in document order) and mounted; for every built fragment, every element the fragment shows is traced to the file: an element with no tag is not in the file; one whose tag differs from the source's, or whose parent (through the schema's `txt-run`, which holds mixed content) is not its source parent, is not where the file has it. A shallow sibling (`away`) must be in the file, where the file has it, and empty. The rest is listed by fragment.
import { open } from './browser.mjs';

const headless = !process.argv.includes('--headed');
const out = {};
for (const marks of ['structured', 'nodes']) {
  const session = await open(`harness/?schema=generic&marks=${marks}&boxes=320x480`, { headless });
  const { page } = session;
  const settled = () => page.waitForFunction(() => window.harness && window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
  await settled();
  const file = await page.evaluate(() => {
    const { generic, right } = window.harness;
    const source = generic.source;
    const kids = (n) => [...(n.localName === 'template' ? n.content.childNodes : n.childNodes)];
    const sig = (n) => (n.nodeType === 1 ? n.localName : n.nodeType === 3 ? '#text' : n.nodeType === 8 ? '#comment' : `#${n.nodeType}`);
    const attrs = (el) => [...el.attributes].map((a) => [a.name, a.value]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
    const norm = (n) => (n.nodeType === 3 ? esc(n.data) : n.nodeType === 8 ? `<!--${n.data}-->` : n.nodeType !== 1 ? '' : `<${n.localName}${attrs(n).map(([k, v]) => ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('')}>${VOID.has(n.localName) ? '' : `${kids(n).map(norm).join('')}</${n.localName}>`}`);
    const where = (el, root) => (el === root ? 'body' : generic.g.pathOf(el, root));
    function diff(a, b, root, list) {
      if (a.nodeType === 3 || a.nodeType === 8) {
        if (a.data !== b.data) list.push({ kind: a.nodeType === 8 ? 'comment' : /\S/.test(a.data + b.data) ? 'text' : 'whitespace', path: where(a.parentElement, root), was: a.data.slice(0, 60), now: b.data.slice(0, 60) });
        return;
      }
      if (JSON.stringify(attrs(a)) !== JSON.stringify(attrs(b))) list.push({ kind: 'attributes', path: where(a, root) });
      const ak = kids(a), bk = kids(b);
      const L = Array.from({ length: ak.length + 1 }, () => new Array(bk.length + 1).fill(0));
      for (let i = ak.length - 1; i >= 0; i--) for (let j = bk.length - 1; j >= 0; j--) L[i][j] = sig(ak[i]) === sig(bk[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      const what = (n) => (n.nodeType === 1 ? 'element' : n.nodeType === 3 ? (/\S/.test(n.data) ? 'text' : 'whitespace') : 'comment');
      const label = (n) => (n.nodeType === 1 ? `<${n.localName}${n.className && typeof n.className === 'string' ? `.${n.className.trim().split(/\s+/).join('.')}` : ''}>` : JSON.stringify((n.data ?? '').slice(0, 40)));
      let i = 0, j = 0;
      while (i < ak.length || j < bk.length) {
        if (i < ak.length && j < bk.length && sig(ak[i]) === sig(bk[j]) && L[i][j] === L[i + 1][j + 1] + 1) { diff(ak[i], bk[j], root, list); i++; j++; }
        else if (j < bk.length && (i === ak.length || L[i][j + 1] >= L[i + 1][j])) { list.push({ kind: `added ${what(bk[j])}`, path: where(a, root), node: label(bk[j]) }); j++; }
        else { list.push({ kind: `lost ${what(ak[i])}`, path: where(a, root), node: label(ak[i]) }); i++; }
      }
    }
    const body = document.createElement('body');
    body.innerHTML = generic.serialize(right.state.doc);
    const list = [];
    diff(source, body, source, list);
    return { elements: source.querySelectorAll('*').length, unchanged: right.state.doc.eq(generic.doc), equal: norm(source) === norm(body), count: list.length, differences: list, fragments: right.fragments.length };
  });
  // The page side: the tagged parse, mounted.
  await page.evaluate(() => window.harness.mount(window.harness.generic.parse(true)));
  await settled();
  const pageSide = await page.evaluate(() => {
    const { generic, right } = window.harness;
    const all = [...generic.source.querySelectorAll('*')];
    const idOf = (el) => (el === generic.source ? 'body' : String(all.indexOf(el) + 1));
    /** The element's parent on the page, through the schema's own wrapper for mixed content. */
    const parentOf = (el, root) => { let p = el.parentElement; while (p && p !== root && p.localName === 'txt-run') p = p.parentElement; return p === root ? 'body' : p?.getAttribute('data-src') ?? `<${p?.localName}>`; };
    const path = (el, root) => { const out = []; for (let n = el; n && n !== root; n = n.parentElement) out.unshift(n.localName + (n.className && typeof n.className === 'string' ? `.${n.className.trim().split(/\s+/)[0]}` : '')); return out.join(' > '); };
    return right.fragments.map((entry, index) => {
      const root = entry.container.content;
      const r = { index, from: entry.from, to: entry.to, elements: 0, away: 0, awayNotShallow: [], notInFile: [], schemaRuns: 0, repeated: [] };
      const seen = new Map();
      for (const el of root.querySelectorAll('*')) {
        if (el.closest('svg, math') && el.closest('svg, math') !== el) continue; // inside a raw element: carried verbatim, its own children
        r.elements++;
        const id = el.getAttribute('data-src');
        const away = (el.getAttribute(window.harness.words.attribute) ?? '').split(' ').includes(window.harness.words.away);
        if (away) { r.away++; if (el.firstChild) r.awayNotShallow.push(path(el, root)); }
        if (el.localName === 'txt-run') { r.schemaRuns++; continue; }
        if (!id) { r.notInFile.push({ why: 'no source element', element: el.localName + (el.className ? `.${el.className}` : ''), path: path(el, root) }); continue; }
        const src = all[Number(id) - 1];
        if (src.localName !== el.localName) r.notInFile.push({ why: `tag ${src.localName} in the file`, element: el.localName, path: path(el, root) });
        else if (parentOf(el, root) !== idOf(src.parentElement)) r.notInFile.push({ why: `parent ${parentOf(el, root)}, ${idOf(src.parentElement)} in the file`, element: el.localName + (el.className ? `.${el.className}` : ''), path: path(el, root) });
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      for (const [id, n] of seen) if (n > 1) r.repeated.push({ element: all[Number(id) - 1].localName + (all[Number(id) - 1].className ? `.${all[Number(id) - 1].className}` : ''), times: n });
      return r;
    });
  });
  out[marks] = { file, page: pageSide };
  await session.close();
}

for (const [marks, { file, page }] of Object.entries(out)) {
  console.log(`\n== ${marks === 'structured' ? 'structured marks' : 'every inline a node'}, 320 × 480 boxes: ${file.fragments} fragments ==`);
  console.log(`file side: ${file.elements} elements in the source body; the state unchanged by the mount: ${file.unchanged}; ${file.equal ? 'LOSSLESS' : `${file.count} differences`}`);
  for (const d of file.differences) console.log('   ', JSON.stringify(d));
  console.log('page side, per fragment: elements shown, shallow siblings put away, elements not in the file (or not where the file has them), the schema\'s runs, elements repeated inside the fragment');
  for (const f of page) {
    console.log(`  ${String(f.index).padStart(2)} ${f.from}–${f.to ?? 'end'}: ${f.elements} elements, ${f.away} away${f.awayNotShallow.length ? ` (NOT SHALLOW: ${f.awayNotShallow.join(', ')})` : ''}, ${f.notInFile.length} not in the file, ${f.schemaRuns} runs${f.repeated.length ? `, repeated ${JSON.stringify(f.repeated)}` : ''}`);
    for (const n of f.notInFile) console.log('      ', JSON.stringify(n));
  }
  const total = page.reduce((a, f) => ({ elements: a.elements + f.elements, away: a.away + f.away, notInFile: a.notInFile + f.notInFile.length, runs: a.runs + f.schemaRuns }), { elements: 0, away: 0, notInFile: 0, runs: 0 });
  console.log(`  in all: ${total.elements} elements, ${total.away} away, ${total.notInFile} not in the file, ${total.runs} runs`);
}
