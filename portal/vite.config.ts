import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Static single-page app: deploy the `dist/` folder to any static host.
// `--mode demo` (npm run build:demo) builds the clickable demo with example data
// into `dist-demo/`; only that build includes the demo video files.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  publicDir: mode === 'demo' ? 'demo-public' : 'public',
}));
