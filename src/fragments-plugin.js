/**
 * `fragmentsPlugin`: the chain of fragments as plugin state, mapped through every transaction.
 *
 * @remarks
 * The state is `{ entries }`, one entry per fragment, in document order: the range it shows and whether a step has touched it since its last fill. The container itself is the view's, held by `key`; the state holds positions only, so undo, redo and collaboration map the chain for free, as they map the history and decoration sets.
 *
 * `apply` maps `from` with association −1 and `to` with association 1, so an insertion at a boundary falls inside both neighbours for a moment; both are marked dirty, and the refill of the first sets the second's `from` to its new `to`. A transaction that leaves the document alone changes nothing, and returns the same state object.
 *
 * The view's refills are transactions too: `refilled` sets an entry's `to` and clears its `dirty`, and `appended` adds the entry after the last. Both go through a meta under `fragmentsKey`, and both mark the transaction `addToHistory: false`, so no refill is ever undone.
 *
 * @packageDocumentation
 */

import { Plugin, PluginKey } from 'prosemirror-state';

/** @import { Transaction } from 'prosemirror-state' */
/** @import { Mapping } from 'prosemirror-transform' */

/**
 * One link of the chain.
 * @typedef {object} Entry
 * @property {number} key The entry's identity, by which the view holds its container; never reused within one state's history.
 * @property {number} from The first position the fragment shows.
 * @property {number | null} to The position the fragment stops at, null when it runs to the end of the document.
 * @property {boolean} dirty A step touched the fragment's range since its last fill.
 */

/**
 * @typedef {object} FragmentsState
 * @property {ReadonlyArray<Entry>} entries
 */

/**
 * @typedef {object} FragmentsMeta
 * @property {{ key: number, to: number | null }} [refilled]
 * @property {{ from: number }} [appended]
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
        if (tr.docChanged) entries = entries.map((entry) => mapEntry(entry, tr.mapping));
        const meta = /** @type {FragmentsMeta | undefined} */ (tr.getMeta(fragmentsKey));
        if (meta?.refilled) entries = refill(entries, meta.refilled.key, meta.refilled.to);
        if (meta?.appended) entries = [...entries, { key: Math.max(-1, ...entries.map((e) => e.key)) + 1, from: meta.appended.from, to: null, dirty: true }];
        return entries === value.entries ? value : { entries };
      },
    },
  });
}

/**
 * Map an entry through each step's map in turn, marking it dirty when a step's changed range touches it in that step's coordinates.
 * @param {Entry} entry
 * @param {Mapping} mapping
 * @returns {Entry}
 */
function mapEntry(entry, mapping) {
  let { from, to, dirty } = entry;
  for (const map of mapping.maps) {
    map.forEach((oldStart, oldEnd) => {
      // An insertion touches the range it lands in, ends included; a deletion or replacement touches what it overlaps.
      const touched = oldStart === oldEnd ? oldStart >= from && (to == null || oldStart <= to) : oldEnd > from && (to == null || oldStart < to);
      if (touched) dirty = true;
    });
    from = map.map(from, -1);
    if (to != null) to = map.map(to, 1);
  }
  return from === entry.from && to === entry.to && dirty === entry.dirty ? entry : { key: entry.key, from, to, dirty };
}

/**
 * Set an entry's `to` and clear its `dirty`. The entry after it starts where it now stops, and is dirty when that moved it; when it now runs to the end, the entries after it are dropped.
 * @param {ReadonlyArray<Entry>} entries
 * @param {number} key
 * @param {number | null} to
 * @returns {ReadonlyArray<Entry>}
 */
function refill(entries, key, to) {
  const at = entries.findIndex((e) => e.key === key);
  if (at < 0) return entries;
  const result = entries.slice(0, at);
  result.push({ ...entries[at], to, dirty: false });
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
 * @returns {Transaction}
 */
export function refilled(tr, key, to) {
  return withMeta(tr, { refilled: { key, to } });
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
