import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE } from './config.js';

export const onRequest = defineMiddleware(async (context, next) => {
	const ranAt = new Date().toISOString();
	const session = context.cookies.get(SESSION_COOKIE)?.value;

	if (context.url.pathname === '/protected' && !session) {
		return context.redirect('/login', 307);
	}

	const startedAt = Date.now();
	const response = await next();
	const forwardMs = Date.now() - startedAt;

	response.headers.set('x-forward-ms', String(forwardMs));
	response.headers.set('x-middleware-ran-at', ranAt);
	response.headers.set('x-middleware-session', session ?? 'anonymous');
	// What the ISR subrequest reported, before the outer response overwrites x-vercel-cache.
	response.headers.set('x-isr-cache', response.headers.get('x-vercel-cache') ?? 'none');
	response.headers.set('x-isr-age', response.headers.get('age') ?? 'none');
	return response;
});
