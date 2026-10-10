ComicRox Listing Tool V2.5.23 - Restored Shopify Beta

This build is based on the user-supplied V2.5.18 reference build.
Standard Batch Shopify upload/refresh logic is preserved from that reference build.
The only Shopify-path change is that credentials are read from:
C:\Users\steve\OneDrive\Documents\Businesses\ComicRox\BulkUploadTool\Shopify-env-dont-delete\comicrox-shopify.env

The saved public domain comicrox.co.uk is normalized internally to the existing Shopify store handle ytksb5-wz; no credential re-entry is required.
Existing eBay manual search, CHECK ALL, automatic checks and per-row CHECK AGAIN functionality from the reference build are retained.

ComicRox Listing Tool V2.5.14 eBay Live Pricing Beta

ComicRox Bulk Listing Tool V2.4.16.9

V2.4.16.9 fixes Shopify multi-image readiness/export. After upload the tool now retries Shopify image-link refresh while newly uploaded MediaImages finish processing, reports exact unmatched filenames, and never writes an additional CSV image row with a blank Image Src. If an image is still unmatched, its row is safely omitted rather than causing Shopify's Missing image source data error. Existing oldest-first xN grouping, AI title/description grouping, Notes priority, manual Issue #, branding, 145g defaults and exact Comic Books taxonomy are retained.

V2.4.16.9 fixes the photo-order handoff: the preview remains newest to oldest, but Build Review now consumes the selected batch oldest to newest, matching the established ComicRox photography workflow. The same correctly grouped photos are used for review thumbnails, Shopify image matching, AI title identification and AI description generation.

V2.4.16.9 fixes multi-photo grouping/image matching. Each photo is assigned once, sequentially, according to xN counts. Build Review now refuses to continue if xN totals do not equal the batch photo count. Shopify matching now prioritises the original MediaImage alt filename set during upload, with CDN/timestamp fallbacks. Visible version/category text corrected.

ComicRox Listing Tool V2.4.16.5

Adds AI comic identification using OPENAI_API_KEY stored locally in comicrox-shopify.env.

V2.4.16.5:
- User-entered Notes are authoritative listing information.
- Notes are always prioritised in BOTH the generated title and description.
- Title remains capped at 80 characters; when space is tight, lower-priority publisher/year wording is shortened before the user's note.
- Grade remains in the title.
- Editing Notes or Grade after identification refreshes the generated title/description.
- Existing Shopify upload, refresh and image matching pipeline retained unchanged.
V2.4.10 Shopify upload, refresh, matching, review and CSV logic retained.

﻿COMICROX BULK LISTING TOOL V2.3

1. Extract the entire ZIP to a normal folder.
2. Double-click START-COMICROX-TOOL.bat.
3. KEEP the black PowerShell window open while using the browser tool.
4. The browser opens at http://localhost:8788/

Workflow:
1. Select batch size
2. Preview & select new photos
3. Upload selected photos to Shopify
4. Enter condition, price & notes
5. Review & correct
6. Export Shopify CSV

Fixed ComicRox folders:
Photos: C:\Users\steve\OneDrive\Documents\Businesses\ComicRox\Comic_Photos
Bulk tool: C:\Users\steve\OneDrive\Documents\Businesses\ComicRox\BulkUploadTool

If the local server encounters an error, ComicRox-Server.log is created beside the app files.


V2.3 change:
- Photo preview/order is newest to oldest. The newest photo is #1.
- Batch buttons select the newest X photos from the top.


V2.4.16.5:
- Shopify matching now uses the original filename stored in MediaImage.alt instead of relying on Shopify's renamed CDN filename.
- Identification performs a separate second AI pass dedicated to verifying the tiny printed issue number.
- The verified issue number and its confidence are shown on the review card.
- Existing notes priority, grade/price handling, 80-character title limit, Shopify upload flow and CSV defaults are retained.

V2.4.16.5: Adds visible AI batch progress bar/status and more conservative independent issue-number verification.

V2.4.16.5: Dedicated editable Issue # field. AI pre-fills it; manual correction immediately updates Title and Description. Misleading verification label removed. Progress bar and stable Shopify pipeline retained.

V2.4.16.5 hotfix: explicitly initialises Issue # when Build Review Screen creates records and hardens pre-AI review rendering.

V2.4.16.5:
- Facsimile/reprint year rule: Year must describe the physical edition being sold, never automatically the original issue's historic year. If the reprint year is uncertain, AI leaves Year blank for manual review.
- Shopify Body (HTML) export now converts the reviewed plain-text description into safe paragraph HTML.
- Existing Issue # correction, AI progress, Shopify matching, Notes priority, category, 145g and inventory defaults retained.

V2.4.16.5: Corrected Shopify Product Category to the current exact taxonomy breadcrumb: Arts & Entertainment > Hobbies & Creative Arts > Collectibles > Comic Books. This is written into Product Category for every exported comic.

V2.4.16.5: Visual branding update only. Adds the ComicRox website banner and prominent 'ComicRox Batch Upload Tool' header. Core V2.4.16.3 listing, AI, Shopify matching and CSV functionality is unchanged.

V2.4.16.5: Banner loading hotfix. The supplied ComicRox website banner is embedded directly into the app HTML so it always displays through the local PowerShell server. Core listing functionality unchanged.

V2.4.16.6 - MULTI-PHOTO GROUPING
- Step 4 accepts xN after grade/price, e.g. "1 NM £10 x5".
- xN means the next N selected photos belong to that one comic; no x means one photo.
- Review shows all grouped photos for the comic.
- AI receives all grouped photos together.
- Shopify CSV exports one product with additional image rows in the same photo order.
- Existing category, notes, manual issue number, facsimile-year, AI progress and branding behaviour preserved.
- Launcher BAT rewritten without UTF-8 BOM.

V2.5.4 Wholesale Beta additions:
- Guided Lunar Resources product-data workflow
- Copy Lunar invoice codes to clipboard
- Open Lunar Resources button
- Import Lunar Product Data CSV
- Match product data by exact Lunar Code
- Populate official Lunar ImageUrl cover artwork
- Show product-data/image match counts
- Enrich rows with writer and cover artist metadata


V2.5.4 Wholesale descriptions:
- Lunar Description is used as the verified story/solicitation source.
- Each wholesale row has VIEW / EDIT DESCRIPTION.
- ComicRox description adds verified publisher/creator/issue/variant/pages/rating/release metadata and a new-stock footer.
- Description is editable, previewable, resettable from Lunar data, and exported to Shopify Body (HTML).
- No key/first-appearance claims are invented.

V2.5.7 DELIVERY PLANNER BETA (30 Sep 2026)
-------------------------------------------
- Built from the protected V2.5.4 Wholesale Beta baseline.
- Standard Batch is unchanged.
- Adds Lunar Delivery Planner inside Wholesale Batch.
- Planner accepts .xlsx (including Lunar basket tables copied into Excel) and .csv.
- Groups future products by In-Store week and already-released products into the next expected weekly shipment.
- Infers quantity from Extended / Discounted when the copied Lunar basket leaves the Qty cell blank.
- Flags Conditional Backorder / Waiting on print run notes.
- Shows products, physical units, basket product cost and next expected bundle.
- Weekly bundles expand to title-level detail.
- PRINT / SAVE PDF opens a clean printable schedule.
- EXPORT WEEKLY CSV creates a detailed weekly forecast CSV.
- Forecast is planning guidance only; actual Lunar invoices depend on what ships and shipping charges.


V2.5.8 LUNAR (30 Sep 2026)
--------------------------
- Built directly from Steve's supplied V2.5.7 Delivery Planner Beta.
- Standard Batch logic is unchanged.
- Visible Wholesale Batch naming changed to Lunar Batch.
- Wholesale Export renamed Lunar Export.
- Export button/file naming changed to Lunar.
- Shopify Lunar exports now use the exact "New Release" tag for the automatic New Releases collection.
- Generic "wholesale" export tag replaced with "Lunar".
- Pre-order logic is intentionally deferred; this build is for stock actually received/in hand.
- Delivery Planner retained.
- Internal wholesale IDs/JavaScript variable names intentionally retained to minimise regression risk.


V2.5.9 LUNAR AUTO BETA (30 Sep 2026)
-------------------------------------
- Built from the confirmed-working V2.5.8 Lunar benchmark. V2.5.8 remains the rollback build.
- Adds PROCESS LUNAR BATCH Auto Assist.
- After invoice import, one click copies Lunar codes, opens Lunar Resources and watches Downloads.
- Once the Lunar Product Data CSV is downloaded, ComicRox detects it automatically, imports it, matches Lunar codes, loads official artwork/metadata and populates Lunar Review.
- Manual Copy/Open/Import controls remain available as fallback.
- This beta does NOT attempt to type/click inside Lunar's authenticated web page; that would require a reliable authenticated endpoint or browser automation layer. It automates everything around that protected web interaction.
- Standard Batch and Delivery Planner are otherwise unchanged.


V2.5.10 ONE-CLICK BETA (30 Sep 2026)
-------------------------------------
- Built from proven V2.5.9; V2.5.8 remains the protected rollback benchmark.
- PROCESS LUNAR BATCH now first asks the local PowerShell backend to discover Lunar's Resources search form and attempt Product Data retrieval directly.
- No private Lunar endpoint is hard-coded: the backend discovers the live form/action/field names from Lunar's Resources HTML.
- If Lunar requires the user's authenticated browser session or changes the form, the app automatically falls back to the proven V2.5.9 flow: codes copied, Resources opened, Downloads watched, CSV auto-imported.
- Standard Batch and Delivery Planner remain otherwise unchanged.


V2.5.11 EBAY PRICING BETA (30 Sep 2026)
----------------------------------------
- Built from V2.5.10; V2.5.8 remains the protected rollback benchmark.
- Adds current eBay UK active-listing price checks to Lunar Review.
- eBay Listed Avg appears immediately before the editable ComicRox price.
- Shows active listing average, range and number of usable GBP listings.
- ComicRox price gets a red outline/glow whenever it is below the eBay listed average and at least 2 comparable listings were returned.
- Warning disappears when ComicRox price is raised to the average or above.
- Uses official eBay Browse API (EBAY_GB). Requires EBAY_CLIENT_ID and EBAY_CLIENT_SECRET environment variables.
- If API credentials are not configured, CHECK EBAY opens the matching eBay UK search instead of fabricating an average.
- First beta uses active listing item prices only; sold-price analysis and postage-aware pricing are intentionally deferred.


V2.5.12 EBAY LAYOUT BETA (30 Sep 2026)
---------------------------------------
- Built directly from V2.5.11 eBay Pricing Beta.
- Lunar Review green column headers are now sticky while scrolling vertically.
- Image URL/status removed from the main pricing columns and relocated beneath the product's VIEW / EDIT DESCRIPTION controls.
- Frees horizontal space for eBay pricing data and keeps ComicRox price prominent.
- Wholesale Review visible heading renamed Lunar Review.
- eBay active-listing pricing logic from V2.5.11 retained unchanged.
- V2.5.8 remains the protected rollback benchmark.


V2.5.14: eBay pricing UI split into clearly labelled Avg, Range and Comps columns. Added expandable eBay pricing key and direct eBay search link. eBay Avg/Range are active listing ITEM prices only; postage is not included.
