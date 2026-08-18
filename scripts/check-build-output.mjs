import { readFile } from 'node:fs/promises';

const MIDDLEWARE_BUNDLE = '.vercel/output/functions/_middleware.func/middleware.mjs';

const listOf = (source, name) => {
	// esbuild rewrites the generated `const` to `var`; stop at the `]` that ends the list.
	const match = source.match(new RegExp(`(?:const|var) ${name} = (\\[[\\s\\S]*?\\])\\s*\\.map\\(`));
	return match ? JSON.parse(match[1]) : undefined;
};

const config = JSON.parse(await readFile('.vercel/output/config.json', 'utf-8'));
const pageRoutes = config.routes.filter((route) => route.dest && !route.src.startsWith('^/_astro'));

for (const route of pageRoutes) {
	console.log(`${route.dest.padEnd(38)} ${route.src}`);
}

// Only the patched adapter hands the middleware a forwarding table. Counting routes
// with `dest: _middleware` instead would also count the 404 fallback and the
// `isr.exclude` entries, which point there on an unpatched build too.
const bundle = await readFile(MIDDLEWARE_BUNDLE, 'utf-8').catch(() => undefined);
const isrRoutes = bundle && listOf(bundle, 'isrRoutes');
const isrExcludedRoutes = (bundle && listOf(bundle, 'isrExcludedRoutes')) ?? [];

if (!isrRoutes?.length) {
	console.log('\nUNPATCHED: every cached route goes straight to the ISR function, the middleware is unreachable');
} else {
	console.log(`\nPATCHED: ${isrRoutes.length} cached route(s) enter through the edge middleware`);
	console.log(`  next() -> _isr:     ${isrRoutes.join(' ')}`);
	console.log(`  next() -> _render:  ${isrExcludedRoutes.join(' ') || '(none)'} + anything unmatched`);
}
