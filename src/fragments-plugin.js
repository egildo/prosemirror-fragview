/**
 * `fragmentsPlugin`: the chain of fragments as plugin state, mapped through every transaction.
 *
 * @remarks
 * The state is `{ entries }`, one entry per fragment, in document order: the range it shows and whether a step has touched it since its last fill. The container itself is the view's, held by `key`; the state holds positions only, so undo, redo and collaboration map the chain for free, as they map the history and decoration sets.
 *
 * `apply` maps `from` with association −1 and `to` with association 1, so an insertion at a boundary falls inside both neighbours for a moment; both are marked dirty, and the refill of the first sets the second's `from` to its new `to`. A transaction that leaves the document alone changes nothing, and returns the same state object.
 *
 * A step touches an entry when its changed range meets the entry's range (for a step whose map moves nothing, a mark or an attribute, the range where the documents before and after it differ), and also when it lands in the first word after the entry's `to`: the line before a cut ended there because that word did not fit, so a change to the word can let it fit and move the cut, though the word is shown by the next fragment. The word is the run of non-space characters at `to`; ponytail: break opportunities read as spaces only, so a cut in CJK text or after a hyphen dirties too little, Intl.Segmenter's line granularity when it matters.
 *
 * A fragmentainer whose decision read further than that first word (a widow rule reads the whole paragraph, a kept block the block after it) answers how far with its fill's `reach`; the entry keeps it, mapped as `to` is, and a change up to it dirties the entry. A `reach` never counts for less than the first word. A `ReplaceAroundStep` (`setNodeMarkup`, a wrap, a lift) maps only the tokens it replaces, yet what lies between them is drawn inside the new markup, so it touches its whole range. A step wholly before `from` touches the entry when it inserts or removes a child of one of its divided ancestors before the one it opens in: the renderer writes those children as away siblings and numbers an opened list from them, so a page that absorbed the edit leaves the next one's ordinal and sibling selectors stale. The document's own children are left out (ponytail: a top-level `:nth-child` reads stale on a clean later page, since counting them would refill every later page on every new paragraph; a ruling if a paginator's CSS reads it).
 *
 * An entry whose `from` reaches the end of the document (no cursor position after it) is dropped, and the entry before it becomes the last, running to the end and dirty.
 *
 * The view's refills are transactions too: `refilled` sets an entry's `to` and clears its `dirty`, `appended` adds the entry after the last, and `dirtied` marks an entry (or several) dirty with no step (late truth: a fragment's content changed height after its fill), or every entry when it names none (the view's invalidation: the conditions of every fill changed). `dirtied` also counts its asks in the entry's `asked`, because the document does not change: the view compares the count to know that a fill in flight began before the latest ask, and fills again. All go through a meta under `fragmentsKey`, and all mark the transaction `addToHistory: false`, so no refill is ever undone.
 *
 * @packageDocumentation
 */

import { Plugin, PluginKey, Selection } from 'prosemirror-state';
import { ReplaceAroundStep } from 'prosemirror-transform';

/** @import { Transaction } from 'prosemirror-state' */
/** @import { Node as PMNode } from 'prosemirror-model' */

/**
 * One link of the chain.
 * @typedef {object} Entry
 * @property {number} key The entry's identity, by which the view holds its container; never reused within one state's history.
 * @property {number} from The first position the fragment shows.
 * @property {number | null} to The position the fragment stops at, null when it runs to the end of the document.
 * @property {boolean} dirty A step touched the fragment's range since its last fill.
 * @property {number | null} [reach] The last position the fill's decision read, as it answered it, null for the end of the document; absent when it answered none, and the first word after `to` stands for it.
 * @property {number} [asked] How many `dirtied` transactions have named the entry; absent before the first.
 */

/**
 * @typedef {object} FragmentsState
 * @property {ReadonlyArray<Entry>} entries
 */

/**
 * @typedef {object} FragmentsMeta
 * @property {{ key: number, to: number | null, reach?: number | null }} [refilled]
 * @property {{ from: number }} [appended]
 * @property {{ key: number | number[] | null }} [dirtied]
 */

/** @type {PluginKey<FragmentsState>} */
export const fragmentsKey = new PluginKey('fragments');

/**
 * The plugin that holds the chain. A new state starts with one dirty entry from 0 to the end.
 * @returns {Plugin<FragmentsState>}
 */
export function fragmentsPlugin() {
  return new Plugin({
    key: fragmentsKey,
    state: {
      init: () => ({ entries: [{ key: 0, from: 0, to: null, dirty: true }] }),
      apply(tr, value) {
        let entries = value.entries;
        if (tr.docChanged) entries = dropAtEnd(entries.map((entry) => mapEntry(entry, tr)), tr.doc);
        const meta = /** @type {FragmentsMeta | undefined} */ (tr.getMeta(fragmentsKey));
        if (meta?.refilled) entries = refill(entries, meta.refilled.key, meta.refilled.to, meta.refilled.reach);
        if (meta?.appended) entries = [...entries, { key: Math.max(-1, ...entries.map((e) => e.key)) + 1, from: meta.appended.from, to: null, dirty: true }];
        if (meta?.dirtied) {
          const keys = meta.dirtied.key == null ? null : [meta.dirtied.key].flat();
          entries = entries.map((e) => (!keys || keys.includes(e.key) ? { ...e, dirty: true, asked: (e.asked ?? 0) + 1 } : e));
        }
        return entries === value.entries ? value : { entries };
      },
    },
  });
}

/**
 * Map an entry through each step's map in turn, marking it dirty when a step's changed range touches it in that step's coordinates.
 * @param {Entry} entry
 * @param {Transaction} tr
 * @returns {Entry}
 */
function mapEntry(entry, tr) {
  let { from, to, dirty, reach: answered } = entry;
  tr.mapping.maps.forEach((map, i) => {
    const reach = to == null || answered === null ? null : Math.max(answered ?? 0, wordEnd(tr.docs[i], to));
    let mapped = false;
    const touch = (/** @type {number} */ oldStart, /** @type {number} */ oldEnd) => {
      // An insertion touches the range it lands in, ends included; a deletion or replacement touches what it overlaps; either touches the first word after the cut.
      const touched = oldStart === oldEnd ? oldStart >= from && (reach == null || oldStart <= reach) : oldEnd > from && (reach == null || oldStart < reach || oldStart === /** @type {number} */ (to));
      if (touched) dirty = true;
    };
    map.forEach((oldStart, oldEnd) => { mapped = true; touch(oldStart, oldEnd); });
    // A step that moves no position (a mark added or removed, an attribute set) has an empty map: the range it changed is read from the two documents.
    const step = tr.steps[i];
    if (step instanceof ReplaceAroundStep) touch(step.from, step.to);
    if (!mapped) {
      const before = tr.docs[i], after = tr.docs[i + 1] ?? tr.doc;
      const start = before.content.findDiffStart(after.content);
      if (start != null) touch(start, Math.max(start + 1, /** @type {{ a: number }} */ (before.content.findDiffEnd(after.content)).a));
    }
    const counted = dirty ? '' : indicesAt(tr.docs[i], from);
    from = map.map(from, -1);
    if (!dirty && indicesAt(tr.docs[i + 1] ?? tr.doc, from) !== counted) dirty = true;
    if (to != null) to = map.map(to, 1);
    if (answered != null) answered = map.map(answered, 1);
  });
  if (from === entry.from && to === entry.to && dirty === entry.dirty && answered === entry.reach) return entry;
  return answered == null ? { ...entry, from, to, dirty } : { ...entry, from, to, dirty, reach: answered };
}

/**
 * The index of `pos` in each of its divided ancestors, the document and its textblock left out: what the renderer's away siblings and an opened list's ordinal are counted from.
 * @param {PMNode} doc
 * @param {number} pos
 */
function indicesAt(doc, pos) {
  const $pos = doc.resolve(pos);
  let out = '';
  for (let d = 1; d < $pos.depth; d++) out += $pos.index(d) + ',';
  return out;
}

/**
 * The end of the run of non-space characters that starts at `pos`, inside its textblock; `pos` itself outside a textblock.
 * @param {PMNode} doc
 * @param {number} pos
 */
function wordEnd(doc, pos) {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return pos;
  const rest = $pos.parent.textBetween($pos.parentOffset, Math.min($pos.parent.content.size, $pos.parentOffset + 64), undefined, '\ufffc');
  return pos + /** @type {RegExpExecArray} */ (/^\S*/.exec(rest))[0].length;
}

/**
 * Drop the entries whose `from` has no cursor position after it, and let the last one left run to the end, dirty.
 * @param {ReadonlyArray<Entry>} entries
 * @param {PMNode} doc
 */
function dropAtEnd(entries, doc) {
  const end = Selection.atEnd(doc).from;
  let count = entries.length;
  while (count > 1 && entries[count - 1].from >= end) count--;
  if (count === entries.length) return entries;
  const last = entries[count - 1];
  return [...entries.slice(0, count - 1), { ...last, to: null, dirty: true }];
}

/**
 * Set an entry's `to` and `reach` and clear its `dirty`. The entry after it starts where it now stops, and is dirty when that moved it; when it now runs to the end, the entries after it are dropped.
 * @param {ReadonlyArray<Entry>} entries
 * @param {number} key
 * @param {number | null} to
 * @param {number | null} [reach]
 * @returns {ReadonlyArray<Entry>}
 */
function refill(entries, key, to, reach) {
  const at = entries.findIndex((e) => e.key === key);
  if (at < 0) return entries;
  const result = entries.slice(0, at);
  const { reach: _old, ...entry } = entries[at];
  result.push(reach === undefined ? { ...entry, to, dirty: false } : { ...entry, to, reach, dirty: false });
  if (to == null) return result;
  const next = entries[at + 1];
  if (next) result.push(next.from === to ? next : { ...next, from: to, dirty: true }, ...entries.slice(at + 2));
  return result;
}

/**
 * @param {Transaction} tr
 * @param {FragmentsMeta} add
 */
function withMeta(tr, add) {
  return tr.setMeta(fragmentsKey, { ...tr.getMeta(fragmentsKey), ...add }).setMeta('addToHistory', false);
}

/**
 * The transaction that records a fill: the entry `key` stops at `to` and is clean.
 * @param {Transaction} tr
 * @param {number} key
 * @param {number | null} to
 * @param {number | null} [reach] How far the fill's decision read, when it answered that.
 * @returns {Transaction}
 */
export function refilled(tr, key, to, reach) {
  return withMeta(tr, { refilled: reach === undefined ? { key, to } : { key, to, reach } });
}

/**
 * The transaction that marks the entry `key` dirty (or each of the entries `key` lists), so the view refills it from its `from`; every entry when `key` is omitted.
 * @param {Transaction} tr
 * @param {number | number[] | null} [key]
 * @returns {Transaction}
 */
export function dirtied(tr, key = null) {
  return withMeta(tr, { dirtied: { key } });
}

/**
 * The transaction that adds an entry after the last one, from `from` to the end, dirty.
 * @param {Transaction} tr
 * @param {number} from
 * @returns {Transaction}
 */
export function appended(tr, from) {
  return withMeta(tr, { appended: { from } });
}
