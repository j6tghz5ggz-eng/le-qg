import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/debug/debugHooks';

async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__50CC__?.state === 'playing', null, { timeout: 60_000 });
  // Laisse le joueur se poser au sol.
  await page.waitForFunction(() => window.__50CC__!.player.grounded, null, { timeout: 10_000 });
}

const player = (page: Page) => page.evaluate(() => window.__50CC__!.player);

type PlayerInfo = Awaited<ReturnType<typeof player>>;

/** Maintient une touche jusqu'à ce que la condition soit vraie (piloté par la position, pas par le temps). */
async function holdUntil(page: Page, key: string, done: (p: PlayerInfo) => boolean, timeout = 15_000): Promise<PlayerInfo> {
  await page.keyboard.down(key);
  const start = Date.now();
  try {
    for (;;) {
      const p = await player(page);
      if (done(p)) return p;
      if (Date.now() - start > timeout) throw new Error(`Condition non atteinte avec ${key} : ${JSON.stringify(p)}`);
      await page.waitForTimeout(50);
    }
  } finally {
    await page.keyboard.up(key);
  }
}

test.describe('joueur sur PC', () => {
  test.skip(({ isMobile }) => isMobile, 'test clavier');

  test('marche (S = reculer) et saute (Espace)', async ({ page }) => {
    await startGame(page);
    const start = await player(page);

    // Piloté par la position (pas par le temps) : indépendant de la vitesse de la machine.
    await page.keyboard.down('KeyS');
    await page.waitForFunction((z0) => window.__50CC__!.player.z < z0 - 0.5, start.z, { timeout: 10_000 });
    await page.keyboard.up('KeyS');
    const afterWalk = await player(page);
    expect(afterWalk.z).toBeLessThan(start.z - 0.5);
    expect(Math.abs(afterWalk.x - start.x)).toBeLessThan(0.2);

    await page.waitForFunction(() => window.__50CC__!.player.grounded);
    const ground = (await player(page)).y;
    await page.keyboard.press('Space');
    await expect.poll(async () => (await player(page)).y, { timeout: 3000 }).toBeGreaterThan(ground + 0.25);
    await page.waitForFunction(() => window.__50CC__!.player.grounded, null, { timeout: 5000 });
  });

  test('carte « Cliquez pour jouer » et réticule sur la caisse à outils', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('.lock-hint')).toBeVisible();
    await expect(page.locator('.lock-hint')).toContainText('Cliquez pour jouer');
    await expect.poll(() => page.evaluate(() => window.__50CC__!.focus)).toBe('Caisse à outils');
    await expect(page.locator('.prompt__label')).toHaveText('Caisse à outils');
    await expect(page.locator('.prompt__hint')).toContainText('Prendre');
    await expect(page.locator('.touch')).toBeHidden();
  });

  test('entre dans le garage en franchissant le seuil de 15 cm', async ({ page }) => {
    await startGame(page);
    // Contourne l'établi par la droite, avance, revient face à la porte, entre.
    await holdUntil(page, 'KeyD', (p) => p.x > 2.3);
    await holdUntil(page, 'KeyW', (p) => p.z > 6.5);
    await holdUntil(page, 'KeyA', (p) => p.x < -0.5); // à gauche du supermotard garé
    const inside = await holdUntil(page, 'KeyW', (p) => p.z > 10);
    expect(inside.y).toBeGreaterThan(0.12); // debout sur la dalle (0,15 m)
    expect(inside.y).toBeLessThan(0.25); // sans flotter au-dessus
  });

  test('s’accroupir (C) réduit la taille du joueur', async ({ page }) => {
    await startGame(page);
    await page.keyboard.down('KeyC');
    await expect.poll(async () => (await player(page)).crouched).toBe(true);
    await page.keyboard.up('KeyC');
    await expect.poll(async () => (await player(page)).crouched).toBe(false);
  });
});

test.describe('joueur sur mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'test tactile');

  test('commandes tactiles : prendre puis lancer la caisse à outils', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('.touch')).toBeVisible();
    await expect(page.locator('.lock-hint')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__50CC__!.focus)).toBe('Caisse à outils');

    await page.getByRole('button', { name: 'Prendre' }).tap();
    await expect.poll(() => page.evaluate(() => window.__50CC__!.holding)).toBe(true);
    await expect(page.getByRole('button', { name: 'Lâcher' })).toBeVisible();

    await page.getByRole('button', { name: 'Lancer' }).tap();
    await expect.poll(() => page.evaluate(() => window.__50CC__!.holding)).toBe(false);
    await expect(page.getByRole('button', { name: 'Lancer' })).toBeHidden();
  });

  test('bouton « Accroupir » (bascule)', async ({ page }) => {
    await startGame(page);
    await page.getByRole('button', { name: 'Accroupir' }).tap();
    await expect.poll(async () => (await player(page)).crouched).toBe(true);
    await page.getByRole('button', { name: 'Se lever' }).tap();
    await expect.poll(async () => (await player(page)).crouched).toBe(false);
  });
});
