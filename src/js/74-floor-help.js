/*
 * WHAT THIS FILE IS: The Help panel, opened from the Help button on the board. Search the Guide first; then, on a kitchen joined to
 *    the hosted server, ask SmokeBox support: what happened, what kind of problem, "Kitchen is stuck right now", an optional photo,
 *    and what this device can tell support (build, screen, recent errors), shown and untickable. No login: the kitchen is known
 *    from the device. A request made offline waits on this device and sends itself when the internet is back. My requests shows
 *    each conversation; a new reply puts a dot on the Help button.
 * PARTS: the recent-trouble log (errors and refused actions), the request outbox, polling for replies, the Help sheet.
 * USES: 00-util.js, 05-icons.js, 30-store.js (refused actions), 32-cloud.js (SB.cloud), 60-shell.js (sheets, toasts), 78-guide.js
 *    (search and open). USED BY: the Help button in 70-floor-board.js (SB.support).
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
  const OUTBOX = 'smokebox.v1.supportOutbox';
  const CATS = [{ id: 'broken', label: 'Something is broken', icon: 'alert' }, { id: 'howto', label: 'How do I…', icon: 'help' }, { id: 'billing', label: 'Billing', icon: 'dollar' }, { id: 'idea', label: 'An idea', icon: 'sparkle' }];
  const STATUS_WORD = { open: 'With support', waiting: 'Answered: waiting on you', solved: 'Solved' };

  /* ---------- what this device can tell support ---------- */

  // The last 20 page errors and refused actions, newest last, so support sees what went wrong without anyone reading error codes.
  const trouble = [];
  // Keeps one trouble line, dropping the oldest past 20.
  const note = (kind, text) => { trouble.push({ t: Date.now(), kind, text: String(text).slice(0, 300) }); if (trouble.length > 20) trouble.shift(); };
  g.addEventListener('error', (e) => note('error', (e.message || 'error') + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : '')));
  g.addEventListener('unhandledrejection', (e) => note('error', 'promise: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))));
  // Refused actions are noted by wrapping the store's dispatch once (the result is passed through untouched).
  if (SB.store && typeof SB.store.dispatchEx === 'function' && !SB.store.__helpWrapped) {
    const orig = SB.store.dispatchEx;
    // Runs the action as before, and notes it when the engine refused it.
    SB.store.dispatchEx = function (type, payload, opts) {
      const r = orig.call(this, type, payload, opts);
      if (r && r.report && r.report !== 'ok' && r.report !== 'nothingToDo') note('refused', type + ': ' + r.report);
      return r;
    };
    SB.store.__helpWrapped = true;
  }
  // Everything this device can tell support, in one object.
  function diagnostics() {
    const s = SB.store && SB.store.getState ? SB.store.getState() : null;
    return {
      build: g.SB_BUILD ? String(g.SB_BUILD.id || g.SB_BUILD) : 'unknown', device: g.navigator ? g.navigator.userAgent : '', screen: g.innerWidth + '×' + g.innerHeight,
      time: new Date().toString(), kitchen: SB.cloud && SB.cloud.kitchen ? SB.cloud.kitchen.id : null, online: g.navigator ? g.navigator.onLine : null,
      openTickets: s ? s.tickets.filter((t) => t.status === 'active').length : null, dishes: s ? s.menu.filter((m) => !m.archived).length : null, recent: trouble.slice(),
    };
  }

  /* ---------- talking to the server ---------- */

  // Calls the server and returns { ok, status, body }. Never throws: no connection comes back as status 0.
  async function api(path, body) {
    try {
      const r = await g.fetch(path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
    } catch (e) { return { ok: false, status: 0, body: {} }; }
  }
  // Requests made while offline, kept on this device until they send.
  const outbox = () => { const v = U.storage.get(OUTBOX, []); return Array.isArray(v) ? v : []; };
  // Sends every waiting request, oldest first; stops at the first one that cannot go yet. Returns how many went.
  async function flush() {
    let sent = 0;
    for (const req of outbox()) {
      const r = await api('/api/support', req);
      if (r.status === 0 || r.status >= 500) break;
      U.storage.set(OUTBOX, outbox().filter((x) => x.clientId !== req.clientId));
      if (r.ok) sent++;
    }
    return sent;
  }

  /* ---------- replies: the dot on the Help button ---------- */

  const state = { tickets: [], unread: 0, listeners: new Set() };
  // Fetches this kitchen's requests and tells the Help button how many have an unread reply.
  async function refresh() {
    if (!(SB.cloud && SB.cloud.on)) return;
    await flush();
    const r = await api('/api/support');
    if (!r.ok) return;
    state.tickets = r.body.tickets || [];
    state.unread = state.tickets.filter((t) => t.unread).length;
    state.listeners.forEach((fn) => { try { fn(state.unread); } catch (e) { /* a listener's problem stays its own */ } });
  }
  if (SB.cloud && SB.cloud.on) { setTimeout(refresh, 3000); setInterval(refresh, 120e3); g.addEventListener('online', () => refresh()); }

  /* ---------- the Help sheet ---------- */

  // Opens the Help panel: Guide search, Contact support and My requests.
  function openHelpPanel() {
    const sheet = SB.ui.sheet({ title: 'Help', side: 'right', width: 'min(640px, 96vw)', name: 'support' });
    const body = h('div', { class: 'hp' });

    // 1. Search the Guide: matching pages as you type; a tap opens the page.
    const q = h('input', { class: 'input', type: 'search', placeholder: 'What do you need? Like "undo" or "fryer"', 'aria-label': 'Search the Guide', autocomplete: 'off' });
    const found = h('div', { class: 'hp-found' });
    // Lists the best Guide pages for what was typed.
    const searchNow = () => {
      U.clear(found);
      const hits = SB.guide && SB.guide.search ? SB.guide.search(q.value).slice(0, 5) : [];
      if (q.value.trim() && !hits.length) found.appendChild(h('p', { class: 'fs-sub' }, 'No Guide page matches. Ask support below.'));
      // Each match opens its Guide page.
      hits.forEach((x) => found.appendChild(h('button', { type: 'button', class: 'btn btn-block hp-hit', onClick: () => { sheet.close('guide'); SB.guide.open(x.page.id); } }, ico('book', 20), h('span', { class: 'grow' }, h('strong', null, x.page.title), h('span', { class: 'fs-sub' }, x.snippet)))));
    };
    q.addEventListener('input', searchNow);
    // Opens the Guide at its first page.
    const allGuide = h('button', { type: 'button', class: 'btn', onClick: () => { sheet.close('guide'); SB.guide.open(); } }, ico('book', 20), h('span', null, 'Open the whole Guide'));
    body.append(h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, 'Search the Guide'), q, found, allGuide));

    // 2. Ask support (only on the hosted server, where the request has somewhere to go).
    if (!(SB.cloud && SB.cloud.on)) {
      body.append(h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, 'Ask SmokeBox support'), h('p', { class: 'fs-sub' }, 'Asking support from the app works when this tablet is joined to a hosted SmokeBox kitchen.')));
      sheet.body.append(body);
      return sheet;
    }
    let cat = 'broken', photo = null;
    const what = h('textarea', { class: 'input hp-what', rows: '4', maxlength: '5000', placeholder: 'What happened? What did you tap, and what did the screen do?', 'aria-label': 'What happened' });
    const catSeg = SB.ui.segmented({ label: 'What kind of problem', value: cat, options: CATS.map((c) => ({ id: c.id, label: c.label })),
      // Remembers which kind of problem was picked.
      onChange: (id) => { cat = id; } });
    const urgency = SB.ui.segmented({ label: 'How urgent', value: 'later', options: [{ id: 'now', label: 'Kitchen is stuck right now' }, { id: 'later', label: 'When you can' }] });
    const photoIn = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'hp-photo' });
    const photoNote = h('span', { class: 'fs-sub' });
    // Shrinks a chosen photo to at most 1280 px on its long side (JPEG), so it sends quickly on a kitchen's internet.
    photoIn.addEventListener('change', () => {
      const f = photoIn.files && photoIn.files[0];
      if (!f) return;
      const img = new g.Image();
      // Draws the photo smaller onto a canvas and keeps it as a JPEG.
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = doc.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        photo = c.toDataURL('image/jpeg', 0.8); photoNote.textContent = 'Photo added.';
        URL.revokeObjectURL(img.src);
      };
      // A file the browser cannot read as a picture is not sent.
      img.onerror = () => { photo = null; photoNote.textContent = 'That photo could not be read.'; };
      img.src = URL.createObjectURL(f);
    });
    const photoBtn = h('label', { class: 'btn', for: 'hp-photo' }, ico('upload', 20), h('span', null, 'Add a photo'));
    const attach = h('input', { type: 'checkbox', checked: true, id: 'hp-attach' });
    const preview = h('pre', { class: 'hp-diag' });
    const peek = h('details', null, h('summary', null, 'See what is sent'), preview);
    peek.addEventListener('toggle', () => { if (peek.open) preview.textContent = JSON.stringify(diagnostics(), null, 2); });
    const status = h('p', { class: 'fs-sub', role: 'status' });
    // Sends the request now, or keeps it on this device until the internet is back.
    const send = async () => {
      const text = what.value.trim();
      if (!text) { status.textContent = 'Say what happened, in a few words.'; what.focus(); return; }
      const req = { clientId: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), category: cat, urgent: urgency.getValue ? urgency.getValue() === 'now' : false, body: text, photo, diagnostics: attach.checked ? diagnostics() : null };
      sendBtn.disabled = true;
      const r = await api('/api/support', req);
      sendBtn.disabled = false;
      if (r.ok) { what.value = ''; photo = null; photoNote.textContent = ''; status.textContent = 'Sent. Request ' + r.body.num + '. The answer shows in My requests, and the owner gets an email copy.'; refresh().then(paintMine); return; }
      if (r.status === 0 || r.status >= 500) { U.storage.set(OUTBOX, outbox().concat([req])); what.value = ''; status.textContent = 'No internet right now. The request is saved on this tablet and sends by itself when the internet is back.'; return; }
      status.textContent = r.body.words || 'It did not send. Try again.';
    };
    const sendBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'send-support' }, onClick: send }, ico('arrow-right', 22), h('span', null, 'Send to support'));
    body.append(h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, 'Ask SmokeBox support'),
      h('p', { class: 'fs-sub' }, 'A real person answers. No account needed: support knows which kitchen this is.'),
      what, h('div', { class: 'field-label' }, 'What kind of problem'), catSeg, h('div', { class: 'field-label' }, 'How urgent'), urgency,
      h('div', { class: 'hp-row' }, photoBtn, photoIn, photoNote),
      h('label', { class: 'hp-row', for: 'hp-attach' }, attach, h('span', null, 'Send what this tablet can tell support (version, screen, recent errors)')), peek,
      sendBtn, status));

    // 3. My requests: each conversation, newest change first; opening one clears its dot.
    const mine = h('div', { class: 'hp-mine' });
    // Draws the list of requests and their conversations.
    function paintMine() {
      U.clear(mine);
      const waiting = outbox().length;
      if (waiting) mine.appendChild(h('p', { class: 'fs-sub' }, waiting + ' ' + U.plural(waiting, 'request') + ' waiting for the internet on this tablet.'));
      if (!state.tickets.length && !waiting) { mine.appendChild(h('p', { class: 'fs-sub' }, 'No requests yet.')); return; }
      state.tickets.forEach((t) => {
        const thread = h('div', { class: 'hp-thread' });
        t.messages.forEach((m) => thread.appendChild(h('div', { class: 'hp-msg' + (m.fromStaff ? ' hp-staff' : '') }, h('div', { class: 'fs-sub' }, (m.fromStaff ? m.author + ', SmokeBox support' : m.author) + ' · ' + U.fmtTime(m.at)), h('div', { class: 'hp-body' }, m.body), m.photo ? h('img', { src: m.photo, alt: 'Photo sent with the request', class: 'hp-img' }) : null)));
        const ans = h('textarea', { class: 'input', rows: '2', maxlength: '5000', 'aria-label': 'Your answer', placeholder: 'Answer support' });
        // Sends an answer in this conversation.
        const reply = async () => { if (!ans.value.trim()) return; const r = await api('/api/support/reply', { id: t.id, body: ans.value }); if (r.ok) { ans.value = ''; await refresh(); paintMine(); } };
        const det = h('details', { class: 'hp-req' }, h('summary', null, t.unread ? h('span', { class: 'hp-dot', 'aria-label': 'New reply' }) : null, h('strong', null, 'Request ' + t.num + ': ' + t.subject), h('span', { class: 'fs-sub' }, ' · ' + (STATUS_WORD[t.status] || t.status))),
          thread, t.status !== 'solved' ? h('div', { class: 'hp-row' }, ans, h('button', { type: 'button', class: 'btn', onClick: reply }, 'Send')) : null);
        // Opening a conversation marks it read.
        det.addEventListener('toggle', () => { if (det.open && t.unread) { t.unread = false; api('/api/support/seen', { id: t.id }).then(refresh); } });
        mine.appendChild(det);
      });
    }
    body.append(h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, 'My requests'), mine));
    sheet.body.append(body);
    paintMine(); refresh().then(paintMine);
    return sheet;
  }
  SB.sheets.register('support', openHelpPanel);
  SB.support = {
    // Calls fn with the number of requests that have an unread reply, now and whenever it changes; returns a function that stops it.
    onUnread(fn) { state.listeners.add(fn); try { fn(state.unread); } catch (e) { /* ignore */ } return () => state.listeners.delete(fn); },
    diagnostics, refresh,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
