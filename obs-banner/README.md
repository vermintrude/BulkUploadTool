# ComicRox OBS rotating banners

[Download the ZIP](../downloads/ComicRox-OBS-Rotating-Banners.zip). Extract it, read `START HERE.txt`, then add `banner.html` to OBS as a local Browser Source at **960 × 160**.

![Compact banner](package/Preview-compact.png)

The recommended version uses a still of the supplied ComicRox video logo. Messages rotate every seven seconds, with Requests Welcome on its own slide. The pack also includes a wide 1600 × 180 version, an optional silent animated blue-ring version, and an offline editor that exports a self-contained updated HTML file. Its optional logo picker accepts a supplied PNG/JPG/WebP without redrawing it.

No outside services, account, plugin or runtime network requests are needed. Editor changes reach OBS when the downloaded HTML replaces the source file and the source is refreshed.

## Development verification

Build pages with `python3 obs-banner/build.py`. Browser checks are in `obs-banner/check-banner.cjs` and use the existing Playwright install plus `/usr/bin/chromium`. Set `COMICROX_TEST_MODULES` if Playwright is installed elsewhere.

Verified: five-message rotation, Requests Welcome isolated, compact/wide text fit, silent WebM playback, editable timing, empty-message validation, saved custom banner reopening with embedded imagery, and no external requests. These are Chromium checks, not a claim of testing the user's Windows OBS. This cloud browser blocks file-URL navigation by policy, so automated checks used a local-only HTTP origin; the delivered pages have no relative asset fetches or server dependencies.

The supplied video was converted to a silent 320px square WebM; a still from the same clip supplies the default logo. The unused AI-generated logo experiment is not in this pack.
