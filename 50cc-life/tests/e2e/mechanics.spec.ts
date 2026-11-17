import { expect, test } from '@playwright/test';
import { holdKeys, hooks, joystick, joystickIntoGarage, lookAtSlot, startGame, touchHold, waitFor, waitStill, walkIntoGarage } from './helpers';

test.describe('atelier au clavier', () => {
  test.skip(({ isMobile }) => isMobile, 'test clavier');

  test('démonter la bougie (maintenir E) empêche le moteur de démarrer', async ({ page }) => {
    await startGame(page);
    await walkIntoGarage(page);
    await holdKeys(page, ['KeyW'], (s) => s.player.z > 11.6);
    await lookAtSlot(page, 'sparkPlug');
    await waitFor(page, (s) => s.focus?.startsWith('Bougie') ?? false);
    await expect(page.locator('.prompt__hint')).toContainText('Démonter');

    await page.keyboard.down('KeyE');
    await waitFor(page, (s) => !s.bikeParts.includes('sparkPlug'), 5000);
    await page.keyboard.up('KeyE');
    const loose = await page.evaluate(() => window.__50CC__!.looseParts().length);
    expect(loose).toBe(5); // 4 pièces de rechange + la bougie démontée

    // La culasse ne se démonte qu'une fois la bougie retirée : c'est fait.
    // On regarde le sol à côté de la moto pour la viser « de proximité » et monter.
    await waitStill(page);
    await page.evaluate(() => window.__50CC__!.lookAt(0.2, 0.2, 13.4));
    await waitFor(page, (s) => s.focus === 'Supermotard 50');
    await page.keyboard.press('KeyE');
    await waitFor(page, (s) => s.vehicle !== null);
    await page.keyboard.press('KeyC');
    await waitFor(page, (s) => s.toast.includes('Bougie'));
    expect((await hooks(page)).vehicle?.running).toBe(false);
  });

  test('ordre de démontage : la culasse refuse tant que la bougie est montée', async ({ page }) => {
    await startGame(page);
    await walkIntoGarage(page);
    await holdKeys(page, ['KeyW'], (s) => s.player.z > 11.6);
    await lookAtSlot(page, 'head');
    await waitFor(page, (s) => s.focus === 'Culasse');
    await page.keyboard.down('KeyE');
    await expect(page.locator('.toast')).toContainText('Bougie');
    await page.keyboard.up('KeyE');
    expect((await hooks(page)).bikeParts).toContain('head');
  });
});

test.describe('atelier : cartouche', () => {
  test.skip(({ isMobile }) => isMobile, 'test clavier');

  test('la cartouche se vise et se démonte (elle ne se fait pas voler la visée par la moto)', async ({ page }) => {
    await startGame(page);
    // Côté droit de la moto (côté échappement), via l'onglet DEV.
    await page.locator('.debug__toggle').click();
    await page.locator('.debug__tab[data-tab="dev"]').click();
    await page.locator('[data-cheat="tp-bike-right"]').click();
    await page.locator('.debug__toggle').click();
    await waitFor(page, (s) => s.player.grounded && Math.abs(s.player.z - 12.9) < 0.3);
    await waitStill(page);
    await page.evaluate(() => {
      const h = window.__50CC__!;
      const s = h.slotPosition('silencer')!;
      h.lookAt(s.x, s.y + 0.05, s.z + 0.2);
    });
    await waitFor(page, (s) => s.focus?.startsWith('Cartouche') ?? false);
    await expect(page.locator('.prompt__hint')).toContainText('Démonter');
    await page.keyboard.down('KeyE');
    await waitFor(page, (s) => !s.bikeParts.includes('silencer'), 6000);
    await page.keyboard.up('KeyE');
    expect((await hooks(page)).bikeParts).toContain('exhaust');
  });
});

test.describe('atelier au tactile', () => {
  test.skip(({ isMobile }) => !isMobile, 'test tactile');

  test('remplacer la bougie usée par la neuve de l’établi', async ({ page }) => {
    await startGame(page);
    await joystickIntoGarage(page);
    await joystick(page, 0, -30, (s) => s.player.z > 11.6);

    // 1. Démonter la bougie usée (bouton maintenu).
    await lookAtSlot(page, 'sparkPlug');
    await waitFor(page, (s) => s.focus === "Bougie d'allumage (usée)");
    await touchHold(page, page.getByRole('button', { name: 'Démonter' }), 1600);
    await waitFor(page, (s) => !s.bikeParts.includes('sparkPlug'));

    // 2. Se tourner vers l'établi, avancer, prendre la bougie neuve.
    const spare = await page.evaluate(() => window.__50CC__!.looseParts().find((p) => p.name.startsWith('Bougie') && p.x < -3)!);
    const lookAtSpare = () => page.evaluate((p) => window.__50CC__!.lookAt(p.x, p.y, p.z), spare);
    await lookAtSpare();
    await joystick(page, 0, -45, (s) => Math.hypot(s.player.x - spare.x, s.player.z - spare.z) < 1.5);
    await waitStill(page);
    await lookAtSpare();
    await waitFor(page, (s) => s.focus === "Bougie d'allumage (neuve)");
    await page.getByRole('button', { name: 'Prendre' }).tap();
    await waitFor(page, (s) => s.holding);

    // 3. Se tourner vers la moto, avancer en portant la bougie, la remonter.
    const slot = await page.evaluate(() => window.__50CC__!.slotPosition('sparkPlug')!);
    await lookAtSlot(page, 'sparkPlug');
    await joystick(page, 0, -45, (s) => Math.hypot(s.player.x - slot.x, s.player.z - slot.z) < 1.4);
    await lookAtSlot(page, 'sparkPlug');
    await expect(page.getByRole('button', { name: 'Remonter' })).toBeVisible();
    await touchHold(page, page.getByRole('button', { name: 'Remonter' }), 1400);
    const done = await waitFor(page, (s) => s.bikeParts.includes('sparkPlug'));
    expect(done.holding).toBe(false);
  });
});
