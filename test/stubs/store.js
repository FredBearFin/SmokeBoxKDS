/* Test stub (NOT part of the app): the smallest SB.store the shell talks to. */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  let state = { v: 1, rev: 0, settings: { ui: { theme: 'day', textSize: 'normal', sound: false }, office: { theme: 'ember', pinHash: null } } };
  const subs = [];
  SB.store = {
    __stub: true,
    init() { return { firstRun: true }; },
    getState() { return state; },
    now() { return Date.now(); },
    dispatch(type, payload) {
      if (type === 'updateSettings' && payload && payload.patch) {
        const p = payload.patch;
        state = Object.assign({}, state, { rev: state.rev + 1, settings: Object.assign({}, state.settings, { office: Object.assign({}, state.settings.office, p.office || {}) }) });
        subs.slice().forEach((f) => f(state));
        return 'ok';
      }
      return 'unknownAction';
    },
    subscribe(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
