/**
 * Vite's configuration for the harness and the suites: one copy of the three pure libraries, so a linked checkout's bare imports find the nodes the state and the view here recognize.
 *
 * @packageDocumentation
 */

export default {
  resolve: { dedupe: ['prosemirror-model', 'prosemirror-state', 'prosemirror-transform'] },
};
