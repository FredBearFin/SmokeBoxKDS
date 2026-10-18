/* Test stub (NOT part of the app): a tiny SB.floor that exercises the shell contract (brand mark, station tabs, sheets, slips). */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util, h = U.h;
  let seg = null, label = null, root = null;
  SB.floor = {
    __stub: true,
    mount(el) {
      root = el; U.clear(el);
      label = h('span', { class: 'chip', id: 'floor-zone' }, 'All');
      seg = SB.ui.segmented({ label: 'Station', kind: 'tabs', value: SB.router.view().zone || 'all', options: [{ id: 'all', label: 'All', count: 3 }, { id: 'pit', label: 'PIT', icon: 'flame', count: 2, alert: true }, { id: 'sides', label: 'HOT', icon: 'pot', count: 1 }, { id: 'fry', label: 'FRY', icon: 'fry', count: 0 }, { id: 'cold', label: 'CLD', icon: 'snow', count: 1 }, { id: 'expo', label: 'EXP', icon: 'bag', count: 3 }], onChange: (z) => SB.router.go({ kind: 'floor', zone: z }) });
      const bar = h('div', { class: 'ph-bar', id: 'floor-bar' },
        SB.shell.brand(), seg, label, h('span', { style: 'flex:1' }),
        h('button', { type: 'button', class: 'btn', id: 'open-help', onClick: () => SB.sheets.open('help') }, 'Help'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'open-order', onClick: () => SB.sheets.open('order') }, SB.icons.svg('plus', { size: 22 }), h('span', null, 'New ticket')),
        h('button', { type: 'button', class: 'btn btn-icon', id: 'open-menu', 'aria-label': 'Menu', onClick: (e) => SB.ui.menu(e.currentTarget, [{ label: 'Night theme', icon: 'moon', checked: SB.theme.get() === 'night', onClick: () => SB.theme.toggle() }, { label: 'Large text', icon: 'sliders', checked: SB.theme.textSize() === 'large', onClick: () => SB.theme.setTextSize(SB.theme.textSize() === 'large' ? 'normal' : 'large') }, { separator: true }, { label: 'Help', icon: 'help', onClick: () => SB.sheets.open('help') }]) }, SB.icons.svg('menu', { size: 22 })));
      const board = h('div', { style: 'padding:20px;display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start' });
      if (SB.gallery && SB.gallery.slips) SB.gallery.slips().forEach((sl) => { sl.style.width = 'min(320px, 100%)'; board.appendChild(sl); });
      el.append(bar, board);
      SB.floor._board = board;
      this.setZone(SB.router.view().zone || 'all');
    },
    unmount() { if (root) U.clear(root); root = seg = label = null; },
    setZone(z) { if (label) label.textContent = z; if (seg) seg.setValue(z); SB.floor.zone = z; },
    highlight() {},
  };
  /* two sheets registered through SB.sheets so the registry is exercised */
  SB.sheets.register('help', () => {
    const sh = SB.ui.sheet({ title: 'Help and shortcuts', side: 'right', width: 520 });
    sh.body.append(h('p', { class: 'sheet-copy' }, 'Tap an item to advance it. Press Esc to close a sheet.'), h('button', { type: 'button', class: 'btn', id: 'help-inner', onClick: () => SB.ui.confirm({ title: 'Reset live data?', body: 'Every ticket on the board is removed.', confirmLabel: 'Reset', tone: 'danger' }) }, 'Open a confirm'));
    sh.footer.append(h('button', { type: 'button', class: 'btn', onClick: () => sh.close() }, 'Close'));
    return sh;
  });
  SB.sheets.register('order', () => {
    const sh = SB.ui.sheet({ title: 'New ticket', side: 'right', width: 720 });
    const qty = SB.ui.stepper({ value: 1, min: 1, max: 20, label: 'Quantity' });
    sh.body.append(h('div', { class: 'stack' }, SB.ui.field({ label: 'Customer', control: h('input', { class: 'input', id: 'order-customer', type: 'text' }) }), qty));
    sh.footer.append(h('button', { type: 'button', class: 'btn', onClick: () => sh.close() }, 'Cancel'), h('button', { type: 'button', class: 'btn btn-primary', id: 'order-send', onClick: () => { sh.close(); SB.ui.toast('Ticket #106 sent to 3 stations.', { tone: 'ok', undo: () => SB.ui.toast('Ticket removed.', { tone: 'info' }) }); } }, 'Send to kitchen'));
    return sh;
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
