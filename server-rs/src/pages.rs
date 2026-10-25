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
