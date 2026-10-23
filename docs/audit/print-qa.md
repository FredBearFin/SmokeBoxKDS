# Print QA

Everything the app can put on paper was rendered to PDF with the browser's own print engine (Playwright `page.pdf`, print media) on Letter portrait, Letter landscape and A4 portrait, from a kitchen with 120 days of history (a year-style log: 370+ safety entries, 120+ thrown-out batches, 60-character dish names, a 46-character ingredient name, long customer names). Pages were turned into grey PNG with `pdftoppm -gray` and looked at. The test is `test/print-qa.e2e.mjs` (needs poppler's `pdftotext` and `pdftoppm` for the page checks); it writes `test/.out/print-qa/*.pdf` and `*.png` (not committed).

## What the test asserts
- Page counts are sane (safety record: at most one page per 8 entries plus 4; thrown-out log 3 to 40; end of day exactly 1; pilot report 1 to 6; each Guide card at most 2) and there is no blank last page.
- Table headings repeat on a later page (checked in the PDF text of page 2 or 3) and, from the print styles, rows are `break-inside: avoid` and the heading row is `table-header-group`.
- Nothing from the app chrome is on the paper (no navigation words in the PDF text; no visible body child except the print block).
- Black, white and grey only on paper (every computed color in the print block is achromatic), so no status depends on color.
- Paper block never wider than the page (column headings whole).

## Found and fixed (my files)
| Paper | Found | Fixed |
|---|---|---|
| Food safety record (`89-office-inspector.js`, `34-office-inspector.css`) | The screen table style (15 px type, 6 x 8 px padding) was used on paper: words broke mid-word ("Tempera/ture", "Logg/ed by") and a Letter portrait record of 374 entries ran 88 pages. | Print type 10 px (facts 9 px), tight padding, fixed column widths, no mid-word breaks: 23 pages Letter portrait, 27 landscape, 21 A4 for the same record. Facts and corrections print black. |
| Thrown-out log (`76-floor-discards.js` `printHtml`, A1's file; wording and layout are the office's) | No `thead`, so the heading row did not repeat; rows could split; 14 px type, no page numbers. | `thead`/`tbody`, repeating heading row, `break-inside: avoid`, 12 px type, page margins and "Page N of M". Same 120 days: 12 / 9 / 11 pages. |
| Pilot report (`84-office-data.js`, `32-office-data.css`) | The print block had no print style at all (dark blue-grey text, screen type, and it was not hidden on screen). | New `pr-printroot`: hidden on screen, black on white, wrapped lines. |
| End of day (`87-office-closeday.js`) | "Paid with card: 1 orders". | "1 order". One page on all three papers. |

## Others' pages (listed, not changed)
- **Guide cards (A4, `78-guide.js`, `24-guide.css`)**: all six print cards are one page on Letter portrait, Letter landscape and A4, with the app chrome hidden: `guide-card-*-letter-portrait-1.png`, `guide-card-*-letter-landscape-1.png`, `guide-card-*-a4-portrait-1.png` (for `opening-checklist`, `closing-checklist`, `when-something-goes-wrong`, `first-day-checklist`, `tablet-setup`, `during-service`). Note for A4: the "During service" card says "Gray dish ... Clock amber, then red": on a black-and-white printout those colors cannot be told apart; add the words that go with them (waiting on purpose, getting late, late).
- **Pilot visit card and recovery-code page (`77-floor-setup.js`, written into a hidden frame)**: not rendered here; both use inline styles with 24 px padding and no `@page` rules, so they take the browser's default margins. Not checked.
- **Board (A1, `70-floor-board.js`)**: the board has no print path (the "slips" that "print in" are an animation); nothing to render.
- **Month close (A2, `openCloseMonth`)**: the sheet has no Print button; the files it saves are CSV and JSON. Nothing to render.

## Not checked
A real printer, the browser's own print dialog and its header/footer option (the PDFs above are made without it), Safari and Firefox print engines, `@page` page-number boxes in browsers other than Chromium (they print without numbers, nothing else is lost), a real black-and-white printer (greyscale is judged from the grey PNGs and the all-grey color check).

## PNG files to look at
`test/.out/print-qa/`: `safety-record-{letter-portrait,letter-landscape,a4-portrait}-01..03.png`, `thrown-out-log-{...}-01..03.png`, `end-of-day-{...}-1.png`, `pilot-report-{...}-1.png`, `guide-card-<id>-{...}-1.png`.
