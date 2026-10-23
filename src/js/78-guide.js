/*
 * WHAT THIS FILE IS: The in-app Guide: a short list of plain-words help pages (SB.guide) shown on its own
 *   screen at the address #/guide (or #/guide/page-name). The text comes from docs/sop/*.md.
 * PARTS: the page data (written by tools/build-guide.mjs), text helpers, drawing the screen, show and open.
 * USES: 00-util.js (h, clear), 05-icons.js, 60-shell.js (router, mounts this into its guide layer).
 * USED BY: 60-shell.js; menus call SB.guide.open(). Styles are in 24-guide.css.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const doc = g.document || null;

  // The Guide pages: id, title, summary and blocks (h = heading, p = paragraph, ol and ul = lists). Inside the
  // text, **double stars** mark the name of a button or screen exactly as it appears in the app.
  // audit:data-start
  // guide:data-start (written by tools/build-guide.mjs from docs/sop; do not edit by hand)
  const PAGES = [
   {
    "id": "getting-started",
    "title": "Getting started",
    "summary": "Set up the kitchen, send a test order, take payment and save your first backup. About ten minutes.",
    "blocks": [
     {
      "t": "h",
      "x": "1. Set up your kitchen"
     },
     {
      "t": "p",
      "x": "On a new device the board shows a bar with **Set up your kitchen**. Tap it. It asks for your sales tax, your opening hours, an optional manager PIN, your dishes and any food that is already cooked. You can skip a step and come back to it later."
     },
     {
      "t": "h",
      "x": "2. Add your first dish"
     },
     {
      "t": "ol",
      "x": [
       "Tap **Back office** at the top of the board, then **Menu and settings**.",
       "Tap **Add a dish**.",
       "Type the dish name and the price. Pick the station that cooks it.",
       "Choose how it is cooked. One tap means it is done when it is plated, like a drink. Start, then done means the cook taps Start and then Done.",
       "Tap **Add dish**."
      ]
     },
     {
      "t": "p",
      "x": "Smokebox starts with sample dishes so you can practice. When you are ready for real service, tap **Use only my own dishes** on that same page."
     },
     {
      "t": "h",
      "x": "3. Send a test order"
     },
     {
      "t": "ol",
      "x": [
       "Go back to the board and tap **New ticket**.",
       "Tap your dish on the menu, then tap **Send to kitchen**.",
       "The ticket appears on the board. Tap **Start**, then **Done** on the dish, then **Bump** the ticket."
      ]
     },
     {
      "t": "p",
      "x": "A test order is a real order in your reports. To remove it, void it (see Taking an order)."
     },
     {
      "t": "h",
      "x": "4. Take payment"
     },
     {
      "t": "ol",
      "x": [
       "Tap **Orders**, find the order and tap **Pay**.",
       "Choose Cash, Card or Other. Add a tip if there is one. Tap **Mark paid**."
      ]
     },
     {
      "t": "p",
      "x": "Smokebox only writes down how the order was paid. It never charges a card."
     },
     {
      "t": "h",
      "x": "5. Save a backup"
     },
     {
      "t": "p",
      "x": "Tap **Back office**, then **Menu and settings**. Find Data, backup and reset and tap **Download backup (JSON)**. Keep a copy off this device: email it to yourself or put it on a USB drive."
     }
    ]
   },
   {
    "id": "taking-an-order",
    "title": "Taking an order",
    "summary": "Start an order, add dishes and notes, send it to the kitchen, and add to it later.",
    "blocks": [
     {
      "t": "h",
      "x": "Start the order"
     },
     {
      "t": "p",
      "x": "Tap **New ticket**. Tap a dish to add it. Tap it again to add one more. Use the search box to find a dish by name. A dish marked 86 is sold out or off the menu and cannot be added."
     },
     {
      "t": "h",
      "x": "Customer and order type"
     },
     {
      "t": "p",
      "x": "Type a name or tap a quick name. Leave it blank for Walk-up. Choose how the order came in: Dine-in, Takeout, Drive-thru or Delivery app. Each type has its own time limit before a ticket turns amber and then red."
     },
     {
      "t": "h",
      "x": "Allergies and notes"
     },
     {
      "t": "p",
      "x": "Tap **Any food allergy?** and tap what the customer is allergic to. Put allergies first in the note. Cooks read the first line first."
     },
     {
      "t": "h",
      "x": "Rush"
     },
     {
      "t": "p",
      "x": "Switch on **Rush ticket** when a customer is waiting. Every dish starts at once and the ticket goes to the front of the board."
     },
     {
      "t": "h",
      "x": "Send it"
     },
     {
      "t": "p",
      "x": "Tap **Send to kitchen**. Each station sees only its own dishes. Pay now, or leave it on Pay later and take payment from **Orders** when the customer is ready."
     },
     {
      "t": "h",
      "x": "Add to an order that is still open"
     },
     {
      "t": "p",
      "x": "Tap **New ticket** again and choose **Add to open order**. The new ticket joins the same bill as another round."
     },
     {
      "t": "h",
      "x": "Fixing a mistake"
     },
     {
      "t": "ul",
      "x": [
       "**Undo** appears for 10 seconds after an action. After that, fix it by hand.",
       "To cancel a ticket, open its small menu on the board, tap **Void ticket** and say why. Voided tickets are counted in your reports."
      ]
     }
    ]
   },
   {
    "id": "running-the-line",
    "title": "Running the line",
    "summary": "What a cook does on the kitchen board.",
    "blocks": [
     {
      "t": "h",
      "x": "Read the board"
     },
     {
      "t": "p",
      "x": "Each paper ticket is one order. Its clock counts up from when the order came in. It turns amber, then red, when the order is taking too long. The tabs at the top show one station. The All tab shows every ticket."
     },
     {
      "t": "h",
      "x": "Start and finish dishes"
     },
     {
      "t": "ol",
      "x": [
       "The line under the customer's name says what to do next.",
       "Tap **Start** when you begin a dish that takes time. A countdown shows the usual cooking time.",
       "When the countdown reaches zero the row says Check it. Look at the food. Smokebox never decides that a dish is done.",
       "Tap **Done** when the dish is really finished. Quick dishes, like drinks, only need Done."
      ]
     },
     {
      "t": "p",
      "x": "Gray dishes are waiting on purpose, so the whole order finishes together. Tap **Start now** to start one early."
     },
     {
      "t": "h",
      "x": "Send the ticket out"
     },
     {
      "t": "p",
      "x": "When every dish is done, tap **Bump**. If something is not done, Smokebox asks first. A ticket you bump by mistake can be brought back with **Undo** for 10 seconds, or later with **Recall**."
     },
     {
      "t": "h",
      "x": "When something runs out"
     },
     {
      "t": "p",
      "x": "Tap **86 board**, find the item and mark it sold out. It disappears from the order screen until you turn it back on. Smokebox also takes a dish off the menu by itself when its ingredient runs low."
     },
     {
      "t": "h",
      "x": "Food in the hold cabinet"
     },
     {
      "t": "p",
      "x": "Cooked food waits in the **Hold cabinet**. Log each batch with a temperature when it goes in, and again at every check. The board warns you before a batch reaches its serve-by time."
     }
    ]
   },
   {
    "id": "closing-the-day",
    "title": "Closing the day",
    "summary": "A short routine for the end of service.",
    "blocks": [
     {
      "t": "h",
      "x": "Before you close"
     },
     {
      "t": "ol",
      "x": [
       "Finish the open orders. Tap **Orders**. For each open order tap **Pay**, or void it if the customer left.",
       "Look in the **Hold cabinet**. Decide what to do with each batch that is left, using your own rules. To throw a batch out, tap **Discard** on its card and pick a reason.",
       "Wipe down food-contact surfaces and tap the **Sanitize** button on the board to log it."
      ]
     },
     {
      "t": "h",
      "x": "After you close"
     },
     {
      "t": "ol",
      "x": [
       "Look at the day. In **Back office**, open **Sales and money** for what you collected and **Safety** for the checks you logged and the food you threw out.",
       "Save the thrown-out log. Open it from the board's menu, then tap **Save as spreadsheet** or **Print or save as PDF**. Your health department may ask to see it.",
       "Save a backup (see Backup and restore). After closing time Smokebox shows a bar that says \"Service is over\". It is a reminder, not a block."
      ]
     }
    ]
   },
   {
    "id": "backup-and-restore",
    "title": "Backup and restore",
    "summary": "Everything Smokebox knows is saved in this browser on this device. A backup is a file you keep somewhere else.",
    "blocks": [
     {
      "t": "h",
      "x": "Make a backup"
     },
     {
      "t": "ol",
      "x": [
       "Tap **Back office**, then **Menu and settings**.",
       "Find Data, backup and reset. Tap **Download backup (JSON)**. Or tap **Copy backup** and paste the text into an email to yourself.",
       "Keep a copy off this device."
      ]
     },
     {
      "t": "p",
      "x": "Back up every day at close. If the browser data is cleared or the device is replaced, a copy on the same device goes with it."
     },
     {
      "t": "h",
      "x": "Restore from a backup"
     },
     {
      "t": "ol",
      "x": [
       "Open Data, backup and reset. Under Import, tap **Choose a backup file**. Pick the newest one, named smokebox-backup-(date).json. Or paste the text and tap **Check pasted backup**.",
       "Read the summary: the saved date, the tickets and the batches should match what you expect. Nothing has changed yet.",
       "If it is right, tap **Replace everything with this backup**. This replaces all data on this device, including the PIN. There is no undo, so back up what is here first if you might want it.",
       "Open the board and check the batches, the 86 board and your menu. Sound and loudness are set per device, so test them again."
      ]
     },
     {
      "t": "p",
      "x": "A file that is not a valid backup is refused, and nothing is changed."
     }
    ]
   },
   {
    "id": "replacing-a-device",
    "title": "Replacing a device",
    "summary": "Move Smokebox to a new tablet or computer without losing your menu, settings and history.",
    "blocks": [
     {
      "t": "ol",
      "x": [
       "On the old device, if it still works, download a backup (see Backup and restore). Copy the file somewhere else: email it to yourself or use a USB drive.",
       "On the new device, copy the same smokebox.html file onto it and open it. Install it as an app: on an iPad tap Share, then Add to Home Screen. In Chrome tap the menu, then Install app.",
       "Open the board's menu and tap **Set up this tablet**. Sound, keeping the screen on and loudness are set per device, so do them again here.",
       "Tap **Back office**, then **Menu and settings**. Under Import, choose the backup file, check the summary and tap **Replace everything with this backup**.",
       "Check the board: batches, the 86 board and the menu. Save a fresh backup from the new device, then retire the old one."
      ]
     },
     {
      "t": "p",
      "x": "If the old device is broken and you have no backup file, its data cannot be recovered. This is why a daily backup matters."
     },
     {
      "t": "p",
      "x": "Separate devices do not share data yet. Two tabs on the same device stay in step."
     }
    ]
   },
   {
    "id": "what-this-app-does-not-replace",
    "title": "What this app does not replace",
    "summary": "Smokebox is a helper. You and your local rules stay in charge.",
    "blocks": [
     {
      "t": "ul",
      "x": [
       "Food-safety procedures. Smokebox reminds you to take temperatures and flags readings and times outside the limits you set. It cannot see, taste or measure your food. Your own food-safety plan, your training and your thermometer checks still apply.",
       "Your local health code. The starting limits come from the FDA Food Code. Your state or county may require something different. Ask your health department, then change the limits in Menu and settings.",
       "Card processing. Smokebox only writes down how an order was paid. Keep your card reader and your processor.",
       "Your register or POS. Smokebox is a kitchen display with simple order entry. It does not file taxes, run payroll or replace your bookkeeping. Sales tax is one flat percent that you set.",
       "Allergy care. A note on a ticket is a reminder. Tell your staff about every allergy, and follow your own allergen rules.",
       "Your backups. If you do not save backups, clearing the browser data erases everything.",
       "Real numbers. Practice tickets and sample history are made up. Starter estimates for prep times, yields and costs are guesses until you confirm them."
      ]
     }
    ]
   }
  ];
  // guide:data-end
  // audit:data-end

  // The page with this id, or the first page when the id is unknown or missing.
  const byId = (id) => PAGES.find((p) => p.id === id) || PAGES[0] || null;
  // Splits text into plain and bold pieces: [{ b: false, s: 'Tap ' }, { b: true, s: 'Pay' }, ...].
  function pieces(text) {
    return String(text).split(/\*\*([^*]+)\*\*/).map((s, i) => ({ b: i % 2 === 1, s })).filter((p) => p.s);
  }
  // The text with the bold marks removed, as a screen reader or a test would read it.
  const plain = (text) => pieces(text).map((p) => p.s).join('');
  // The names of every button or screen the Guide mentions in bold, so a test can check they still exist.
  function labels() {
    const out = [];
    PAGES.forEach((p) => {
      const all = [p.summary].concat(p.blocks.map((b) => (Array.isArray(b.x) ? b.x.join(' ') : b.x)));
      all.forEach((t) => pieces(t).forEach((x) => { if (x.b && out.indexOf(x.s) < 0) out.push(x.s); }));
    });
    return out;
  }

  // Node (tests) has no page, so only the data and text helpers are offered there.
  if (!doc) { SB.guide = { pages: PAGES, byId, pieces, plain, labels }; return; }

  const U = SB.util, h = U.h;
  // An icon of this name and size, or an empty span when icons are missing.
  const ico = (n, size) => { try { return SB.icons.svg(n, { size }); } catch (e) { return doc.createElement('span'); } };
  const R = () => SB.router;

  // The screen being shown, or null: { root, nav, article, page }.
  let cur = null;

  // Makes the DOM for a piece of text, turning the bold marks into button-name chips.
  function inline(text) {
    const frag = doc.createDocumentFragment();
    pieces(text).forEach((p) => frag.appendChild(p.b ? h('strong', { class: 'gd-ui' }, p.s) : doc.createTextNode(p.s)));
    return frag;
  }
  // The address that opens one Guide page, so a link can be copied or bookmarked.
  const hashOf = (id) => (R() && R().hashFor ? R().hashFor({ kind: 'guide', page: id }) : '#/guide/' + id);
  // Goes to a Guide page through the router, which calls show() for us.
  const go = (id) => { if (R() && R().go) R().go({ kind: 'guide', page: id }); else show(id); };
  // Leaves the Guide and returns to the board (or the screen this device normally opens on).
  const back = () => { if (R() && R().go) R().go(R().home()); };
  // A click handler for a link to one page: moves there through the router instead of reloading the page.
  const linkClick = (id) => (e) => { e.preventDefault(); go(id); };

  // One block of a page (heading, paragraph or list) as DOM.
  function block(b) {
    if (b.t === 'h') return h('h3', { class: 'gd-h' }, b.x);
    if (b.t === 'p') return h('p', { class: 'gd-p' }, inline(b.x));
    return h(b.t === 'ol' ? 'ol' : 'ul', { class: 'gd-list' }, ...b.x.map((x) => h('li', null, inline(x))));
  }
  // Fills the content pane with one page: title, summary, blocks and the Previous / Next links.
  function paint(page) {
    const a = cur.article;
    U.clear(a);
    const i = PAGES.indexOf(page);
    a.appendChild(h('h2', { class: 'gd-page-title', tabindex: -1 }, page.title));
    a.appendChild(h('p', { class: 'gd-lede' }, inline(page.summary)));
    page.blocks.forEach((b) => a.appendChild(block(b)));
    const pager = h('div', { class: 'gd-pager' });
    // Builds a Previous or Next link to a neighbouring page.
    const link = (p, dir) => h('a', { class: 'btn gd-pg gd-pg-' + dir, href: hashOf(p.id), onClick: linkClick(p.id) },
      dir === 'prev' ? ico('chevron-left', 20) : null, h('span', null, (dir === 'prev' ? 'Previous: ' : 'Next: ') + p.title), dir === 'next' ? ico('chevron-right', 20) : null);
    if (i > 0) pager.appendChild(link(PAGES[i - 1], 'prev'));
    if (i < PAGES.length - 1) pager.appendChild(link(PAGES[i + 1], 'next'));
    a.appendChild(pager);
  }
  // Marks the current page in the left list for sighted users and for screen readers.
  function markNav(page) {
    cur.nav.querySelectorAll('a').forEach((a) => {
      const on = a.getAttribute('data-page') === page.id;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // Shows one page (by id) in the open Guide: updates the list, the text, the title and the focus.
  function show(id) {
    if (!cur) return false;
    const page = byId(id);
    if (!page) return false;
    // An unknown page name in the address is tidied to the real first page, so the address never lies.
    if (id && page.id !== id && R() && R().go) R().go({ kind: 'guide', page: page.id }, { replace: true });
    cur.page = page;
    markNav(page);
    paint(page);
    cur.main.scrollTop = 0;
    try { cur.article.querySelector('.gd-page-title').focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
    return true;
  }

  // Closes the Guide on Escape, unless a pop-up sheet is open (then Escape belongs to the sheet).
  function onKey(e) { if (e.key === 'Escape' && !doc.querySelector('.sheet-root')) { e.preventDefault(); back(); } }

  // Builds the Guide screen inside el and shows the page named in opts.page. Returns a cleanup function.
  function mount(el, opts) {
    unmount();
    const nav = h('nav', { class: 'gd-nav', 'aria-label': 'Guide pages' },
      h('ol', { class: 'gd-nav-list' }, ...PAGES.map((p, i) => h('li', null,
        h('a', { class: 'gd-link', href: hashOf(p.id), 'data-page': p.id, onClick: linkClick(p.id) },
          h('span', { class: 'gd-num', 'aria-hidden': 'true' }, String(i + 1)), h('span', null, p.title))))));
    const article = h('article', { class: 'gd-article' });
    const main = h('main', { class: 'gd-main', id: 'gd-main' }, article);
    const topBack = h('button', { type: 'button', class: 'btn gd-back', onClick: back }, ico('chevron-left', 20), h('span', null, 'Back to the board'));
    const top = h('header', { class: 'gd-top' }, topBack, h('h1', { class: 'gd-title' }, ico('info', 24), h('span', null, 'Guide')));
    const root = h('div', { class: 'gd' }, top, h('div', { class: 'gd-body' }, nav, main));
    U.clear(el);
    el.appendChild(root);
    el.addEventListener('keydown', onKey);
    cur = { el, root, nav, main, article, page: null };
    show(opts && opts.page);
    return unmount;
  }
  // Takes the Guide screen down and forgets it.
  function unmount() {
    if (!cur) return;
    const c = cur; cur = null;
    c.el.removeEventListener('keydown', onKey);
    U.clear(c.el);
  }

  // True while the Guide screen is showing.
  function isOpen() { return !!cur; }

  // Opens the Guide (optionally at one page) by moving the address to #/guide or #/guide/page-name.
  function open(id) { go(id || (PAGES[0] && PAGES[0].id)); }

  SB.guide = { pages: PAGES, ids: PAGES.map((p) => p.id), byId, pieces, plain, labels, mount, unmount, show, open, isOpen };
})(typeof globalThis !== 'undefined' ? globalThis : window);
