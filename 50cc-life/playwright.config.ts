import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de fumée : le jeu démarre-t-il, sur PC et sur un téléphone émulé ?
 * Ils tournent sur le build de production (vite preview).
 *
 * PW_CHROMIUM_PATH permet d'utiliser un Chromium déjà installé.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'pc', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
