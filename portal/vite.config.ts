import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Static single-page app: deploy the `dist/` folder to any static host.
// `--mode demo` (npm run build:demo) builds the clickable demo with example data
// into `dist-demo/`; only that build includes the demo video files.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  // A real build without Supabase settings would deploy a portal nobody can log in to; fail loudly instead.
  if (command === 'build' && mode !== 'demo' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error(
      'VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY saknas. Lägg in dem i .env.local (lokalt) eller under ' +
        'Environment variables (Netlify). Värdena finns i Supabase → Project Settings → API.',
    );
  }
  return {
    plugins: [react()],
    base: './',
    publicDir: mode === 'demo' ? 'demo-public' : 'public',
  };
});
