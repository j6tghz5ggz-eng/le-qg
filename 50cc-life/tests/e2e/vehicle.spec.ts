import { expect, test } from '@playwright/test';
import { holdKeys, hooks, joystick, joystickIntoGarage, startGame, waitFor, walkIntoGarage } from './helpers';

test.describe('supermotard au clavier (boîte manuelle)', () => {
  test.skip(({ isMobile }) => isMobile, 'test clavier');

  async function mountBike(page: import('@playwright/test').Page): Promise<void> {
    await startGame(page);
    await walkIntoGarage(page);
    await holdKeys(page, ['KeyW'], (s) => s.focus === 'Supermotard 50');
    await page.keyboard.press('KeyE');
    await waitFor(page, (s) => s.vehicle !== null);
    await expect(page.locator('.dash')).toBeVisible();
  }

  async function kickUntilRunning(page: import('@playwright/test').Page): Promise<void> {
    for (let i = 0; i < 12 && !(await hooks(page)).vehicle?.running; i++) {
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(200);
    }
    expect((await hooks(page)).vehicle?.running).toBe(true);
  }

  test('kick, embrayage, 1re, démarrage, 2e, freinage, descente', async ({ page }) => {
    await mountBike(page);
    expect((await hooks(page)).vehicle?.gear).toBe('N');
    await kickUntilRunning(page);

    // Embrayage tiré, 1re, on monte dans les tours puis on relâche l'embrayage.
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.press('KeyR');
    await waitFor(page, (s) => s.vehicle?.gear === '1');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    await page.keyboard.up('ShiftLeft');
    const rolling = await waitFor(page, (s) => (s.vehicle?.speedKmh ?? 0) > 8);
    expect(rolling.vehicle!.running).toBe(true);

    await page.keyboard.down('ShiftLeft');
    await page.keyboard.press('KeyR');
    await page.keyboard.up('ShiftLeft');
    await waitFor(page, (s) => s.vehicle?.gear === '2');
    await page.keyboard.up('KeyW');

    await holdKeys(page, ['KeyS', 'ShiftLeft'], (s) => (s.vehicle?.speedKmh ?? 99) < 2);
    await page.keyboard.press('KeyE');
    await waitFor(page, (s) => s.vehicle === null);
    await expect(page.locator('.dash')).toBeHidden();
  });

  test('lâcher l’embrayage sans gaz en 1re fait caler', async ({ page }) => {
    await mountBike(page);
    await kickUntilRunning(page);
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.press('KeyR');
    await waitFor(page, (s) => s.vehicle?.gear === '1');
    await page.keyboard.up('ShiftLeft');
    await waitFor(page, (s) => s.vehicle?.running === false, 5000);
    await expect(page.locator('.toast')).toContainText('calé');
  });

  test('passer une vitesse sans embrayer est refusé', async ({ page }) => {
    await mountBike(page);
    await page.keyboard.press('KeyR');
    await expect(page.locator('.toast')).toContainText('embrayage');
    expect((await hooks(page)).vehicle?.gear).toBe('N');
  });
});

test.describe('supermotard au tactile (embrayage automatique)', () => {
  test.skip(({ isMobile }) => !isMobile, 'test tactile');

  test('joystick jusqu’au garage, Monter, Démarrer, +, gaz au joystick, Descendre', async ({ page }) => {
    await startGame(page);
    await joystickIntoGarage(page);
    await joystick(page, 0, -55, (s) => s.focus === 'Supermotard 50');
    await page.getByRole('button', { name: 'Monter' }).tap();
    await waitFor(page, (s) => s.vehicle !== null);
    await expect(page.getByRole('button', { name: 'Embrayage' })).toBeHidden(); // embrayage auto sur tactile

    for (let i = 0; i < 12 && !(await hooks(page)).vehicle?.running; i++) {
      await page.getByRole('button', { name: 'Démarrer' }).tap();
      await page.waitForTimeout(200);
    }
    expect((await hooks(page)).vehicle?.running).toBe(true);
    await page.getByRole('button', { name: 'Vitesse supérieure' }).tap();
    await waitFor(page, (s) => s.vehicle?.gear === '1');

    await joystick(page, 0, -55, (s) => (s.vehicle?.speedKmh ?? 0) > 6);
    await joystick(page, 0, 55, (s) => (s.vehicle?.speedKmh ?? 99) < 2);
    await page.getByRole('button', { name: 'Descendre' }).tap();
    await waitFor(page, (s) => s.vehicle === null);
  });
});
