import { expect, test, type Page } from '@playwright/test';
import { startGame, waitFor } from './helpers';

const money = (page: Page): Promise<number> => page.evaluate(() => window.__50CC__!.money);
const looseCount = (page: Page): Promise<number> => page.evaluate(() => window.__50CC__!.looseParts().length);

/** Triches utiles : livraison instantanée, téléportation devant l'ordinateur. Panneau refermé ensuite. */
async function goToComputer(page: Page): Promise<void> {
  await page.locator('.debug__toggle').click();
  await page.locator('.debug__tab[data-tab="dev"]').click();
  await page.locator('[data-cheat="instant-delivery"]').check();
  await page.locator('[data-cheat="tp-computer"]').click();
  await page.locator('.debug__toggle').click();
  await waitFor(page, (s) => s.player.grounded && Math.abs(s.player.x - 2.5) < 0.3);
  await page.evaluate(() => window.__50CC__!.lookAt(3.45, 1.0, 11.3));
  await waitFor(page, (s) => s.focus === 'Ordinateur');
}

async function openShop(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) await page.getByRole('button', { name: 'Ouvrir la boutique' }).tap();
  else await page.keyboard.press('KeyE');
  await expect(page.locator('.shop')).toBeVisible();
}

test.describe('boutique et sauvegarde', () => {
  test('acheter une bougie (livrée au garage), puis revendre une pièce', async ({ page, isMobile }) => {
    await startGame(page);
    await goToComputer(page);
    const before = await looseCount(page);
    await openShop(page, isMobile);
    await expect(page.locator('.shop__balance')).toHaveText(/500\s€/);

    await page.locator('[data-buy="plug-std"]').click();
    expect(await money(page)).toBe(494);
    await expect.poll(() => looseCount(page)).toBe(before + 1);

    await page.locator('.shop__tab[data-tab="sell"]').click();
    const sell = page.locator('[data-sell]').first();
    await sell.click();
    await expect.poll(() => money(page)).toBeGreaterThan(494);
    expect(await looseCount(page)).toBe(before);

    await page.locator('.shop__close').click();
    await expect(page.locator('.shop')).toBeHidden();
    expect(await page.evaluate(() => window.__50CC__!.shopOpen)).toBe(false);
  });

  test('la partie est sauvegardée : argent et pièces retrouvés après rechargement', async ({ page, isMobile }) => {
    await startGame(page);
    await goToComputer(page);
    await openShop(page, isMobile);
    await page.locator('[data-buy="cdi-free"]').click();
    await expect.poll(() => looseCount(page)).toBe(5);
    await page.locator('.shop__close').click();

    await page.locator('.debug__toggle').click();
    await page.locator('[data-cheat="save-now"]').click();
    await page.reload();
    await startGame(page);
    expect(await money(page)).toBe(445);
    expect(await looseCount(page)).toBe(5);
    await expect(page.locator('.money__amount')).toHaveText(/445\s€/);
  });
});
