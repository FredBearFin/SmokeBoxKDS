/*
 * WHAT THIS FILE IS: The three pictures in the Guide, drawn as inline SVG (SB.guideArt): what a ticket on the board
 *   means, how the warning steps work, and how food moves through the hold cabinet. No image files: colors come from
 *   CSS variables (see 24-guide.css), so Day and Night both work.
 * PARTS: drawing helpers, ticket(), ladder(), cabinet(). USES: 00-util.js (U.svg). USED BY: 78-guide.js.
 * All three are 560 units wide and tall and narrow-friendly: short labels, big text, numbers that match a list under the picture.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  if (!g.document || !SB.util || !SB.util.svg) { SB.guideArt = {}; return; }
  const svg = SB.util.svg;

  // A group of text lines at x, y (first baseline). opts: size, weight, cls (a color class), anchor, gap (line height).
  function text(x, y, lines, o) {
    o = o || {};
    const size = o.size || 17;
    const el = svg('text', { x, y, 'font-size': size, 'font-weight': o.weight || 400, class: 'ga-t ' + (o.cls || 'ga-ink'), 'text-anchor': o.anchor || 'start' });
    (Array.isArray(lines) ? lines : [lines]).forEach((ln, i) => el.appendChild(svg('tspan', { x, dy: i === 0 ? 0 : (o.gap || size * 1.25) }, ln)));
    return el;
  }
  // A rectangle with a class for its fill and stroke.
  const rect = (x, y, w, h, cls, r) => svg('rect', { x, y, width: w, height: h, rx: r == null ? 6 : r, class: cls });
  // A straight or bent line through the points [[x, y], ...].
  const line = (pts, cls) => svg('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: cls || 'ga-line' });
  // A numbered round badge centered at x, y.
  function badge(x, y, n, cls) {
    return svg('g', null, svg('circle', { cx: x, cy: y, r: 15, class: cls || 'ga-badge' }), svg('text', { x, y: y + 6, 'font-size': 18, 'font-weight': 700, 'text-anchor': 'middle', class: 'ga-badge-t' }, String(n)));
  }
  // The outer picture element with its description for screen readers.
  function frame(h, alt, kids) {
    const s = svg('svg', { viewBox: '0 0 560 ' + h, class: 'ga', role: 'img', 'aria-label': alt, focusable: 'false' });
    kids.forEach((k) => s.appendChild(k));
    return s;
  }
  // A speaker with 1 to 3 sound waves, centered near x, y; shows how loud a warning is.
  function speaker(x, y, waves, cls) {
    const gp = svg('g', { class: cls || 'ga-stroke-ink' });
    gp.appendChild(svg('path', { d: 'M' + x + ' ' + (y - 6) + 'h8l10 -9v30l-10 -9h-8z', class: 'ga-fill-ink' }));
    for (let i = 1; i <= waves; i++) gp.appendChild(svg('path', { d: 'M' + (x + 22 + i * 7) + ' ' + (y - 5 - i * 4) + 'q' + (6 + i * 2) + ' ' + (5 + i * 4) + ' 0 ' + (10 + i * 8), class: 'ga-wave' }));
    return gp;
  }

  /* ---------- 1. what a ticket on the board means ---------- */

  // The ticket picture: a slip like the one on the board, with seven numbered parts.
  function ticket(alt) {
    const k = [];
    k.push(rect(0, 0, 560, 480, 'ga-bg', 12));
    // The slip itself.
    k.push(rect(20, 18, 270, 444, 'ga-slip', 3));
    k.push(text(36, 64, '#101', { size: 34, weight: 700, cls: 'ga-slip-ink' }));
    k.push(text(274, 62, '04:12', { size: 28, weight: 700, cls: 'ga-slip-ink', anchor: 'end' }));
    k.push(text(36, 90, 'Maria', { size: 19, weight: 600, cls: 'ga-slip-ink' }));
    k.push(text(36, 112, 'Dine-in   0 of 2 done', { size: 15, cls: 'ga-slip-ink3' }));
    k.push(svg('line', { x1: 24, y1: 126, x2: 286, y2: 126, class: 'ga-dash' }));
    k.push(rect(30, 138, 250, 32, 'ga-slip-sub', 4));
    k.push(text(40, 160, 'Tap Start on Hush puppies.', { size: 15, cls: 'ga-slip-ink' }));
    // First dish: cooking, with a countdown and a Done button.
    k.push(rect(30, 182, 6, 76, 'ga-fry', 0));
    k.push(text(46, 206, 'Hush puppies', { size: 19, weight: 700, cls: 'ga-slip-ink' }));
    k.push(text(46, 228, '3:59 left', { size: 15, weight: 700, cls: 'ga-slip-amber' }));
    k.push(rect(112, 214, 44, 22, 'ga-tag ga-tag-fry', 3)); k.push(text(134, 230, 'FRY', { size: 13, weight: 700, cls: 'ga-slip-ink', anchor: 'middle' }));
    k.push(rect(206, 190, 74, 60, 'ga-btn-primary', 8)); k.push(text(243, 226, 'DONE', { size: 15, weight: 700, cls: 'ga-on', anchor: 'middle' }));
    // Second dish: ready to finish.
    k.push(rect(30, 266, 6, 66, 'ga-cold', 0));
    k.push(text(46, 292, 'Sweet tea', { size: 19, weight: 700, cls: 'ga-slip-ink' }));
    k.push(rect(46, 304, 44, 22, 'ga-tag ga-tag-cold', 3)); k.push(text(68, 320, 'CLD', { size: 13, weight: 700, cls: 'ga-slip-ink', anchor: 'middle' }));
    k.push(rect(206, 270, 74, 56, 'ga-btn-ok', 8)); k.push(text(243, 304, 'DONE', { size: 15, weight: 700, cls: 'ga-on', anchor: 'middle' }));
    // Bump and the more button.
    k.push(rect(30, 352, 170, 50, 'ga-btn-plain', 8)); k.push(text(115, 384, 'Bump', { size: 20, weight: 700, cls: 'ga-slip-ink', anchor: 'middle' }));
    k.push(rect(210, 352, 70, 50, 'ga-btn-plain', 8)); k.push(text(245, 380, '...', { size: 24, weight: 700, cls: 'ga-slip-ink', anchor: 'middle' }));
    k.push(text(36, 438, 'Dishes done: Bump turns green', { size: 14, cls: 'ga-slip-ink3' }));
    // Callouts: badge, leader line, short label. Labels sit in one column on the right.
    const call = (n, ax, ay, ly, label) => {
      k.push(line([[ax, ay], [ax + 10, ay], [320, ly], [336, ly]], 'ga-leader'));
      k.push(svg('circle', { cx: ax, cy: ay, r: 4, class: 'ga-dot' }));
      k.push(badge(352, ly, n));
      k.push(text(378, ly + 6, label, { size: 19, weight: 600 }));
    };
    call(1, 290, 58, 48, ['Ticket number', 'and clock']);
    call(2, 290, 98, 112, ['Customer, order', 'type, progress']);
    call(3, 290, 154, 176, ['Next step']);
    call(4, 290, 198, 240, ['A dish: station,', 'countdown']);
    call(5, 290, 228, 304, ['Start or Done']);
    call(6, 290, 376, 368, ['More: void', 'or rush']);
    call(7, 115, 402, 430, ['Bump: send', 'the ticket out']);
    return frame(480, alt, k);
  }

  /* ---------- 2. the warning steps ---------- */

  // The warning picture: four steps as a batch runs out of time, and the one rule about when they sound.
  function ladder(alt) {
    const k = [];
    k.push(rect(0, 0, 560, 572, 'ga-bg', 12));
    k.push(text(24, 40, 'As a batch gets close to its time limit', { size: 21, weight: 700 }));
    k.push(svg('line', { x1: 56, y1: 78, x2: 56, y2: 400, class: 'ga-spine' }));
    const steps = [
      { y: 80, cls: 'ga-step-1', head: 'About 1 hour left', lines: ['Soft chime. A row appears', 'in the strip at the top.'], waves: 1 },
      { y: 160, cls: 'ga-step-2', head: '30 minutes left', lines: ['A voice calls out which', 'batch is running out.'], waves: 2 },
      { y: 240, cls: 'ga-step-3', head: '10 minutes left', lines: ['Loud tone and voice. Repeats', 'until you tap the strip row.'], waves: 3 },
      { y: 320, cls: 'ga-step-4', head: 'Time is up', lines: ['A different sound. The batch', 'comes off the menu.'], waves: 3 },
    ];
    steps.forEach((s, i) => {
      k.push(svg('circle', { cx: 56, cy: s.y, r: 17, class: s.cls }));
      k.push(svg('text', { x: 56, y: s.y + 6, 'font-size': 18, 'font-weight': 700, 'text-anchor': 'middle', class: 'ga-badge-t' }, String(i + 1)));
      k.push(rect(92, s.y - 30, 444, 72, 'ga-card', 8));
      k.push(text(106, s.y - 4, s.head, { size: 22, weight: 700 }));
      k.push(text(106, s.y + 18, s.lines[0], { size: 18, cls: 'ga-ink2' }));
      k.push(text(106, s.y + 36, s.lines[1], { size: 18, cls: 'ga-ink2' }));
      k.push(speaker(470, s.y + 6, s.waves));
    });
    // The rule that matters most.
    k.push(rect(24, 410, 512, 138, 'ga-note', 10));
    k.push(svg('circle', { cx: 56, cy: 446, r: 17, class: 'ga-badge-warn' }));
    k.push(svg('text', { x: 56, y: 453, 'font-size': 22, 'font-weight': 800, 'text-anchor': 'middle', class: 'ga-badge-t' }, '!'));
    k.push(text(86, 438, 'Warnings only sound while', { size: 20, weight: 700 }));
    k.push(text(86, 462, 'the screen is on and Smokebox is', { size: 20, weight: 700 }));
    k.push(text(86, 486, 'open on the board.', { size: 20, weight: 700 }));
    k.push(text(86, 514, ['Asleep, closed, muted, or outside', 'your opening hours: no sound.'], { size: 17, cls: 'ga-ink2', gap: 21 }));
    return frame(572, alt, k);
  }

  /* ---------- 3. food in the hold cabinet ---------- */

  // The cabinet picture: a batch goes in, is checked, is taken out as you serve, then ends by reheating or being thrown out.
  function cabinet(alt) {
    const k = [];
    k.push(rect(0, 0, 560, 640, 'ga-bg', 12));
    // One stage card with a number, a headline and two lines of words.
    const stage = (y, n, head, l1, l2) => {
      k.push(rect(20, y, 520, 104, 'ga-card', 10));
      k.push(badge(56, y + 52, n));
      k.push(text(88, y + 36, head, { size: 23, weight: 700 }));
      k.push(text(88, y + 62, l1, { size: 19, cls: 'ga-ink2' }));
      k.push(text(88, y + 86, l2, { size: 19, cls: 'ga-ink2' }));
    };
    // A down arrow between two stages.
    const arrow = (y) => { k.push(svg('path', { d: 'M280 ' + y + 'v14m-8 -8l8 8l8 -8', class: 'ga-arrow' })); };
    stage(16, 1, 'Batch goes in', 'Add a New batch with its weight', 'and a first temperature reading.');
    arrow(122);
    stage(140, 2, 'Check', 'Take a reading at every check.', 'In range: it stays on the menu.');
    arrow(246);
    stage(264, 3, 'Take out', 'Use Pull as portions leave.', 'The amount left goes down.');
    arrow(370);
    // The two endings side by side.
    k.push(rect(20, 388, 254, 236, 'ga-card', 10));
    k.push(badge(54, 424, 4));
    k.push(text(80, 431, 'Too cool', { size: 23, weight: 700 }));
    ['Reheat, then', 'log the new', 'reading. Smokebox', 'allows one.'].forEach((t, i) => k.push(text(36, 466 + i * 24, t, { size: 19, cls: 'ga-ink2' })));
    k.push(text(36, 590, 'Dishes pause meanwhile.', { size: 17, weight: 700, cls: 'ga-warn-t' }));
    k.push(rect(286, 388, 254, 236, 'ga-card ga-card-bad', 10));
    k.push(badge(320, 424, 5, 'ga-badge-bad'));
    k.push(text(346, 431, 'Out of time', { size: 23, weight: 700 }));
    ['Discard it and pick', 'a reason. It goes', 'in the thrown-out', 'log.'].forEach((t, i) => k.push(text(302, 466 + i * 24, t, { size: 19, cls: 'ga-ink2' })));
    k.push(text(302, 590, 'Dishes come off.', { size: 17, weight: 700, cls: 'ga-bad-t' }));
    return frame(640, alt, k);
  }

  SB.guideArt = { ticket, ladder, cabinet };
})(typeof globalThis !== 'undefined' ? globalThis : window);
