import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('.vercel/output/config.json', 'utf-8'));
const pageRoutes = config.routes.filter((route) => route.dest && !route.src.startsWith('^/_astro'));

for (const route of pageRoutes) {
	console.log(`${route.dest.padEnd(38)} ${route.src}`);
}

// `^/.*$` is the 404 fallback, which reaches the middleware either way.
const middlewareRoutes = pageRoutes.filter(
	(route) => route.dest.includes('_middleware') && route.src !== '^/.*$',
);
console.log(
	middlewareRoutes.length > 0
		? `\nPATCHED: ${middlewareRoutes.length} route(s) enter through the edge middleware`
		: '\nUNPATCHED: every route goes straight to the ISR cache, the middleware is unreachable',
);
