/**
 * Vite's configuration for the harness and the suites: one copy of the three pure libraries, so a linked checkout's bare imports find the nodes the state and the view here recognize.
 *
 * @remarks
 * Vite's dependency optimizer stays off, since every dependency here is already an ES module. With it on, a checkout with no cache failed 57 to 61 of 157 tests (measured 2026-11-07): each suite file runs in its own process with its own server, and they rewrote one `node_modules/.vite` under each other and reloaded dependencies while a page imported them.
 *
 * @packageDocumentation
 */

export default {
  resolve: { dedupe: ['prosemirror-model', 'prosemirror-state', 'prosemirror-transform'] },
  optimizeDeps: { noDiscovery: true },
};
