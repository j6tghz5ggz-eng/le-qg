import { expect, test, type Page } from '@playwright/test';
import { startGame, waitFor } from './helpers';

async function openDev(page: Page): Promise<void> {
  await page.locator('.debug__toggle').click();
  await page.locator('.debug__tab[data-tab="dev"]').click();
}

test.describe('essence et usure', () => {
  test.skip(({ isMobile }) => isMobile, 'test clavier');

  test('les niveaux s’affichent en visant la moto ; réservoir vide = panne sèche, plein = démarre', async ({ page }) => {
    await startGame(page);
    await openDev(page);
    await page.locator('[data-cheat="tp-garage"]').click();
    await page.locator('.debug__toggle').click();
    await waitFor(page, (s) => s.player.grounded && s.player.z > 10.5);
    await page.evaluate(() => window.__50CC__!.lookAt(0.95, 0.5, 11.7));
    await waitFor(page, (s) => s.focus === 'Supermotard 50');
    // Graissage séparé : essence et huile affichées.
    await expect(page.locator('.prompt__hint')).toContainText('Essence');
    await expect(page.locator('.prompt__hint')).toContainText('Huile');

    await page.locator('.debug__toggle').click();
    await page.locator('[data-cheat="fuel-empty"]').click();
    await page.locator('.debug__toggle').click();
    await page.keyboard.press('KeyE');
    await waitFor(page, (s) => s.vehicle !== null);
    await page.keyboard.press('KeyC');
    await waitFor(page, (s) => s.toast.includes('Panne sèche'));
    expect((await page.evaluate(() => window.__50CC__!.vehicle))?.running).toBe(false);

    await page.locator('.debug__toggle').click();
    await page.locator('[data-cheat="fuel-fill"]').click();
    await page.locator('.debug__toggle').click();
    for (let i = 0; i < 12 && !(await page.evaluate(() => window.__50CC__!.vehicle?.running)); i++) {
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(250);
    }
    expect((await page.evaluate(() => window.__50CC__!.vehicle))?.running).toBe(true);
  });

  test('moteur serré : il ne redémarre plus, et le piston est signalé « serré »', async ({ page }) => {
    await startGame(page);
    await openDev(page);
    await page.locator('[data-cheat="seize-engine"]').click();
    await waitFor(page, (s) => s.toast.includes('serré'));
    await page.locator('[data-cheat="tp-garage"]').click();
    await page.locator('.debug__toggle').click();
    await waitFor(page, (s) => s.player.grounded && s.player.z > 10.5);
    await page.evaluate(() => window.__50CC__!.lookAt(0.95, 0.5, 11.7));
    await waitFor(page, (s) => s.focus === 'Supermotard 50');
    await page.keyboard.press('KeyE');
    await waitFor(page, (s) => s.vehicle !== null);
    await page.keyboard.press('KeyC');
    await waitFor(page, (s) => s.toast.includes('Piston (serré)'));
  });
});
