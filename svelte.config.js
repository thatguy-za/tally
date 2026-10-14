import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // Replaced by a scheme-agnostic host check in src/hooks.server.js so a
    // plain-http self-hosted deploy works on any hostname without setting ORIGIN.
    csrf: { checkOrigin: false },
    // Tells the browser what this app may load, so a script injected into a
    // page can't run or send data somewhere else. The one outside host is
    // Google's favicon service (merchant logos). Production only — the dev
    // server needs inline scripts and a websocket for hot reload.
    ...(process.env.NODE_ENV === 'production'
      ? {
          csp: {
            mode: 'auto',
            directives: {
              'default-src': ['self'],
              'script-src': ['self'],
              'style-src': ['self', 'unsafe-inline'],
              'img-src': ['self', 'data:', 'blob:', 'https://www.google.com', 'https://*.gstatic.com'],
              'font-src': ['self'],
              'connect-src': ['self'],
              'manifest-src': ['self'],
              'worker-src': ['self'],
              'object-src': ['none'],
              'base-uri': ['self'],
              'form-action': ['self'],
              'frame-ancestors': ['none']
            }
          }
        }
      : {})
  }
};

export default config;
