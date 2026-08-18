import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import { BYPASS_TOKEN, EXCLUDED_PREFIX, ISR_EXPIRATION } from './src/config.js';

export default defineConfig({
	output: 'server',
	adapter: vercel({
		middlewareMode: 'edge',
		isr: {
			expiration: ISR_EXPIRATION,
			bypassToken: BYPASS_TOKEN,
			// A RegExp exclusion over a dynamic route: `/live/[id]` must never be cached.
			exclude: [new RegExp(`^\\${EXCLUDED_PREFIX}`)],
		},
	}),
});
