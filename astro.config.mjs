import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import { BYPASS_TOKEN, ISR_EXPIRATION } from './src/config.js';

export default defineConfig({
	output: 'server',
	adapter: vercel({
		middlewareMode: 'edge',
		isr: {
			expiration: ISR_EXPIRATION,
			bypassToken: BYPASS_TOKEN,
		},
	}),
});
