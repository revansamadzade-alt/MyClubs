import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ClubFund's dependencies are only reached through a lazy route; pre-bundle them at dev-server start so the first
  // visit doesn't trigger a dependency re-optimization and full page reload.
  optimizeDeps: {
    include: ['@supabase/supabase-js', '@wallet-standard/app', '@wallet-standard/features', '@solana/wallet-standard-features'],
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived, separately cached chunks: React + router, and the dated data snapshot.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/.test(id)) return 'vendor';
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'icons';
          if (/[\\/]src[\\/]data[\\/]generated[\\/]/.test(id)) return 'data';
          return undefined;
        },
      },
    },
  },
});
