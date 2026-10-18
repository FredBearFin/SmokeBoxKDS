/* Test stub (NOT part of the app): a gallery of every base component, rendered with the real SB.ui / SB.icons helpers.
 * SB.gallery.render(containerEl) fills the container. Used by test/shell.e2e.mjs in Day, Night, Ember and Paper. */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util, h = U.h, ui = () => SB.ui;
  const ico = (n, s, o) => SB.icons.svg(n, Object.assign({ size: s || 20 }, o || {}));

  function section(title, ...kids) {
    return h('section', { class: 'g-sec' }, h('h3', { class: 'g-h' }, title), h('div', { class: 'g-body' }, kids));
  }
  function item(label, node) { return h('div', { class: 'g-item' }, h('div', { class: 't-muted', style: 'font-size:13px' }, label), node); }

  function slip(o) {
    const items = o.items.map((it) => h('button', { type: 'button', class: 'slip-item', dataset: { state: it.state || 'displayed' } },
      h('span', { class: 'slip-qty' }, String(it.qty)),
      h('span', { class: 'slip-name' }, it.name),
      h('span', { class: 'chip chip-zone', dataset: { zone: it.zone } }, ico(it.zoneIcon, 16), h('span', null, it.code)),
      it.mods && it.mods.length ? h('span', { class: 'slip-mods' }, it.mods.map((m) => h('span', { class: 'chip chip-mod' }, m))) : null));
    return h('article', { class: 'slip' + (o.printing ? ' is-printing' : ''), dataset: { level: o.level || 'ok' } },
      h('span', { class: 'slip-clip', 'aria-hidden': 'true' }),
      h('div', { class: 'slip-head' },
        h('div', { class: 'slip-id' },
          h('span', { class: 'slip-num' }, '#' + o.num),
          h('span', { class: 'slip-who' }, o.who),
          h('div', { class: 'slip-meta' }, ico(o.chIcon, 18), h('span', null, o.channel))),
        h('div', { class: 'slip-time' },
          h('span', { class: 'slip-timer', dataset: { level: o.level || 'ok' } }, o.timer),
          o.level && o.level !== 'ok' ? ui().badge(o.level) : null),
        o.rush ? h('span', { class: 'stamp slip-stamp' }, 'Rush') : null,
        h('div', { class: 'slip-progress', style: '--v:' + (o.progress || 0) }, h('i'))),
      h('div', { class: 'slip-body' },
        o.note ? h('div', { class: 'slip-note' }, ico('alert', 22), h('span', null, o.note)) : null,
        items,
        h('div', { class: 'slip-foot' }, h('button', { type: 'button', class: 'btn' }, ico('check', 20), h('span', null, 'All done here')), o.bump ? h('button', { type: 'button', class: 'btn btn-success btn-lg' }, 'Bump') : null)),
      h('div', { class: 'slip-tear', 'aria-hidden': 'true' }));
  }

  function slipsList() {
    return [
      slip({ num: 104, who: 'Table 4', channel: 'Dine-in', chIcon: 'plate', timer: '02:48', progress: 34, note: 'Nut allergy. Sauce on the side.', items: [
          { qty: 2, name: 'Brisket 1/2 lb', zone: 'pit', code: 'PIT', zoneIcon: 'flame', mods: ['Moist', 'Extra bark'] },
          { qty: 1, name: 'Mac and cheese', zone: 'sides', code: 'HOT', zoneIcon: 'pot', state: 'done' },
          { qty: 1, name: 'Jalapeno slaw', zone: 'cold', code: 'CLD', zoneIcon: 'snow', state: 'queued' }] }),
      slip({ num: 105, who: 'Pickup, Rivera', channel: 'Takeout', chIcon: 'bag', timer: '08:12', level: 'warn', progress: 60, rush: true, items: [
          { qty: 1, name: 'Rib rack', zone: 'pit', code: 'PIT', zoneIcon: 'flame', state: 'cooking' },
          { qty: 3, name: 'Fried pickles', zone: 'fry', code: 'FRY', zoneIcon: 'fry', mods: ['No ranch'] }] }),
      slip({ num: 106, who: 'Drive-thru 3 with a very long customer name that must wrap', channel: 'Drive-thru', chIcon: 'car', timer: '12:31', level: 'breach', progress: 82, rush: true, bump: true, note: 'Customer waiting at the window.', items: [
          { qty: 1, name: 'Pulled pork sandwich', zone: 'pit', code: 'PIT', zoneIcon: 'flame', state: 'done' },
          { qty: 2, name: 'Cornbread', zone: 'sides', code: 'HOT', zoneIcon: 'pot', state: 'done' }] })
    ];
  }

  function render(el) {
    U.clear(el);
    const u = ui();
    const wrap = h('div', { class: 'g-wrap' });

    wrap.appendChild(section('Buttons',
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-primary' }, ico('plus', 22), h('span', null, 'New ticket')),
        h('button', { type: 'button', class: 'btn btn-success btn-lg' }, ico('check', 22), h('span', null, 'Bump')),
        h('button', { type: 'button', class: 'btn' }, 'Neutral'),
        h('button', { type: 'button', class: 'btn btn-danger' }, ico('trash', 20), h('span', null, 'Void ticket')),
        h('button', { type: 'button', class: 'btn btn-ghost' }, 'Ghost'),
        h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Settings' }, ico('settings', 22)),
        h('button', { type: 'button', class: 'btn btn-sm' }, 'Small (office)')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', 'aria-pressed': 'true' }, ico('moon', 20), h('span', null, 'Night, pressed')),
        h('button', { type: 'button', class: 'btn is-pressed' }, 'Held down'),
        h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Disabled primary'),
        h('button', { type: 'button', class: 'btn', disabled: true }, 'Disabled'),
        h('button', { type: 'button', class: 'btn btn-block', style: 'max-width:280px' }, 'A very long button label that has to wrap inside its slab without leaving it'))));

    wrap.appendChild(section('Chips, badges, stations',
      h('div', { class: 'row' },
        u.chip({ label: 'Walk-up' }), u.chip({ label: 'Synced', tone: 'ok', icon: 'check' }), u.chip({ label: 'Check temp', tone: 'warn', icon: 'thermometer' }), u.chip({ label: 'Sold out', tone: 'bad', icon: 'ban' }), u.chip({ label: 'Demo x5', tone: 'info', icon: 'fast-forward' }),
        u.chip({ label: 'Table 4', onClick: () => {} }), u.chip({ label: 'Pickup', onClick: () => {}, pressed: true })),
      h('div', { class: 'row' }, u.badge('ok'), u.badge('warn'), u.badge('breach')),
      h('div', { class: 'row' },
        u.chip({ label: 'PIT', icon: 'flame', zone: 'pit' }), u.chip({ label: 'HOT', icon: 'pot', zone: 'sides' }), u.chip({ label: 'FRY', icon: 'fry', zone: 'fry' }), u.chip({ label: 'CLD', icon: 'snow', zone: 'cold' }), u.chip({ label: 'EXP', icon: 'bag', zone: 'expo' }),
        u.chip({ label: 'Extra bark', mod: true }), u.chip({ label: 'No pickles', mod: true }))));

    const seg1 = u.segmented({ label: 'Channel', value: 'dine_in', options: [{ id: 'dine_in', label: 'Dine-in', icon: 'plate' }, { id: 'takeout', label: 'Takeout', icon: 'bag' }, { id: 'drive_thru', label: 'Drive-thru', icon: 'car' }, { id: 'third_party', label: 'Delivery app', icon: 'phone' }] });
    const seg2 = u.segmented({ label: 'Station', kind: 'tabs', value: 'all', options: [{ id: 'all', label: 'All', count: 7 }, { id: 'pit', label: 'PIT', icon: 'flame', count: 3, alert: true, alertLabel: 'has overdue tickets' }, { id: 'sides', label: 'HOT', icon: 'pot', count: 2 }, { id: 'fry', label: 'FRY', icon: 'fry', count: 0 }] });
    wrap.appendChild(section('Segmented', h('div', { class: 'row' }, seg1), h('div', { class: 'row' }, seg2)));

    wrap.appendChild(section('Steppers',
      h('div', { class: 'row' },
        item('Quantity', u.stepper({ value: 2, min: 1, max: 20, label: 'Quantity' })),
        item('Temperature, 1 and 5 degree steps', u.stepper({ value: 152, min: 32, max: 300, step: 1, bigStep: 5, unit: '°F', label: 'Temperature' })),
        item('Raw weight', u.stepper({ value: 6200, min: 0, max: 40000, step: 100, unit: 'g', label: 'Raw weight' })),
        item('Endpoint (C)', u.stepper({ value: 85, min: 75, max: 90, step: 0.5, unit: '°C', label: 'Endpoint' })))));

    const inp = h('input', { class: 'input', type: 'text', placeholder: 'e.g. Table 14', value: 'Table 4' });
    const bad = h('input', { class: 'input', type: 'text', value: 'A customer name that is far longer than forty characters allows' });
    const note = h('textarea', { class: 'textarea', rows: 2 }, 'Nut allergy. Sauce on the side.');
    const sel = h('select', { class: 'select' }, h('option', null, 'Dine-in'), h('option', null, 'Takeout'));
    wrap.appendChild(section('Form fields',
      h('div', { class: 'g-cols' },
        u.field({ label: 'Customer', control: inp, hint: 'Up to 40 characters.' }),
        u.field({ label: 'Customer', control: bad, error: 'Use 40 characters or fewer. This one has 61.' }),
        u.field({ label: 'Note for the kitchen', control: note }),
        u.field({ label: 'Channel', control: sel })),
      h('div', { class: 'row' }, u.toggle({ label: 'Rush ticket', checked: true }), u.toggle({ label: 'Sound on new ticket', checked: false }), u.toggle({ label: 'Locked', checked: true, disabled: true }))));

    wrap.appendChild(section('Meters and panels',
      h('div', { class: 'g-cols' },
        item('Brisket 8.4 kg, plenty', u.meter({ value: 8400, max: 14000, thr: 700, tone: 'ok', label: 'Brisket stock' })),
        item('Sausage 1.1 kg, running low', u.meter({ value: 1100, max: 6000, thr: 400, tone: 'warn', label: 'Sausage stock' })),
        item('Ribs 0.5 kg, below threshold', u.meter({ value: 500, max: 12000, thr: 900, tone: 'bad', label: 'Rib stock' })),
        item('Large meter', u.meter({ value: 62, max: 100, large: true, label: 'Progress' }))),
      h('div', { class: 'g-cols' },
        h('div', { class: 'panel' }, h('h4', null, 'Panel'), h('p', { class: 't-muted' }, 'A bordered container you can act on.')),
        h('div', { class: 'panel-soft' }, h('h4', null, 'Soft panel'), h('p', { class: 't-muted' }, 'A quiet container for reading.')),
        h('div', { class: 'well' }, h('strong', null, 'Well. '), 'Sub-surface for grouped facts.', ' Press ', h('span', { class: 'kbd' }, 'Esc'), ' to close.'))));

    wrap.appendChild(section('Toast, menu, tooltip (static previews)',
      h('div', { class: 'g-stack' },
        staticToast('ok', 'Ticket #106 sent to 3 stations.'),
        staticToast('info', 'Brisket batch 3 added to the hot hold.'),
        staticToast('warn', 'Mac and cheese is 86 at the drive-thru board in 14 s.'),
        staticToast('bad', 'Pick at least one item before sending.'),
        staticToast('ok', 'Ticket #104 bumped.', true)),
      h('div', { class: 'row', style: 'align-items:flex-start' },
        h('div', { class: 'menu', style: 'position:static;animation:none;min-width:240px' },
          h('div', { class: 'menu-heading' }, 'Display'),
          menuItem('moon', 'Night theme', true), menuItem('sliders', 'Large text', false), h('div', { class: 'menu-sep' }), menuItem('help', 'Help and shortcuts'), menuItem('trash', 'Reset live data', undefined, true), menuItem('lock', 'Locked item', undefined, false, true)),
        h('div', { class: 'tooltip', style: 'position:static' }, 'Start now, ahead of the plan'))));

    wrap.appendChild(section('Sheet and confirm (static previews)',
      h('div', { class: 'g-cols' },
        h('div', { class: 'g-frame', style: 'height:300px' }, h('div', { class: 'sheet', style: 'width:100%;height:100%;animation:none;border-left:0' },
          h('header', { class: 'sheet-head' }, h('h2', { class: 'sheet-title' }, 'Recall'), h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Close' }, ico('x', 22))),
          h('div', { class: 'sheet-body' }, h('p', { class: 'sheet-copy' }, 'Recently bumped tickets, newest first. Recall puts a ticket back on its stations; stock is not restored.')),
          h('footer', { class: 'sheet-foot' }, h('button', { type: 'button', class: 'btn' }, 'Close')))),
        h('div', { class: 'g-frame', style: 'height:300px;display:grid;place-items:center;padding:12px' }, h('div', { class: 'sheet', style: 'width:100%;height:auto;animation:none;border:2px solid var(--line);border-radius:var(--r-dialog)' },
          h('header', { class: 'sheet-head' }, h('h2', { class: 'sheet-title' }, 'Void ticket #104?'), h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Close' }, ico('x', 22))),
          h('div', { class: 'sheet-body' }, h('p', null, 'The ticket leaves every station and is counted as voided. You can undo for 10 seconds.')),
          h('footer', { class: 'sheet-foot' }, h('button', { type: 'button', class: 'btn' }, 'Keep ticket'), h('button', { type: 'button', class: 'btn btn-danger' }, ico('trash', 20), h('span', null, 'Void ticket'))))))));

    wrap.appendChild(section('Ticket slips',
      h('div', { class: 'g-slips' },
        ...slipsList()),
      h('div', { class: 'row' }, h('span', { class: 'stamp' }, 'Rush'), h('span', { class: 'stamp stamp-lg' }, '86'), h('span', { class: 'stamp' }, 'Overdue'))));

    const brands = h('div', { class: 'row' }, h('span', null, SB.icons.brand(96)), h('span', null, SB.icons.brand(48)), h('span', null, SB.icons.brand(30)), SB.shell && SB.shell.brand ? SB.shell.brand() : null);
    wrap.appendChild(section('Brand mark', brands));
    const icons = h('div', { class: 'g-icons' }, SB.icons.names().map((n) => h('span', { class: 'g-icon', title: n }, ico(n, 24), h('span', null, n))));
    wrap.appendChild(section('Icons (' + SB.icons.names().length + ')', icons));

    const style = h('style', null, `
      .g-wrap{padding:16px;display:grid;gap:28px;max-width:1180px;width:100%;margin:0 auto}
      .g-sec{display:grid;gap:12px;min-width:0}
      .g-h{font-size:var(--fs-5);padding-bottom:6px;border-bottom:2px solid var(--line)}
      .g-body{display:grid;gap:14px;min-width:0}
      .g-item{display:grid;gap:4px;min-width:0}
      .g-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:14px;min-width:0}
      .g-stack{display:grid;gap:8px;max-width:600px}
      .g-stack .toast{position:relative;animation:none}
      .g-frame{position:relative;overflow:hidden;border:2px solid var(--line-soft);border-radius:6px;background:var(--scrim)}
      .g-slips{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:22px;align-items:start;padding:6px 4px 12px}
      .g-icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px}
      .g-icon{display:grid;justify-items:center;gap:4px;padding:8px 2px;font-size:12px;color:var(--ink2);background:var(--paper);border:1px solid var(--line-soft);border-radius:4px;text-align:center}
    `);
    el.append(style, wrap);
  }
  function staticToast(tone, text, undo) {
    const icon = { ok: 'check-circle', warn: 'alert', bad: 'alert-circle', info: 'info' }[tone];
    const t = h('div', { class: 'toast', dataset: { tone }, role: 'presentation' },
      h('span', { class: 'toast-icon' }, ico(icon, 22)), h('div', { class: 'toast-msg' }, text),
      h('div', { class: 'toast-actions' }, undo ? h('button', { type: 'button', class: 'btn' }, ico('undo', 18), h('span', null, 'Undo')) : null, h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Dismiss message' }, ico('x', 20))));
    if (undo) t.appendChild(h('div', { class: 'toast-bar', style: 'transform:scaleX(.62)' }));
    return t;
  }
  function menuItem(icon, label, checked, danger, disabled) {
    const b = h('button', { type: 'button', class: 'menu-item', role: checked === undefined ? 'menuitem' : 'menuitemcheckbox' }, ico(icon, 20), h('span', { class: 'menu-label' }, label));
    if (checked !== undefined) b.appendChild(h('span', { class: 'menu-check' }, checked ? ico('check', 18) : null));
    if (danger) b.setAttribute('data-danger', '');
    if (disabled) b.setAttribute('aria-disabled', 'true');
    return b;
  }
  SB.gallery = { render, slips: slipsList };
})(typeof globalThis !== 'undefined' ? globalThis : window);
