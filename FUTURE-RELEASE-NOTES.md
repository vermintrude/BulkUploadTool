# Future release requests

## Lunar export history clarity — requested 17 October 2026

Owner sees three completed exports while working on one invoice and reasonably
interprets these as new/current files. Defer this UI change to a future release.

- Show current-batch pending exports prominently.
- Move completed exports to a collapsed Completed export history section.
- Label entries with export date/time, product count, source invoice/week and
  a distinct run identifier so identical filenames are distinguishable.
- Show partial-import instructions only for pending entries, not imported ones.
- Retain audit history and exact CSV redownload; never delete completed records
  or change their import outcomes merely to simplify the display.
- Keep older unresolved pending exports discoverable with an explicit count;
  do not hide them or weaken duplicate-export/partial-import safeguards.

Status: requested for future release; no application behavior changed.

## OBS banner editor inside Admin — requested 20 October 2026

Owner wants the standalone Edit messages.html tool integrated into the batch
listing tool's Admin screen in the next release, keeping controls in one place.
Defer implementation until that release; the current standalone editor remains usable.

- Add an OBS Banner Editor entry in Admin with the existing rotating-banner preview,
  one-message-per-line editing, green supporting captions, timing, compact/wide sizes,
  clean static logo by default and optional animated blue-ring logo/custom image.
- Preserve the existing self-contained OBS HTML format and 960 × 180 compact default.
- Make saving unambiguous: show which file needs replacing, where OBS points,
  and how to refresh it; avoid repeated Downloads copies named banner (1).html.
- Investigate a user-configured, explicitly selected OBS output folder/file so the
  local app can update that same banner safely, rather than assuming filesystem access.
  Browser-only fallback must clearly explain downloading/replacing the existing file.
- Keep preview changes distinct from saved OBS changes; show save success/errors
  beside the controls. Preserve custom messages/settings across app restarts.
- Explain that different OBS Scene Collections need separate Browser Sources but can
  all reference the same output HTML file. Do not modify OBS scenes automatically.
- Reuse the source in obs-banner/ and retain an export/backup path for standalone use.

Status: recorded for the next release; no Admin integration implemented yet.

## Website search: explain no results before alternatives — requested 22 October 2026

Owner requests this for the next website work session, not an immediate deployment.
Currently a no-match search can show alternative products without telling the
customer that the requested search found nothing.

- When the product search has zero results, show a prominent message such as:
  “No results found for your search. Here are some other comics you might like.”
- Put the message before the recommended/alternative products and make clear
  those products are suggestions, not matches to the original query.
- If no suggestions exist, show a helpful no-results message without promising
  recommendations; let the customer edit their search.
- Apply to the relevant full-search and predictive-search experiences on mobile
  and desktop, checking each actual no-results path. This is storefront product
  search, not the separate eBay comic-price lookup.
- Keep successful search results unchanged and do not display no-results copy
  while a search is still loading or has failed technically.

Status: saved for the next website update; not implemented or published.
