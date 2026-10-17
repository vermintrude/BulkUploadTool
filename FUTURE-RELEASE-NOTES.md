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
