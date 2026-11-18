# Shopify SEO implementation

`ComicRox-SEO.js` is the source module. It is appended to the end of `ComicRox-Resume.js` after the `// BEGIN COMICROX SEO BUNDLE` marker, so existing installed HTML/server routes can serve it without configuration replacement. The browser test checks that the bundled source matches.

The generator consumes listing facts and CSV metadata, cleans HTML boundaries into spaces, preserves known abbreviations/mixed-case names, and uses deterministic templates. Existing listing fields are only read. `enrich` appends the two SEO columns, leaving continuation rows empty. Lunar and Series save that same enriched CSV into their existing pending history; Standard wraps the existing synchronous exporter and enriches its captured blob.

Per-record `seoGenerated` values distinguish generated wording from overrides. `comicrox_shopify_seo_v1` tracks a bounded set of generated values per field/handle; unknown non-empty Shopify fields are preserved. Storage failure falls back to no recognition, never clearing existing wording or blocking a new listing export.

`SHOPIFY SEO` loads a fresh snapshot, previews changes, and exports `comicrox-shopify-seo-v1` JSON. It includes expected SEO plus source title/body/release date for live revalidation. Review CSVs are deliberately labelled as review-only and are not Shopify update CSVs.

`Apply-ComicRox-SEO.ps1` uses the existing Shopify connection via `Get-ComicRoxFlowHeaders`, but a separate SEO request function. It previews first; mutation requires the explicit APPLY prompt (or explicit `-Apply`). It uses `productUpdate(product: ProductUpdateInput)` with only `id` and the selected `seo` properties. The other SEO property is omitted when preserved. Source/SEO conflicts are skipped. Each update is revalidated immediately before submission, and already-matching values are idempotent. Shopify offers no atomic SEO compare-and-set here; a very narrow concurrent edit between final read and mutation remains possible, so avoid simultaneous manual SEO editing during a batch.

No cron/Flow change or crosslist automation is installed. Release transitions refresh recognised generated SEO at the next export/backfill; the new-product/receipt/stock workflows otherwise retain their behaviour.

Official Shopify docs were fetched and read on 2026-11-18. The CSV docs describe title/handle requirements, omission versus blank overwrite, backward-compatible old header names and variant dependencies. That is why backfill uses a narrowly scoped GraphQL update rather than an overwrite product CSV.

To rebuild the served bundle after changing the module, retain the Resume prefix before the bundle marker and append the marker plus the exact module text. `tests/shopify-seo.test.mjs` enforces this relationship.
