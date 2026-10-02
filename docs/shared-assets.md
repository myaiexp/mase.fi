# Shared assets — cross-origin caching contract

`base.css` and `base-components.js` are served from the mase.fi webroot to other apps (helm, prospect, ghost, …). This doc is the contract between mase.fi and those consumers.

## Cache headers

nginx (`$shared_cc` map in `conf.d/cache-control-map.conf`) picks the header from the request URL:

- **Unversioned** (`https://mase.fi/base.css`): `max-age=0, stale-while-revalidate=7d` + ETag. The browser paints from its copy and revalidates in the background, so a mase.fi push reaches a returning visitor on their next load with **no consumer redeploy**. Plain `no-cache` used to put a ~300 ms 304 through Cloudflare in every page's critical path.
- **Any `?v=` present**: `immutable, max-age=1y`.

## Consumer rules

- **Link shared assets unversioned.** Never append a `?v=` keyed to your own deploy hash: that pins the asset immutably to a string that never changes when *mase.fi's* content does, so pushes go unseen until the consumer redeploys.
- **A consumer service worker must not `cacheFirst` them** — that defeats revalidation regardless of the HTTP header.
- **SRI pins (`integrity="sha384-…"`) need a consumer redeploy on every mase.fi push.** A stale pin is not degraded: the browser refuses to load the file at all, silently. `forgejo-deploy mase.fi` runs `helm/scripts/check-sri-pins` after copying to the webroot and ntfys "mase.fi: stale SRI pins" with the list of apps holding stale pins (advisory — it never fails the apex publish).

## The `/fonts/` exception

`base.css` references `jetbrains-mono.woff2?v=<content hash>`, so the file is immutable and a font change is a new URL. `fonts.json` + `~/Projects/helm/scripts/webfonts` regenerate `src/fonts/` (then paste the new hash into `base.css`); the build copies `src/fonts/` into `dist/fonts/`, and nginx's `location ^~ /fonts/` adds the CORS header fonts need cross-origin (`base.css` itself only needs it for SRI).
