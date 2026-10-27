/*
 * WHAT THIS FILE IS: The Billing sheet, for a kitchen on the hosted server. It says where the SmokeBox plan stands (free weeks
 *    left, paid, payment failed, cancelled) and opens Stripe's own pages to add a card, change it, see receipts or cancel. No card
 *    number ever touches SmokeBox. Behind the manager PIN when one is set. Also says thanks when the owner comes back from Stripe.
 * PARTS: the words for each state, the sheet, the welcome back from Stripe.
 * USES: 00-util.js, 05-icons.js, 32-cloud.js (SB.cloud), 60-shell.js (sheets, toasts, the PIN), 72-floor-sheets.js (sheet registry).
 * USED BY: Settings (Your kitchen, Billing).
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
  // A date in plain words, like "Nov 14".
  const day = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  // The heading and the sentence for a billing state, from what the server says.
  function stateWords(b, now) {
    const days = (t) => Math.max(0, Math.ceil((t - now) / 86400e3));
    if (b.paused) return { tone: 'bad', head: 'New orders are paused', text: 'The SmokeBox payment is overdue. Open tickets, reports and backups still work. Fix the card and orders start again at once.' };
    if (b.status === 'setup') return { tone: 'warn', head: 'Add a card to start', text: 'Your 3 free weeks start when you add a card. Nothing is charged until week 4, and you can cancel any time before.' };
    if (b.status === 'trialing') return { tone: 'ok', head: 'Free weeks', text: (b.trialEndsAt ? days(b.trialEndsAt) + ' ' + U.plural(days(b.trialEndsAt), 'day') + ' left. The first charge is on ' + day(b.trialEndsAt) + '.' : 'Your free weeks have started.') + ' Cancel any time before then and nothing is charged.' };
    if (b.status === 'active') return { tone: 'ok', head: 'Paid', text: b.paidThrough ? 'Paid through ' + day(b.paidThrough) + '. The next charge happens by itself.' : 'Your plan is paid. The next charge happens by itself.' };
    if (b.status === 'past_due') return { tone: 'bad', head: 'Payment failed', text: 'Stripe could not charge the card. Update it before new orders pause' + (b.pauseAt ? ' at ' + new Date(b.pauseAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '') + '. A pause never starts in the middle of service.' };
    if (b.status === 'canceled') return { tone: 'warn', head: 'Plan cancelled', text: 'Restart the plan to keep taking new orders. Your menu, reports and history are all still here.' };
    return { tone: 'ok', head: 'No billing', text: 'This server does not charge for SmokeBox.' };
  }

  // Opens the Billing sheet (after the manager PIN, when one is set).
  async function openBilling() {
    if (SB.shell && SB.shell.requirePin && !(await SB.shell.requirePin())) return null;
    let stop = null;
    const sheet = SB.ui.sheet({ title: 'Billing', side: 'right', width: 'min(560px, 96vw)', name: 'billing', onClose: () => { if (stop) stop(); } });
    const status = h('p', { class: 'fs-sub', role: 'status' });
    const box = h('div', { class: 'bl' });
    // Opens one of Stripe's pages, or says why it could not.
    const go = async (page) => { status.textContent = 'Opening the secure Stripe page...'; const why = await SB.cloud.openBillingPage(page); if (why) status.textContent = why; };
    // Draws the sheet from the latest billing state.
    function paint() {
      const b = (SB.cloud && SB.cloud.billing && SB.cloud.billing()) || { status: 'off' };
      const w = stateWords(b, Date.now());
      const buttons = [];
      // Add a card (or restart a cancelled plan) opens Stripe Checkout.
      if (b.status === 'setup' || b.status === 'canceled' || (!b.hasCard && b.status !== 'off'))
        buttons.push(h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'billing-checkout' }, onClick: () => go('checkout') }, ico('dollar', 22), h('span', null, b.status === 'canceled' ? 'Restart the plan' : 'Add a card')));
      // With a card on file, Stripe's own portal changes it, shows receipts or cancels.
      if (b.hasCard && b.status !== 'canceled')
        buttons.push(h('button', { type: 'button', class: 'btn ' + (b.status === 'past_due' ? 'btn-primary btn-lg' : 'btn-block'), dataset: { act: 'billing-portal' }, onClick: () => go('portal') }, ico('receipt', 22), h('span', null, 'Change the card, see receipts or cancel')));
      U.clear(box);
      box.append(h('div', { class: 'bl-state', dataset: { tone: w.tone } }, h('h3', { class: 'fs-h' }, w.head), h('p', null, w.text)), ...buttons, status,
        h('p', { class: 'fs-sub' }, 'Card details are kept by Stripe, never by SmokeBox. Every device in the kitchen sees the same plan.'));
    }
    sheet.body.append(box);
    paint();
    if (SB.cloud && SB.cloud.refreshBilling) SB.cloud.refreshBilling();
    stop = SB.cloud && SB.cloud.onChange ? SB.cloud.onChange(paint) : null;
    return sheet;
  }
  SB.sheets.register('billing', openBilling);

  // Coming back from Stripe (?billing=done or ?billing=later): say what happened once, fetch the new state and tidy the address.
  function welcomeBack() {
    let q = null;
    try { q = new URLSearchParams(g.location.search).get('billing'); } catch (e) { return; }
    if (!q) return;
    try { const u = new URL(g.location.href); u.searchParams.delete('billing'); g.history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* old browser */ }
    // Waits until the app has started, then shows the words.
    const show = () => {
      if (!(SB.booted && SB.ui && SB.ui.toast)) { setTimeout(show, 200); return; }
      SB.ui.toast(q === 'done' ? 'Card added. Your 3 free weeks have started.' : 'No card added yet. Add one from Settings, Billing.', { tone: q === 'done' ? 'ok' : 'warn' });
      // Stripe's confirmation usually lands within seconds: ask every 3 s for a minute so the strip does not lag behind.
      if (SB.cloud && SB.cloud.refreshBilling) for (let i = 0; i <= 20; i++) setTimeout(SB.cloud.refreshBilling, i * 3000);
    };
    show();
  }
  SB.billingSheet = { stateWords };
  welcomeBack();
})(typeof globalThis !== 'undefined' ? globalThis : window);
