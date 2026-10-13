import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Static single-page app: deploy the `dist/` folder to any static host.
export default defineConfig({
  plugins: [react()],
  base: './',
});
