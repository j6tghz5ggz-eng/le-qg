import { expect, test, type Page } from '@playwright/test';
import { startGame, waitFor } from './helpers';

/** Ouvre le panneau 📊 sur l'onglet DEV. */
async function openDev(page: Page): Promise<void> {
  await page.locator('.debug__toggle').click();
  await page.locator('.debug__tab[data-tab="dev"]').click();
  await expect(page.locator('.debug__dev')).toBeVisible();
}

const money = (page: Page): Promise<number> => page.evaluate(() => window.__50CC__!.money);

test.describe('onglet DEV (triches)', () => {
  test('argent : 500 € au départ, +1 000 €, remise à zéro, affiché en haut à droite', async ({ page }) => {
    await startGame(page);
    expect(await money(page)).toBe(500);
    await openDev(page);
    await page.locator('[data-cheat="money+1000"]').click();
    expect(await money(page)).toBe(1500);
    await expect(page.locator('.money__amount')).toHaveText(/1\s500\s€/);
    await page.locator('[data-cheat="money-reset"]').click();
    expect(await money(page)).toBe(0);
  });

  test('téléportation au sommet de la colline, pièce neuve, kit débridage', async ({ page }) => {
    await startGame(page);
    await openDev(page);
    await page.locator('[data-cheat="tp-hill-top"]').click();
    const top = await waitFor(page, (s) => s.player.grounded && s.player.y > 4.5);
    expect(top.player.z).toBeGreaterThan(80);

    const before = await page.evaluate(() => window.__50CC__!.looseParts().length);
    await page.locator('select[data-cheat="spawn-part"]').selectOption('silencer-racing');
    await page.locator('.debug__choice .hud-btn').click();
    await expect.poll(() => page.evaluate(() => window.__50CC__!.looseParts().length)).toBe(before + 1);

    await page.locator('[data-cheat="racing-kit"]').click();
    await waitFor(page, (s) => s.toast.includes('kit débridage'));
  });
});
