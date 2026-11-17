import { expect, test, type Page } from '@playwright/test';
import { startGame, waitFor } from './helpers';

async function cheats(page: Page, ids: string[]): Promise<void> {
  await page.locator('.debug__toggle').click();
  await page.locator('.debug__tab[data-tab="dev"]').click();
  for (const id of ids) await page.locator(`[data-cheat="${id}"]`).click();
  await page.locator('.debug__toggle').click();
}

test.describe('monde ouvert', () => {
  test.skip(({ isMobile }) => isMobile, 'test clavier');

  test('station-service : la pompe fait le plein de la moto et le fait payer au litre', async ({ page }) => {
    await startGame(page);
    await cheats(page, ['fuel-empty', 'station-park']);
    // Joueur face à la pompe 1 (222 ; -38), la moto garée à côté.
    await waitFor(page, (s) => s.player.grounded && Math.abs(s.player.x - 222) < 0.6 && Math.abs(s.player.z + 35.8) < 0.6, 20_000);
    // Le monde autour de la station est chargé par morceaux.
    expect(await page.evaluate(() => window.__50CC__!.loadedChunks)).toBeGreaterThan(4);

    await page.evaluate(() => window.__50CC__!.lookAt(222, 1.0, -38));
    await waitFor(page, (s) => (s.focus ?? '').startsWith('Pompe SP95'));
    await expect(page.locator('.prompt__hint')).toContainText('Réservoir 0,0 L');
    const money = await page.evaluate(() => window.__50CC__!.money);

    await page.keyboard.down('KeyE');
    try {
      // 1,85 €/L : 2 € débités = un peu plus d'un litre dans le réservoir.
      await page.waitForFunction((m) => window.__50CC__!.money <= m - 2, money, { timeout: 40_000 });
    } finally {
      await page.keyboard.up('KeyE');
    }
    await expect(page.locator('.prompt__hint')).not.toContainText('Réservoir 0,0 L');
  });
});
