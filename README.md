# Astro ISR + edge middleware reproduction

Reproduction for [withastro/astro#17687](https://github.com/withastro/astro/pull/17687).

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
| `GET /` on a cache hit | `x-middleware-ran-at` missing | header present, `x-vercel-cache: HIT` |
| `GET /protected` with a session cookie | cached redirect to `/login` | the page |
| `GET /protected` without one | cached page, no redirect | redirect to `/login` |

Which of the two `/protected` rows you see depends on whether the cache entry was first built with
or without the cookie — either way the middleware no longer decides.

"Reset ISR cache" revalidates both cache entries with the `bypassToken` (`x-prerender-revalidate`),
so you can watch the same request go from correct (cold) to broken (warm).

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
# UNPATCHED: every route goes straight to the ISR cache, the middleware is unreachable

pnpm use:patched && pnpm build && pnpm check
# _middleware               ^/$
# PATCHED: 4 route(s) enter through the edge middleware
```

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
