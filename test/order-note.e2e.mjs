// Allergy-first note flow check (browser, quick). Run: node test/order-note.e2e.mjs
// Covers 71-floor-order.js: the allergy question at the top of the order, allergen buttons writing the first words of the
// note, note phrases, the 140-character limit, the Rush wording, and that the ticket reaches the engine with the note.
import { withPage } from '../tools/pw.mjs';

let pass = 0, fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); } }

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await page.evaluate(() => { SB.floor.setWelcome(false); if (SB.sim) SB.sim.live.crew(false); SB.sheets.open('order'); });
  await page.waitForSelector('.sheet .ord');
  const note = () => page.inputValue('.ord-note-input');
  await page.locator('.ord-tile:not(.is-86)').first().click();
  check('allergy question is the first block of the order pane', await page.evaluate(() => document.querySelector('.ord-order .ord-allergybox').compareDocumentPosition(document.querySelector('.ord-order .ord-linesbox')) & Node.DOCUMENT_POSITION_FOLLOWING) > 0);
  check('allergen buttons start hidden', await page.locator('.ord-allergens').isHidden());
  await page.click('.ord-allergy-yes');
  check('Allergy shows the allergen buttons and a pick-one prompt', (await page.locator('.ord-allergens').isVisible()) && (await page.locator('.ord-allergy-pick').isVisible()));
  await page.click('.ord-allergens .chip:has-text("Peanut")');
  await page.click('.ord-allergens .chip:has-text("Dairy")');
  check('note starts with the allergy words', (await note()) === 'ALLERGY: Peanut, Dairy.', await note());
  await page.click('.ord-templates .chip:has-text("Sauce on the side")');
  check('a phrase goes after the allergy words', (await note()) === 'ALLERGY: Peanut, Dairy. Sauce on the side', await note());
  await page.click('.ord-allergens .chip:has-text("Peanut")');
  check('removing an allergen keeps the phrase', (await note()) === 'ALLERGY: Dairy. Sauce on the side', await note());
  await page.fill('.ord-note-input', 'x'.repeat(138));
  await page.click('.ord-templates .chip:has-text("Birthday")');
  check('a phrase that would pass 140 characters is refused with a message', (await note()).length === 138 && (await page.locator('.ord-notice').isVisible()));
  await page.fill('.ord-note-input', '');
  await page.click('.ord-allergy-no');
  check('No allergy clears the allergy state', (await page.locator('.ord-allergens').isHidden()) && (await page.getAttribute('.ord-allergy-no', 'aria-pressed')) === 'true');
  check('Rush text says it is off', /Rush is off/.test(await page.textContent('.ord-rush-copy')));
  await page.click('.ord-rush .toggle, .ord-rush [role="switch"]');
  check('Rush text says it is on in capitals', /^RUSH is on/.test(await page.textContent('.ord-rush-copy')));
  await page.click('.ord-allergy-yes');
  await page.click('.ord-allergens .chip:has-text("Egg")');
  await page.screenshot({ path: 'test/.out/order-note.png' });
  await page.click('.ord-send');
  await page.waitForTimeout(500);
  const sent = await page.evaluate(() => { const t = SB.store.getState().tickets; return t[t.length - 1].note; });
  check('the ticket carries the allergy note', sent === 'ALLERGY: Egg.', sent);
  check('console clean', logs.errors.length === 0 && logs.pageErrors.length === 0, { e: logs.errors.slice(0, 3), p: logs.pageErrors.slice(0, 3) });
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
