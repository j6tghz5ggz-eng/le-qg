import { expect, test } from '@playwright/test';
import type {} from '../../src/debug/debugHooks';

test.describe('démarrage du jeu', () => {
  test('la scène se charge, la physique tourne et aucune erreur ne survient', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`.trim());
    });

    await page.goto('/');
    await page.waitForFunction(() => window.__50CC__?.state === 'playing', null, { timeout: 60_000 });

    const before = await page.evaluate(() => ({
      step: window.__50CC__!.stepId,
      y: window.__50CC__!.probeY(),
    }));
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({
      step: window.__50CC__!.stepId,
      y: window.__50CC__!.probeY(),
    }));

    // La simulation avance…
    expect(after.step).toBeGreaterThan(before.step);
    // …et la gravité Havok fait tomber la caisse témoin.
    expect(before.y).not.toBeNull();
    expect(after.y!).toBeLessThan(before.y!);

    const box = await page.locator('#game-canvas').boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);
    await expect(page.locator('.loading')).toHaveCount(0);
    await expect(page.locator('.fatal')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('le bouton « Lâcher une caisse » ajoute un objet physique', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__50CC__?.state === 'playing', null, { timeout: 60_000 });
    const count = await page.evaluate(() => window.__50CC__!.crateCount);
    await page.locator('.debug__toggle').click();
    // Le bouton est dans l'onglet DEV (triches), groupe « Monde ».
    await page.locator('.debug__tab[data-tab="dev"]').click();
    await page.getByRole('button', { name: /Lâcher une caisse/ }).click();
    await expect.poll(() => page.evaluate(() => window.__50CC__!.crateCount)).toBe(count + 1);
  });
});
