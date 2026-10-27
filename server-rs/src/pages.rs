//! The small pages the server shows before a device is joined: the start page (Join a kitchen, Start a new kitchen, Owner sign
//! in, Forgot password) and the page that sets a new owner password. Self-contained, in the app's colors, big tap targets.

// The shared look of every page, so they match the app.
const STYLE: &str = r#"
:root{--bg:#F5F2EB;--paper:#fff;--ink:#1F2326;--ink2:#4A5258;--line:#C9C2B4;--amber:#B85C38;--bad:#9B2C2C;--ok:#2F6B45}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:18px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
main{width:100%;max-width:460px;background:var(--paper);border:2px solid var(--line);border-radius:14px;padding:28px}
h1{font-size:28px;margin:0 0 6px}p{margin:0 0 16px;color:var(--ink2)}label{display:block;font-weight:600;margin:14px 0 6px}
input{width:100%;font:inherit;padding:12px;border:2px solid var(--line);border-radius:10px;background:#fff;color:var(--ink)}input:focus{outline:3px solid var(--amber);outline-offset:1px}
input.code{font-size:40px;letter-spacing:12px;text-align:center;font-variant-numeric:tabular-nums}
button{width:100%;margin-top:18px;min-height:56px;font:inherit;font-weight:700;color:#fff;background:var(--amber);border:0;border-radius:10px;cursor:pointer}
button.big{min-height:72px;font-size:22px}button.plain{background:#fff;color:var(--ink);border:2px solid var(--line)}button:disabled{opacity:.6}
.err{color:var(--bad);font-weight:600;min-height:1.4em;margin:12px 0 0}.ok{color:var(--ok);font-weight:600}
.links{margin:20px 0 0;text-align:center;font-size:16px}.links a{color:var(--ink2);margin:0 8px}a{color:var(--amber)}[hidden]{display:none!important}
"#;

/// The start page: two big choices and the owner sign-in underneath. Each choice opens its own short form on the same page.
pub fn start_page() -> String {
    format!(
        r##"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Smokebox</title><style>{STYLE}</style></head><body><main>
<section id="choose"><h1>Smokebox</h1><p>The kitchen coach. Pick one.</p>
<button class="big" type="button" data-go="join">Join a kitchen</button>
<p style="margin:8px 0 0;font-size:15px">Your kitchen already uses Smokebox. You need the 6-digit code from another screen.</p>
<button class="big plain" type="button" data-go="new">Start a new kitchen</button>
<div class="links"><a href="#" data-go="owner">Owner sign in</a></div></section>

<section id="join" hidden><h1>Join a kitchen</h1><p>On a screen that already shows your kitchen: Back office, Devices, Add a device. Type the code it shows.</p>
<form data-api="/api/join"><label for="code">Code</label><input class="code" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
<button type="submit">Join</button><p class="err" role="alert"></p></form><div class="links"><a href="#" data-go="choose">Back</a></div></section>

<section id="new" hidden><h1>Start a new kitchen</h1><p>For the owner. Your email is only used for paying, a forgotten password and replies from support.</p>
<form data-api="/api/start"><label for="kitchen">Kitchen name</label><input id="kitchen" name="kitchen" maxlength="60" required>
<label for="nemail">Owner email</label><input id="nemail" name="email" type="email" autocomplete="email" required>
<label for="npw">Password (8 or more characters)</label><input id="npw" name="password" type="password" autocomplete="new-password" minlength="8" required>
<button type="submit">Start my kitchen</button><p class="err" role="alert"></p></form><div class="links"><a href="#" data-go="choose">Back</a></div></section>

<section id="owner" hidden><h1>Owner sign in</h1><p>Use this on a new device when no other screen can give you a code.</p>
<form data-api="/api/login"><label for="oemail">Owner email</label><input id="oemail" name="email" type="email" autocomplete="email" required>
<label for="opw">Password</label><input id="opw" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button><p class="err" role="alert"></p></form>
<div class="links"><a href="#" data-go="forgot">Forgot password</a><a href="#" data-go="choose">Back</a></div></section>

<section id="forgot" hidden><h1>Forgot password</h1><p>We email the owner a link to set a new password.</p>
<form data-api="/api/forgot"><label for="femail">Owner email</label><input id="femail" name="email" type="email" autocomplete="email" required>
<button type="submit">Send the link</button><p class="err" role="alert"></p></form><div class="links"><a href="#" data-go="owner">Back</a></div></section>
</main>
<script>
const show = (id) => {{ for (const s of document.querySelectorAll('section')) s.hidden = s.id !== id; const f = document.querySelector('#' + id + ' input'); if (f) f.focus(); }};
for (const a of document.querySelectorAll('[data-go]')) a.addEventListener('click', (e) => {{ e.preventDefault(); show(a.dataset.go); }});
for (const f of document.querySelectorAll('form[data-api]')) f.addEventListener('submit', async (ev) => {{
  ev.preventDefault();
  const btn = f.querySelector('button'), err = f.querySelector('.err');
  const body = {{ device: navigator.userAgent.slice(0, 120) }};
  for (const i of f.querySelectorAll('input')) body[i.name] = i.type === 'password' ? i.value : i.value.trim();
  btn.disabled = true; err.textContent = ''; err.className = 'err';
  try {{
    const r = await fetch(f.dataset.api, {{ method: 'POST', headers: {{ 'content-type': 'application/json' }}, body: JSON.stringify(body) }});
    const b = await r.json().catch(() => ({{}}));
    if (r.ok && b.go) {{ location.href = b.go; return; }}
    if (r.ok && b.words) {{ err.className = 'ok'; err.textContent = b.words; }}
    else err.textContent = b.words || 'That did not work. Try again.';
  }} catch (e) {{ err.textContent = 'No connection to the server. Check the internet and try again.'; }}
  btn.disabled = false;
}});
</script></body></html>"##
    )
}

/// The page an owner opens from the reset email: one new password, then back to sign in.
pub fn reset_page() -> String {
    format!(
        r##"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>New password</title><style>{STYLE}</style></head><body><main><h1>Set a new password</h1><p>For the owner sign in.</p>
<form id="f"><label for="pw">New password (8 or more characters)</label><input id="pw" type="password" autocomplete="new-password" minlength="8" required>
<button type="submit">Save the password</button><p class="err" id="err" role="alert"></p></form><div class="links"><a href="/start">Back to the start page</a></div></main>
<script>
document.getElementById('f').addEventListener('submit', async (ev) => {{
  ev.preventDefault();
  const err = document.getElementById('err'), token = new URLSearchParams(location.search).get('t') || '';
  const r = await fetch('/api/reset', {{ method: 'POST', headers: {{ 'content-type': 'application/json' }}, body: JSON.stringify({{ token, password: document.getElementById('pw').value }}) }}).catch(() => null);
  const b = r ? await r.json().catch(() => ({{}})) : {{}};
  err.className = r && r.ok ? 'ok' : 'err';
  err.textContent = b.words || 'No connection to the server. Try again.';
}});
</script></body></html>"##
    )
}

/// The staff console: sign in (password and authenticator code), the inbox with stuck kitchens first, and one request with what
/// the device attached, the conversation, an answer box (or a staff-only note) and the status. Everything is drawn with
/// textContent, so nothing a customer types can become page code.
pub fn staff_page() -> String {
    format!(
        r##"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SmokeBox support</title><style>{STYLE}
body{{display:block;padding:0}}main{{max-width:none;border:0;border-radius:0;padding:0}}
#login{{max-width:420px;margin:8vh auto;background:#fff;border:2px solid var(--line);border-radius:14px;padding:28px}}
#app{{display:grid;grid-template-columns:minmax(300px,420px) 1fr;min-height:100vh}}#side{{border-right:2px solid var(--line);background:#fff;overflow:auto}}
#health{{padding:10px 14px;font-size:14px;border-bottom:1px solid var(--line);background:#FBF7F2}}#health .bad{{color:var(--bad);font-weight:700}}#tabs{{display:flex;gap:6px;padding:12px;position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line)}}#tabs button{{margin:0;min-height:40px;width:auto;flex:1;font-size:15px}}
#tabs button[aria-pressed=false]{{background:#fff;color:var(--ink);border:2px solid var(--line)}}
.t{{display:block;width:100%;text-align:left;margin:0;border-radius:0;min-height:0;padding:12px 14px;background:#fff;color:var(--ink);border-bottom:1px solid var(--line);font-weight:400}}
.t.sel{{background:#F3E4DA}}.t b{{display:block}}.t small{{color:var(--ink2)}}.stuck{{color:#fff;background:var(--bad);border-radius:6px;padding:1px 6px;font-size:13px;font-weight:700;margin-right:6px}}
#view{{padding:24px;overflow:auto}}.msg{{border:2px solid var(--line);border-radius:10px;padding:10px 12px;margin:10px 0;background:#fff;white-space:pre-wrap}}
.msg.staff{{border-color:var(--amber)}}.msg.note{{background:#FFF7D6;border-style:dashed}}.msg img{{max-width:100%;margin-top:8px;border-radius:6px}}
.meta{{font-size:14px;color:var(--ink2);margin-bottom:4px}}details{{margin:12px 0}}pre{{white-space:pre-wrap;background:#fff;border:1px solid var(--line);padding:10px;border-radius:8px;font-size:13px}}
textarea{{width:100%;min-height:120px;font:inherit;padding:12px;border:2px solid var(--line);border-radius:10px}}.row{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}.row button{{width:auto;padding:0 18px}}
</style></head><body><main>
<section id="login"><h1>SmokeBox support</h1><p>Staff only.</p><form id="lf">
<label for="em">Email</label><input id="em" type="email" autocomplete="username" required>
<label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required>
<label for="cd">Code from your authenticator app</label><input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required>
<button type="submit">Sign in</button><p class="err" id="lerr" role="alert"></p></form></section>
<div id="app" hidden><aside id="side"><div id="health" role="status"></div><div id="tabs"></div><div id="list"></div></aside><section id="view"><p>Pick a request.</p></section></div>
</main><script>
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {{ const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }};
const when = (t) => new Date(t).toLocaleString(undefined, {{ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }});
const CAT = {{ broken: 'Something is broken', howto: 'How do I', billing: 'Billing', idea: 'Idea' }};
let status = 'open', current = location.hash.slice(1) || null;
async function api(path, body) {{
  const r = await fetch(path, body ? {{ method: 'POST', headers: {{ 'content-type': 'application/json' }}, body: JSON.stringify(body) }} : {{}});
  if (r.status === 401) {{ $('#app').hidden = true; $('#login').hidden = false; throw new Error('signed out'); }}
  return r.json();
}}
$('#lf').addEventListener('submit', async (e) => {{
  e.preventDefault();
  const r = await fetch('/staff/api/login', {{ method: 'POST', headers: {{ 'content-type': 'application/json' }}, body: JSON.stringify({{ email: $('#em').value, password: $('#pw').value, code: $('#cd').value }}) }});
  const b = await r.json().catch(() => ({{}}));
  if (!r.ok) {{ $('#lerr').textContent = b.words || 'That did not work.'; return; }}
  start();
}});
function tabs() {{
  const t = $('#tabs'); t.textContent = '';
  for (const [id, label] of [['open', 'Open'], ['waiting', 'Waiting on kitchen'], ['solved', 'Solved'], ['all', 'All']]) {{
    const b = el('button', '', label); b.type = 'button'; b.setAttribute('aria-pressed', String(id === status));
    b.onclick = () => {{ status = id; tabs(); list(); }}; t.appendChild(b);
  }}
}}
// The service line at the top: errors in the last day, the last backup and the last test restore. Red when something needs a look.
async function health() {{
  const b = await api('/staff/api/health'), box = $('#health'); box.textContent = '';
  const day = 24 * 3600e3, now = Date.now();
  const line = (bad, text) => box.appendChild(el('div', bad ? 'bad' : '', text));
  line(b.errors24h > 0, b.errors24h + ' error' + (b.errors24h === 1 ? '' : 's') + ' in the last day' + (b.recent[0] ? ' (newest: ' + b.recent[0].what + (b.recent[0].kitchen ? ', ' + b.recent[0].kitchen : '') + ')' : ''));
  const bk = b.backup;
  line(!bk || !bk.ok || now - bk.at > 1.5 * day || !bk.offsite, bk ? 'Backup ' + when(bk.at) + (bk.ok ? ', ' + Math.round(bk.size / 1024) + ' KB' : ' FAILED') + (bk.offsite ? ', copied off the server' : ', not copied off the server') : 'No backup recorded yet');
  const rc = b.restoreCheck;
  line(!rc || !rc.ok || now - rc.at > 8 * day, rc ? 'Test restore ' + when(rc.at) + (rc.ok ? ': OK' : ': FAILED ' + rc.note) : 'No test restore yet');
}}
async function list() {{
  health().catch(() => {{}});
  const b = await api('/staff/api/tickets?status=' + status), box = $('#list'); box.textContent = '';
  if (!b.tickets.length) box.appendChild(el('p', '', 'Nothing here.'));
  for (const t of b.tickets) {{
    const row = el('button', 't' + (t.id === current ? ' sel' : '')); row.type = 'button';
    const head = el('b'); if (t.urgent && t.status === 'open') head.appendChild(el('span', 'stuck', 'STUCK'));
    head.appendChild(document.createTextNode('#' + t.num + ' ' + t.subject));
    row.append(head, el('small', '', t.kitchen + ' · ' + CAT[t.category] + ' · ' + when(t.updatedAt) + (t.lastFromStaff ? ' · answered' : '')));
    row.onclick = () => {{ current = t.id; location.hash = t.id; list(); show(); }};
    box.appendChild(row);
  }}
}}
async function show() {{
  const v = $('#view'); if (!current) return;
  const t = await api('/staff/api/ticket?id=' + encodeURIComponent(current)); v.textContent = '';
  if (!t.id) {{ v.appendChild(el('p', '', 'Not found.')); return; }}
  v.append(el('h1', '', '#' + t.num + ' ' + t.subject), el('p', '', (t.urgent ? 'Kitchen is stuck right now. ' : '') + CAT[t.category] + '. Status: ' + t.status + '.'));
  v.appendChild(el('p', '', t.kitchen.name + ' · owner ' + (t.kitchen.owner || 'none') + ' · plan ' + t.kitchen.plan + ' (' + t.kitchen.billing + ')' + ' · ' + t.kitchen.devices + ' devices · since ' + when(t.kitchen.since)));
  if (t.diagnostics) {{ const d = el('details'); d.append(el('summary', '', 'What the device attached'), el('pre', '', JSON.stringify(t.diagnostics, null, 2))); v.appendChild(d); }}
  for (const m of t.messages) {{
    const box = el('div', 'msg' + (m.fromStaff ? ' staff' : '') + (m.internal ? ' note' : ''));
    box.append(el('div', 'meta', (m.internal ? 'Staff note · ' : '') + m.author + ' · ' + when(m.at)), document.createTextNode(m.body));
    if (m.photo) {{ const i = el('img'); i.src = m.photo; i.alt = 'Picture sent with the request'; box.appendChild(i); }}
    v.appendChild(box);
  }}
  const ta = el('textarea'); ta.setAttribute('aria-label', 'Answer');
  const note = el('input'); note.type = 'checkbox'; note.id = 'note'; note.style.width = 'auto';
  const lab = el('label', '', ' Staff note only (the kitchen does not see it)'); lab.prepend(note); lab.style.fontWeight = '400';
  const send = el('button', '', 'Send'); send.type = 'button';
  send.onclick = async () => {{ if (!ta.value.trim()) return; await api('/staff/api/reply', {{ id: t.id, body: ta.value, internal: note.checked }}); list(); show(); }};
  const row = el('div', 'row'); row.append(send);
  for (const s of ['open', 'waiting', 'solved']) {{ const b = el('button', 'plain', 'Mark ' + s); b.type = 'button'; b.onclick = async () => {{ await api('/staff/api/status', {{ id: t.id, status: s }}); list(); show(); }}; row.appendChild(b); }}
  v.append(el('h2', '', 'Answer'), ta, lab, row);
}}
function start() {{ $('#login').hidden = true; $('#app').hidden = false; tabs(); list(); show(); setInterval(list, 30000); }}
fetch('/staff/api/tickets?status=open').then((r) => {{ if (r.ok) start(); }});
</script></body></html>"##
    )
}
