import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // Replaced by a scheme-agnostic host check in src/hooks.server.js so a
    // plain-http self-hosted deploy works on any hostname without setting ORIGIN.
    csrf: { checkOrigin: false }
  }
};

export default config;
