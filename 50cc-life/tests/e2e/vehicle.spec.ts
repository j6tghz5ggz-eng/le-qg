import { expect, test, type Page } from '@playwright/test';
import type { DebugHooks } from '../../src/debug/debugHooks';

async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__50CC__?.state === 'playing', null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__50CC__!.player.grounded, null, { timeout: 10_000 });
}

const hooks = (page: Page) =>
  page.evaluate(() => {
    const h = window.__50CC__!;
    return { player: h.player, focus: h.focus, vehicle: h.vehicle };
  }) as Promise<Pick<DebugHooks, 'player' | 'focus' | 'vehicle'>>;

type State = Awaited<ReturnType<typeof hooks>>;

/** Interroge l'état jusqu'à ce que la condition soit vraie. */
async function waitFor(page: Page, done: (s: State) => boolean, timeout = 15_000): Promise<State> {
  const start = Date.now();
  for (;;) {
    const s = await hooks(page);
    if (done(s)) return s;
    if (Date.now() - start > timeout) throw new Error(`Condition non atteinte : ${JSON.stringify(s)}`);
    await page.waitForTimeout(50);
  }
}

async function holdKeys(page: Page, keys: string[], done: (s: State) => boolean, timeout?: number): Promise<State> {
  for (const k of keys) await page.keyboard.down(k);
  try {
    return await waitFor(page, done, timeout);
  } finally {
    for (const k of keys) await page.keyboard.up(k);
  }
}

test.describe('cyclomoteur au clavier', () => {
  test.skip(({ isMobile }) => isMobile, 'test clavier');

  test('monter, accélérer, tourner, freiner, descendre', async ({ page }) => {
    await startGame(page);
    // S'approcher : la moto est garée à gauche du joueur.
    await holdKeys(page, ['KeyA'], (s) => s.focus === 'Cyclomoteur');
    await expect(page.locator('.prompt__hint')).toContainText('Monter');
    await page.keyboard.press('KeyE');
    await waitFor(page, (s) => s.vehicle !== null);
    await expect(page.locator('.dash')).toBeVisible();

    const fast = await holdKeys(page, ['KeyW'], (s) => (s.vehicle?.speedKmh ?? 0) > 15);
    expect(fast.vehicle!.wheelsOnGround).toBe(2);

    // Virage à droite : le cap tourne et la moto penche dans le virage.
    await page.keyboard.down('KeyW');
    const turning = await holdKeys(page, ['KeyD'], (s) => Math.abs(s.vehicle!.heading - fast.vehicle!.heading) > 0.5);
    await page.keyboard.up('KeyW');
    expect(turning.vehicle!.lean).toBeGreaterThan(5);
    expect(turning.vehicle!.wheelsOnGround).toBe(2);

    await holdKeys(page, ['KeyS'], (s) => (s.vehicle?.speedKmh ?? 99) < 2);
    await page.keyboard.press('KeyE');
    const off = await waitFor(page, (s) => s.vehicle === null);
    expect(off.player.y).toBeLessThan(0.3);
    await expect(page.locator('.dash')).toBeHidden();
  });

  test('impossible de descendre en roulant vite', async ({ page }) => {
    await startGame(page);
    await holdKeys(page, ['KeyA'], (s) => s.focus === 'Cyclomoteur');
    await page.keyboard.press('KeyE');
    await waitFor(page, (s) => s.vehicle !== null);
    await page.keyboard.down('KeyW');
    await waitFor(page, (s) => (s.vehicle?.speedKmh ?? 0) > 20);
    await page.keyboard.press('KeyE');
    await expect(page.locator('.toast')).toContainText('Ralentissez');
    await page.keyboard.up('KeyW');
    expect((await hooks(page)).vehicle).not.toBeNull();
  });
});

test.describe('cyclomoteur au tactile', () => {
  test.skip(({ isMobile }) => !isMobile, 'test tactile');

  /** Pouce posé sur le joystick, glissé de `dx, dy` pixels, maintenu jusqu'à la condition. */
  async function joystick(page: Page, dx: number, dy: number, done: (s: State) => boolean): Promise<State> {
    const cdp = await page.context().newCDPSession(page);
    const size = page.viewportSize()!;
    const x = size.width * 0.2;
    const y = size.height * 0.75;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 5; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 5, y: y + (dy * i) / 5, id: 1 }] });
    }
    try {
      return await waitFor(page, done);
    } finally {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    }
  }

  test('joystick pour marcher, bouton Monter, gaz au joystick, Descendre', async ({ page }) => {
    await startGame(page);
    const start = (await hooks(page)).player;
    // Joystick vers la gauche : le joueur se décale jusqu'à la moto.
    const near = await joystick(page, -50, 0, (s) => s.focus === 'Cyclomoteur');
    expect(near.player.x).toBeLessThan(start.x - 0.3);

    await page.getByRole('button', { name: 'Monter' }).tap();
    await waitFor(page, (s) => s.vehicle !== null);
    await expect(page.getByRole('button', { name: 'Descendre' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sauter' })).toBeHidden();

    // Joystick vers le haut = gaz, vers le bas = frein.
    await joystick(page, 0, -55, (s) => (s.vehicle?.speedKmh ?? 0) > 8);
    await joystick(page, 0, 55, (s) => (s.vehicle?.speedKmh ?? 99) < 2);

    await page.getByRole('button', { name: 'Descendre' }).tap();
    await waitFor(page, (s) => s.vehicle === null);
    await expect(page.getByRole('button', { name: 'Sauter' })).toBeVisible();
  });
});
