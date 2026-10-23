# Menu and item export formats from Square, Toast, Clover, Lightspeed and spreadsheets

Date: 2026-10-23. Author: domain advisor (research pass, round 12). No code was edited. The importer was read (`src/js/13-menu-import.js`, `test/menu-import.test.mjs`, fixtures in `test/fixtures/menu-import/`) and run against sample headers with a throwaway script outside the repo.

## How strong is the evidence? (read first)

The research sandbox could not open vendor help pages (every fetch to Square, Toast, Clover and Lightspeed hosts failed). I could only use web search summaries and GitHub code search. That gives three grades of evidence, and I label each header list:

- **A. Official page names the column.** Rare in what I could reach. Few official pages print the full header row; most say "download the template from your dashboard".
- **B. A real export or template file committed to a public GitHub repository by a third party.** These are real files, but they are not official, and I cannot tell the account type, region or date. Treated as good evidence of the header row, weak evidence of values.
- **C. A search summary that describes columns.** Weakest.

Whoever owns the importer should export one real file from each system (a free Square, Clover or Toast account or a customer's file) before treating anything here as settled.

## 1. What each system writes

### 1.1 Square item library (CSV or XLSX)

Official facts (grade C, from search summaries of Square's help pages): the template comes from Item Library, Actions, Import Library; do not edit the Token column, reorder columns or delete empty ones; save as .csv or .xlsx; items and variations must share category and description; remove commas from item text; names are required ("The Item Library Requires That All Item Have Names") ([Square: import troubleshooting](https://squareup.com/help/ca/en/article/6172-import-item-library-troubleshooting); [Square community: missing names error](https://community.squareup.com/t5/Troubleshooting/Item-Import-Error-quot-The-Item-Library-Requires-That-All-Item/m-p/681309); [Square bulk import article](https://squ.re/2MNmLa0), not opened). Reference Handle and Token are assigned by Square; leave them empty for new items (a community answer, [Square community](https://community.squareup.com/t5/Troubleshooting/Item-Import-Error-quot-The-Item-Library-Requires-That-All-Item/m-p/681815)). "The file format has changed" over time, so older and newer templates differ.

Real header rows (grade B):

- Older/fuller layout, from `public/square.csv` in the GitHub repo `koyeary/nextonthemenu` (a bakery with three locations):
  `Reference Handle, Token, Item Name, Variation Name, Unit and Precision, SKU, Description, Categories, Reporting Category, SEO Title, SEO Description, Permalink, GTIN, Square Online Item Visibility, Item Type, Weight (lb), Social Media Link Title, Social Media Link Description, Shipping Enabled, Self-serve Ordering Enabled, Delivery Enabled, Pickup Enabled, Price, Online Sale Price, Archived, Sellable, Contains Alcohol, Stockable, Auto Add Item to Check, Option Name 1, Option Value 1, Default Unit Cost, Default Vendor Name, Default Vendor Code, Enabled <Location>, Current Quantity <Location>, New Quantity <Location>, Stock Alert Enabled <Location>, Stock Alert Count <Location>, Price <Location>, ..., Modifier Set - <name> (one column per modifier set), Tax - <tax name and rate>`
  Sample values there: prices such as `24.00` (no currency symbol), Archived `N`, visibility `visible`, Item Type `Prepared food and beverage`, tax columns `Y`/`N`.
- Newer layout, from `Sq2.csv` and `sq.csv` in `Nancysstays/Nancysstays.github.io`: starts `Token, Item Name, Variation Name, SKU, Description, Reporting Category, SEO Title, ..., Square Online Item Visibility, Item Type, ..., Price, Online Sale Price, Archived, Sellable, Stockable, Skip Detail Screen in POS, Option Name 1, Option Value 1, Default Unit Cost, ...`. Here there is **no `Categories` column**; the only category-like column is `Reporting Category`. The same file has `Price` set to the word `Varies` for some items (a third-party sample, so not proof that Square writes that word).
- Layouts agree on: `Item Name`, `Variation Name`, `SKU`, `Description`, `Reporting Category`, `Price`, `Archived`. Multi-location accounts get extra columns `Price <Location name>` and `Enabled <Location name>`.
- Other repos that parse Square files (`quirkey/rough-counts`, `nowayitstrevor/acefenceapp`) use the same names, and one also accepts `Variation SKU`.

One row per variation. There is no station column (Square exports have no kitchen-routing field I could find).

### 1.2 Toast

Toast has several different files, and none of them is a simple "menu items with price and group" CSV that I could confirm:

- **Bulk import templates** (basic, item update, advanced): columns `Operation`, `Entity Type`, `Operation ID`, `Name`, and a parent-entity column; pricing strategy and price are required for the basic template; Operation is always CREATE in the basic template ([Toast bulk import overview](https://doc.toasttab.com/doc/platformguide/platformBulkImportToolOverview.html); [filling out the spreadsheet](https://doc.toasttab.com/doc/platformguide/platformFillingOutTheBulkImportSpreadsheet.html); grade C). These are an import format for Toast, not a menu listing.
- **Menu manager export** (CSV for price audits and bulk price edits, only from the Items or Modifiers view, delivered by emailed link) ([Toast update note](https://updates.toasttab.com/announcements/auditing-and-bulk-editing-prices-using-the-menu-manager-export-feature); grade C). I could not find its header row.
- **Items database export** (Menus, Bulk management, Items database, download icon; needs the Edit Full Menu permission; no change history) ([Toast support](https://support.toasttab.com/en/article/Using-the-Items-Database)). A Toast community reply says it does not include menu groups, menu or description ([Toast community](https://community.toasttab.com/t5/restaurant-operations/full-menu-export-or-report-needed/m-p/11308), possibly outdated). GUIDs are an optional column ([third-party guide](https://support.menuboardmanager.com/en/articles/12785344-how-to-export-a-menu-csv-with-guids-from-toast)).
- **Sales export "All items"** lists `Menu Group` and `Menu Item` per sale ([Toast data export field reference](https://doc.toasttab.com/doc/platformguide/adminDataExportFieldReference.html)); not a menu.
- The developer guide says the UI label "Base Price" is the field `price` in menu data ([Toast dev guide](https://doc.toasttab.com/doc/devguide/apiMappingMenusApiValuesToOtherToastApisAndTheMenuDataExport_V2.html)).

I found no real Toast CSV in public repos. The importer's Toast detection and the `toast-menu.csv` fixture (`Menu,Menu Group,Item Name,Price,Description,Visibility`) are therefore guesses. A Toast customer is most likely to hand over a manually built sheet, a printed menu or the Items database export.

### 1.3 Clover

Official (grade C): inventory import template is an Excel file (.xls or .xlsx, up to 5 MB) with an Items tab ([Clover: bulk import inventory](https://docs.clover.com/dev/docs/importing-inventory)). Core columns per a third-party guide: Item Name, Price, Cost, SKU, Product Code, Quantity; leading zeros in Product Code are lost unless the column is Text ([SKU IQ guide](https://www.skuiq.com/blogs/clover-inventory-management)). Export is from Items, Item List, full list only ([Shopify migration help](https://help.shopify.com/en/manual/migrating-to-shopify/migrating-from-clover)).

Real header row (grade B), from `data/menu/aldiar_menu_clover_import.csv` in GitHub repo `zaidkilledar21-beep/Retell-Voice-Agent` (a restaurant menu prepared for Clover import):
`Clover ID, Name, Alternate Name, Price, Price Type, Price Unit, Tax Rates, Cost, Product Code, SKU, Modifier Groups, Quantity, Printer Labels, Hidden, Non-revenue item`
Sample values: `Price` is **dollars with decimals** (`5.99`, `12.99`); `Price Type` is `Fixed`; `Tax Rates` `DEFAULT`; `Printer Labels` holds a kitchen label (`Salads`, `Breakfast`); `Hidden` `No`; `Clover ID` blank for new items.

Important: `Printer Labels` is the closest thing any of these exports has to a kitchen station.

### 1.4 Lightspeed

Lightspeed has several products; the one I could research is **K-Series** (restaurants). From search summaries of its help center (grade C): items import as CSV or Excel; an **Accounting group** column is required for any import; a **Type** column marks rows as Item, Sub-item, Group or Combo; **Name** (must be unique); **Price** (blank means open price); **Parent SKU** for combo parts; a screen (button) location is written as `Screen`/`Screens`, with sub-screens as `Main screen##Sub-screen`; tax comes from the accounting group, not a column ([Importing and exporting items in bulk](https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804656109-Importing-and-exporting-items-in-bulk); [Importing and exporting menus](https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804605430-Importing-and-exporting-menus)). Exact header capitalization is not confirmed. I did not research Lightspeed X-Series/Retail product CSVs.

### 1.5 Typical Google Sheets or Excel menu

No source exists for "typical". From the importer fixtures and common practice, owners use headers like `Item`, `Dish`, `Menu Item`, `Name`, `Price`, `Cost`, `Category`, `Section`, `Description`. Excel in European locales writes semicolon-separated files with decimal commas; the importer already handles both. Excel and Sheets also add a byte-order mark (handled) and can turn long codes into scientific notation (Square warns about this for SKUs; irrelevant to name and price).

## 2. How the importer behaves (tested)

I ran the sample headers below through `SB.menuImport.parse` (script kept outside the repo). "Result" is what the parser did.

| # | Input header (exact strings) | Result | Problem |
|---|---|---|---|
| 1 | Square full: `Reference Handle,Token,Item Name,Variation Name,...,Categories,Reporting Category,...,Price,...,Archived` | Detected `square`. Name, price, variation, archived all right. Category taken from `Reporting Category`; `Categories` ignored. Archived `Y` flagged as hidden. | Minor. `categories` is not in the category alias list, so a shop that uses Square's `Categories` (the category the cook knows) but a different Reporting Category gets the wrong text. |
| 2 | Square newer: `Token,Item Name,Variation Name,SKU,Description,Reporting Category,Square Online Item Visibility,...,Price,...,Archived` | Detected, works. `Square Online Item Visibility` (`visible`/`hidden`) ignored. | Minor: a "hidden" online item is imported without the hidden warning. |
| 3 | Square multi-location with price only per location: `Price`, `Price Main St` (blank first) | Row gets `noPrice` error | The `Price <Location>` columns are never read. I could not confirm whether Square leaves `Price` blank in this case. |
| 4 | Clover real header, whole-dollar price `12`, `Price Type` `Fixed` | Detected `clover`, **price read as $0.12** with only a yellow `centsConverted` warning; the row stays "ok" | **High.** The only real Clover-style file I found has dollar prices. The importer assumes cents unless told. A Clover price of `4` becomes $0.04 and the dish is added unless the owner notices. See recommendation R1. |
| 5 | Clover `Price Type` = `Per unit` (with `Price Unit` = `Lb`) | Read as a price in cents ($0.04), not flagged variable | Importer only matches `VARIABLE` and `PER_UNIT` (underscore). I have no source for how Clover writes it; the API enum is `PER_UNIT`, the spreadsheet may differ. |
| 6 | Clover `Printer Labels` (`Pit`, `Cold`, `Salads`) | Ignored | Missed chance to fill station or category (R3). |
| 7 | Lightspeed-style: `Name,Type,Accounting group,Price,Screen,SKU` | Falls to generic `csv`; `Type` (values `Item`, `Sub-item`, `Combo`) becomes the category text; sub-items and combos are imported as dishes | Wrong category; unwanted rows. `Accounting group` and `Screen` not recognized. |
| 8 | Sheet: `Menu,Price` where `Menu` holds dish names | Detected as **Toast**; name column not found; every row "no dish name" | **High** for that sheet. `menu` alone triggers the Toast branch whose name list has no `menu`. |
| 9 | Sheet: `Menu Item,Price,Section` | Detected as Toast (label says "Toast menu export"); `Section` ignored | The Toast branch uses a shorter category list than the generic one. Mislabels a plain spreadsheet. |
| 10 | Sheet: `Item,Item Price,Category` | No format found; falls to "typed lines"; header row becomes a dish named "Item" with a bad price, and `Category` becomes a station | `itemprice` is accepted only inside the Toast branch. |
| 11 | Sheet: `Dish,Price (USD),Category` | Same failure as 10 | `Price (USD)` normalizes to `priceusd`, not in the list. |
| 12 | Sheet: `Item Name,Prices` / `Food,Price` | Same failure as 10 | `prices` and `food` not accepted. |
| 13 | Sheet: `Nombre,Precio` | Same failure as 10 | Spanish headers. (Plausible for US kitchens; not sourced.) |
| 14 | Sheet: `Item,Price,Prep Area` | Works; `Prep Area` ignored | Station alias missing. |
| 15 | Toast sales "All items" style: `Menu Group,Menu Item,Gross Price,Qty` | Falls to typed lines, garbage rows | Wrong file type; the owner needs a message, not junk rows. |
| 16 | Toast bulk-import template guess: `Operation,Entity Type,Operation ID,Name,Parent Entity,Pricing Strategy,Price` | Parsed as generic CSV, rows `Brisket` at $14 (menu items, but also modifier groups and modifiers would come in as dishes) | Rows with `Entity Type` other than `MENU_ITEM` should be skipped. This header row is my guess from search summaries (grade C). |

Also noted while reading the code:

- The `hidden` column is chosen with `Math.max(indexOf('hidden'), indexOf('archived'), indexOf('visibility'))`, so if a file has more than one, only the right-most is used.
- The fixtures `square-items.csv` (`Token,Item Name,Description,Category,SKU,Variation Name,Price,...`) and `toast-menu.csv` are hand-written. The Square one has a `Category` column that real files do not have in either layout I found. The tests pass, but they do not exercise `Categories` or `Reporting Category`. The Clover fixture header matches the real file; its values are in cents, which the real sample contradicts.

## 3. Concrete changes for the importer owner

Header strings are the exact text first, then the normalized form the code compares (lower-case letters and digits only).

**R1. Clover price units (highest value).** Do not default to cents by header alone. Suggested rule, which I believe is safe on the evidence: if any price cell in the file contains a decimal point, read the whole file as dollars; read as cents only if every price is a whole number and the owner confirmed it, or ask once ("Prices look like whole numbers. Are they in dollars or cents?"). Never leave a cents conversion as a warning on a row that is otherwise "ok".

**R2. Fix the Toast branch fallbacks.** Only call a file "Toast" when it has `Menu Group` and a name/price pair; do not treat the bare header `Menu` as Toast evidence, and if the name column is not found, fall back to the generic name list before giving up. Use the generic category list (including `Section`) in the Toast branch.

**R3. Station and category aliases to add** (normalized forms):

| Field | Add header | Normalized | Why |
|---|---|---|---|
| category | `Categories` | `categories` | Square (older layout) |
| category | `Accounting group` | `accountinggroup` | Lightspeed K-Series (required there) |
| category | `Screen`, `Screens` | `screen`, `screens` | Lightspeed K-Series |
| station | `Printer Labels`, `Printer Label` | `printerlabels`, `printerlabel` | Clover (kitchen routing label) |
| station | `Prep Area`, `Prep Location`, `Line` | `preparea`, `preplocation`, `line` | spreadsheets (guess, no source) |
| price | `Item Price` | `itemprice` | currently Toast branch only |
| price | `Price (USD)`, `Price USD`, `Prices`, `Regular Price` | `priceusd`, `prices`, `regularprice` | spreadsheets (guess, no source) |
| name | `Menu Item Name`, `Food`, `Dish Name`, `Item Description` is NOT a name | `menuitemname`, `food` | `dishname` already exists |
| hidden | `Square Online Item Visibility` (values `visible`, `hidden`, `unavailable`?) | `squareonlineitemvisibility` | Square; the three values are from one sample file, not documented by me |
| hidden | `Hidden`, `Archived` | already handled | Clover `Hidden` = `No`/`Yes`; Square `Archived` = `N`/`Y` |

**R4. Lightspeed.** When a `Type` column holds `Item`, `Sub-item`, `Group` or `Combo`, do not use it as the category, and skip `Sub-item` and `Group` rows (offer `Combo`). Detect Lightspeed K-Series by `Accounting group` plus `Name` plus `Price`. Unconfirmed: exact capitalization of these headers.

**R5. Toast bulk-import file.** If an `Entity Type` column exists, keep only rows where it says menu item (exact value string not confirmed; likely `MENU_ITEM`). Better: detect `Operation` + `Entity Type` + `Operation ID` and say "This is a Toast import template, not a menu list. Use the Items database export or type the menu."

**R6. Unrecognized header row.** When the first row has no price-like word, the typed-lines fallback invents a dish from the header. Detect "first row looks like words only, second row has a price" and say so; offer the column picker instead of guessing.

**R7. Square location prices.** If `Price` is blank and a `Price <Location>` column has a value, use it (and say so). Unverified how often Square does this.

**R8. Clover `Price Type`.** Accept `Per unit`, `PER_UNIT`, `Per Unit`, `Variable` (case-insensitive, space or underscore) as non-fixed.

**R9. Fixtures.** Replace `square-items.csv` header with the real one (grade B above, both layouts) and add the real Clover header with dollar values; mark the Toast and Lightspeed fixtures as "guessed" until a real file is obtained.

## 4. Could not verify

- Toast menu manager and Items database CSV header rows (no real file found).
- Lightspeed header capitalization; Lightspeed X-Series/Retail.
- Whether real Clover dashboard exports (as opposed to the import template) use dollars or cents.
- Whether Square writes "Varies" or leaves Price blank for variable-price items.
- Any official page printing a full header row for Square or Clover; the B-grade files are third-party.
