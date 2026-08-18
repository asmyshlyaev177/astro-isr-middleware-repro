# Astro ISR + edge middleware reproduction

Reproduction for [withastro/astro#17687](https://github.com/withastro/astro/pull/17687).

Live:

- broken (`@astrojs/vercel` 11.0.5) — https://astro-isr-middleware-repro.vercel.app
- patched (PR branch) — https://astro-isr-mw-patched.vercel.app

Three consecutive requests to each, same moment:

```
broken    cache=MISS  x-middleware-ran-at=03:41:19.688  html-rendered-at=03:41:19.690
          cache=HIT   x-middleware-ran-at=03:41:19.688  html-rendered-at=03:41:19.690
          cache=HIT   x-middleware-ran-at=03:41:19.688  html-rendered-at=03:41:19.690

patched   cache=MISS  x-middleware-ran-at=03:41:20.922  html-rendered-at=03:41:21.249
          cache=MISS  x-middleware-ran-at=03:41:21.575  html-rendered-at=03:41:21.249
          cache=MISS  x-middleware-ran-at=03:41:21.967  html-rendered-at=03:41:21.249
```

Broken: the middleware stamp is frozen at the cold render — it was cached with the HTML, the
middleware never ran again. Patched: the stamp moves every request while the HTML stays the cached
one, so middleware runs and the cache still serves.

`x-vercel-cache` reads `MISS` on the patched build because it describes the *outer* request, which
now ends in the `_middleware` edge function — function responses are never cache-served, so the
proxy stamps `MISS` and resets `age` to 0. The ISR hit happens on the middleware's subrequest to
`/_isr?x_astro_path=…`. The middleware copies that subrequest's status out as `x-isr-cache`:

```
patched   x-isr-cache: MISS  x-vercel-cache: MISS   (cold)
          x-isr-cache: HIT   x-vercel-cache: MISS
          x-isr-cache: HIT   x-vercel-cache: MISS

broken    x-isr-cache: none  x-vercel-cache: MISS   (cold, middleware ran inside the ISR function)
          x-isr-cache: none  x-vercel-cache: HIT
          x-isr-cache: none  x-vercel-cache: HIT
```

So on a patched build, read `x-isr-cache` (or the constant `html-rendered-at`) for cache status,
not `x-vercel-cache`. Note that the proxy stamps `MISS` on the middleware's subrequest to
`_render` as well, so `MISS` alone says nothing — `/live/42` (excluded) and `/no-such-page`
(unmatched) both read `MISS` forever. `HIT` is the only positive signal.

With `isr` enabled and `middlewareMode: 'edge'`, every on-demand route is routed straight to the
ISR function, so the edge middleware is never reached. Middleware still runs *inside* the ISR
function, which Vercel skips entirely on a cache hit — middleware works on a cold entry and stops
working once the entry is warm, with no error and no log.

## What the app does

`src/middleware.js` does two things on every request:

- stamps `x-middleware-ran-at` on the response
- redirects `/protected` to `/login` unless the `repro_session` cookie is set

The home page probes the deployment from the browser and reports what actually happened:

| Probe | Broken build | Patched build |
| --- | --- | --- |
| `GET /` twice | `x-middleware-ran-at` frozen at the cold render | stamp fresh every request |
| `GET /protected` with a session cookie | `307` to `/login`, straight from cache | `200`, the page |
| `GET /protected` without one | whatever got cached first | `307` to `/login` |
| `GET /live/42` twice | renders twice | renders twice |
| `GET /?probe=1` then `/?probe=2` | one cache entry | one cache entry |

The last two probes pass on both builds, and that is the point: they pin the two things a fix
routing ISR traffic through the middleware can quietly break. `/live/[id]` is matched by a
`RegExp` in `isr.exclude`, so it must never reach the cache; `?probe=` must not enter the cache
key, or the entry fragments per URL. Forwarding by *exclusion* — anything not explicitly excluded
goes to `/_isr` — fails both, plus gives every unmatched 404 URL its own cache entry. The patch
forwards by a positive list of the ISR route patterns instead, with the exclusions checked first,
because a dynamic cached route can also match an excluded path.

Which `/protected` answer the broken build gives depends on whether the cache entry was first built
with or without the cookie — either way the middleware no longer decides. Measured on the two
deployments above: with the cookie set, broken returned a cached `307` to `/login`, patched
returned `200` with `x-middleware-session: alex`.

"Reset ISR cache" revalidates both cache entries with the `bypassToken` (`x-prerender-revalidate`),
so you can watch the same request go from correct (cold) to broken (warm). Verified against both
deployments; the new entry lands a second or two after the call.

## Timing

The home page sleeps 1500ms before rendering, so the cache is worth something measurable. The
**Measure** button times a forced re-render (bypass token) against a normal cached request.

Measured from Europe, 8 warm samples each, sorted:

```text
broken   warm   0.205 0.209 0.210 0.211 0.215 0.221 0.223 0.227   cold 2.12s
patched  warm   0.238 0.242 0.242 0.243 0.244 0.246 0.252 0.274   cold 2.87s
```

The cache still absorbs the 1.5s render on both. Routing through the edge middleware costs about
30ms per request — the middleware runs and then fetches the cached ISR response over an internal
hop, instead of the CDN answering directly.

## Two builds

Same app, one dependency changes:

```sh
pnpm use:published   # @astrojs/vercel 11.0.5 from npm — the bug
pnpm use:patched     # vendor/astrojs-vercel-patched.tgz — built from the PR branch
```

`vendor/astrojs-vercel-patched.tgz` is `pnpm pack` of `packages/integrations/vercel` on the PR
branch (`isr_vercel_middleware_cache`), same version number, patched code.

## Check without deploying

The bug is visible in the generated `.vercel/output/config.json`:

```sh
pnpm use:published && pnpm build && pnpm check
# /_isr?x_astro_path=$0&…   ^/$
# UNPATCHED: every cached route goes straight to the ISR function, the middleware is unreachable

pnpm use:patched && pnpm build && pnpm check
# _middleware               ^/$
# PATCHED: 4 cached route(s) enter through the edge middleware
#   next() -> _isr:     ^\/login\/?$ ^\/protected\/?$ ^\/$ ^\/404\/?$
#   next() -> _render:  ^/live/([^/]+?)$ + anything unmatched
```

The last two lines are the table the patched middleware forwards by, read back out of the built
edge bundle. `isr.exclude` entries are checked before the cached patterns, and a path matching
neither goes to `_render` rather than getting its own cache entry.

## Deploy both to Vercel

Two branches, identical except for the `@astrojs/vercel` dependency:

- `main` — published 11.0.5, the bug
- `patched` — the PR branch tarball

```sh
git checkout main    && vercel deploy --prod   # project: astro-isr-mw-broken
git checkout patched && vercel deploy --prod   # project: astro-isr-mw-patched
```

Use a separate Vercel project per branch (`vercel link` before each deploy), so the two
deployments keep separate ISR caches.

Then open each deployment, click **Probe /** twice (the first request builds the cache entry, the
second hits it), and compare the verdicts.

## Notes

- `bypassToken` is committed in `src/config.js` on purpose; anyone with it can bust this demo's
  cache. Do not copy that into a real project.
- ISR expiration is 600s, so a stale entry also clears itself after 10 minutes.
