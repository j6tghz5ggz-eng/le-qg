/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le build fonctionne sur n'importe quel hébergeur gratuit
  // (Cloudflare Pages, GitHub Pages dans un sous-dossier, itch.io…).
  base: './',
  server: { port: 5173 },
  preview: { port: 4173 },
  optimizeDeps: {
    // Havok charge son propre fichier .wasm : Vite ne doit pas le pré-empaqueter.
    exclude: ['@babylonjs/havok'],
  },
  build: {
    // ES2022 : Safari 16+, Chrome/Edge/Firefox récents, WebView Android à jour.
    target: 'es2022',
    // Les sourcemaps de Babylon sont lourdes : activées seulement à la demande (SOURCEMAP=1).
    sourcemap: process.env.SOURCEMAP === '1',
    chunkSizeWarningLimit: 4096,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
