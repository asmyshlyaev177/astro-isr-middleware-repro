import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE } from './config.js';

export const onRequest = defineMiddleware(async (context, next) => {
	const ranAt = new Date().toISOString();
	const session = context.cookies.get(SESSION_COOKIE)?.value;

	if (context.url.pathname === '/protected' && !session) {
		return context.redirect('/login', 307);
	}

	const response = await next();
	response.headers.set('x-middleware-ran-at', ranAt);
	response.headers.set('x-middleware-session', session ?? 'anonymous');
	return response;
});
