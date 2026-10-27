/*
 * WHAT THIS FILE IS: The Devices sheet, for a kitchen on the hosted server. Every tablet, phone or computer joined to the kitchen,
 *    with its name and when it was last used. Add a device shows an 8-digit code to type on the new device's start page; Rename gives
 *    a device a name people recognize; Remove signs a lost or stolen device out at once. Staff never get accounts: the device is
 *    what is joined. Behind the manager PIN when one is set.
 * PARTS: the server calls, the code box, the list.
 * USES: 00-util.js, 05-icons.js, 32-cloud.js (SB.cloud), 60-shell.js (sheets, toasts, the PIN), 72-floor-sheets.js (sheet registry).
 * USED BY: Settings (Your kitchen, Devices).
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const doc = g.document;
  if (!doc || !SB.sheets) return;
  const h = U.h;
  // Builds an icon element, or an empty span when icons are missing.
  const ico = (name, size) => { try { return SB.icons.svg(name, { size: size || 20 }); } catch (e) { return doc.createElement('span'); } };

  // Calls the server and returns { ok, status, body }. Never throws: no connection comes back as ok false with status 0.
  async function api(path, body) {
    try {
      const r = await g.fetch(path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
    } catch (e) { return { ok: false, status: 0, body: {} }; }
  }
  // Plain words for when a device was last used, like "now", "12 min ago" or "Oct 3".
  function seen(t) {
    const d = Date.now() - t;
    if (d < 2 * 60e3) return 'now';
    if (d < 60 * 60e3) return Math.round(d / 60e3) + ' min ago';
    if (d < 24 * 3600e3) return Math.round(d / 3600e3) + ' h ago';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // Opens the Devices sheet (after the manager PIN, when one is set).
  async function openDevices() {
    if (SB.shell && SB.shell.requirePin && !(await SB.shell.requirePin())) return null;
    const sheet = SB.ui.sheet({ title: 'Devices', side: 'right', width: 'min(620px, 96vw)', name: 'devices' });
    const status = h('p', { class: 'fs-sub', role: 'status' });
    const codeBox = h('div', { class: 'dv-code', hidden: true });
    const list = h('div', { class: 'dv-list' });
    let timer = 0;
    // Says what happened, in words, in the tone given.
    const say = (words, tone) => { status.textContent = words; status.dataset.tone = tone || ''; };

    // Makes an 8-digit code and shows it big, with the minutes it still works.
    async function addDevice() {
      const r = await api('/api/devices/code', {});
      if (!r.ok) { say(r.body.words || 'No connection to the server. Try again when the internet is back.', 'bad'); return; }
      clearInterval(timer);
      const code = String(r.body.code), until = r.body.expiresAt;
      const left = h('p', { class: 'fs-sub' });
      // Counts down the minutes the code still works, and says when it ran out.
      const paintLeft = () => { const m = Math.ceil((until - Date.now()) / 60e3); left.textContent = m > 0 ? 'Works once, for ' + m + ' more ' + U.plural(m, 'minute') + '.' : 'This code ran out. Make a new one.'; if (m <= 0) clearInterval(timer); };
      U.clear(codeBox);
      codeBox.append(h('p', null, 'On the new device, open Smokebox, tap ', h('strong', null, 'Join a kitchen'), ' and type:'),
        h('div', { class: 'dv-digits num', 'aria-label': 'Code ' + code.split('').join(' ') }, code.slice(0, 4) + ' ' + code.slice(4)), left);
      codeBox.hidden = false;
      paintLeft(); timer = setInterval(paintLeft, 15e3);
      say('');
    }
    // Draws the list of joined devices, this one first marked "This device".
    async function paint() {
      const r = await api('/api/devices');
      U.clear(list);
      if (!r.ok) { list.appendChild(h('p', { class: 'fs-sub' }, r.body.words || 'No connection to the server. The list shows when the internet is back.')); return; }
      for (const d of r.body.devices || []) {
        const name = h('input', { class: 'input', type: 'text', maxlength: '40', value: d.name, 'aria-label': 'Name of this device' });
        // Saves a new name when the box is left with a change.
        name.addEventListener('change', async () => {
          const v = name.value.trim();
          if (!v) { name.value = d.name; return; }
          const x = await api('/api/devices/rename', { id: d.id, name: v });
          if (x.ok) { d.name = v; say('Renamed to ' + v + '.', 'ok'); } else { name.value = d.name; say(x.body.words || 'Not renamed. Try again.', 'bad'); }
        });
        // Removes the device after a plain yes; removing this device signs it out here too.
        const remove = async () => {
          const ok = SB.ui.confirm ? await SB.ui.confirm({ title: 'Remove ' + d.name + '?', body: d.me ? 'This device leaves the kitchen now. To come back it needs a code from another screen, or the owner sign in.' : 'It is signed out at once. To come back it needs a new code.', confirmLabel: 'Remove', tone: 'danger' }) : g.confirm('Remove ' + d.name + '?');
          if (!ok) return;
          const x = await api('/api/devices/remove', { id: d.id });
          if (!x.ok) { say(x.body.words || 'Not removed. Try again.', 'bad'); return; }
          if (x.body.self) { g.location.href = '/start'; return; }
          say(d.name + ' is removed and signed out.', 'ok'); paint();
        };
        list.appendChild(h('div', { class: 'dv-row' },
          ico(/phone/i.test(d.name) ? 'phone' : 'grid', 22),
          h('div', { class: 'dv-main' }, name, h('div', { class: 'fs-sub' }, (d.me ? 'This device. ' : '') + 'Last used ' + seen(d.lastSeen) + '.')),
          h('button', { type: 'button', class: 'btn btn-sm', dataset: { act: 'remove-device' }, onClick: remove }, ico('trash', 18), h('span', null, 'Remove'))));
      }
    }
    sheet.body.append(h('div', { class: 'dv' },
      h('p', { class: 'fs-sub' }, 'Every screen joined to ' + (SB.cloud && SB.cloud.kitchen ? SB.cloud.kitchen.name : 'this kitchen') + '. Cooks never need an account: join the device, and anyone on shift can use it.'),
      h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'add-device' }, onClick: addDevice }, ico('plus', 22), h('span', null, 'Add a device')),
      codeBox, status, h('h3', { class: 'fs-h' }, 'Joined devices'), list));
    paint();
    return sheet;
  }
  SB.sheets.register('devices', openDevices);
})(typeof globalThis !== 'undefined' ? globalThis : window);
