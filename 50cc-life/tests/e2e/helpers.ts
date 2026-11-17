/**
 * Outils communs aux tests navigateur. Les déplacements sont pilotés par la
 * position (et non par le temps) pour ne pas dépendre de la vitesse de la
 * machine.
 */
import type { Locator, Page } from '@playwright/test';
import type { DebugHooks } from '../../src/debug/debugHooks';

export async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__50CC__?.state === 'playing', null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__50CC__!.player.grounded, null, { timeout: 10_000 });
}

export type State = Pick<DebugHooks, 'player' | 'focus' | 'vehicle' | 'holding' | 'bikeParts' | 'parkedBike'> & { toast: string };

export const hooks = (page: Page): Promise<State> =>
  page.evaluate(() => {
    const h = window.__50CC__!;
    return {
      player: h.player,
      focus: h.focus,
      vehicle: h.vehicle,
      holding: h.holding,
      bikeParts: h.bikeParts,
      parkedBike: h.parkedBike,
      toast: document.querySelector('.toast')?.textContent ?? '',
    };
  });

export async function waitFor(page: Page, done: (s: State) => boolean, timeout = 15_000): Promise<State> {
  const start = Date.now();
  for (;;) {
    const s = await hooks(page);
    if (done(s)) return s;
    if (Date.now() - start > timeout) throw new Error(`Condition non atteinte : ${JSON.stringify(s)}`);
    await page.waitForTimeout(50);
  }
}

export async function holdKeys(page: Page, keys: string[], done: (s: State) => boolean, timeout?: number): Promise<State> {
  for (const k of keys) await page.keyboard.down(k);
  try {
    return await waitFor(page, done, timeout);
  } finally {
    for (const k of keys) await page.keyboard.up(k);
  }
}

/** Au clavier : du point de départ jusque dans le garage, juste à gauche de la moto. */
export async function walkIntoGarage(page: Page): Promise<void> {
  await holdKeys(page, ['KeyD'], (s) => s.player.x > 2.3);
  await holdKeys(page, ['KeyW'], (s) => s.player.z > 6.5);
  await holdKeys(page, ['KeyA'], (s) => s.player.x < -0.5);
  await holdKeys(page, ['KeyW'], (s) => s.player.z > 10.6);
  // Se rapprocher du flanc gauche de la moto (garée en x ≈ 0,95).
  if ((await hooks(page)).player.x < -0.7) await holdKeys(page, ['KeyD'], (s) => s.player.x > -0.7);
}

/** Pouce posé sur le joystick, glissé de (dx, dy) px, maintenu jusqu'à la condition. */
export async function joystick(page: Page, dx: number, dy: number, done: (s: State) => boolean, timeout?: number): Promise<State> {
  const cdp = await page.context().newCDPSession(page);
  const size = page.viewportSize()!;
  const x = size.width * 0.2;
  const y = size.height * 0.75;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 5, y: y + (dy * i) / 5, id: 1 }] });
  }
  try {
    return await waitFor(page, done, timeout);
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}

/** Au tactile : du point de départ jusque dans le garage, juste à gauche de la moto. */
export async function joystickIntoGarage(page: Page): Promise<void> {
  await joystick(page, 55, 0, (s) => s.player.x > 2.3);
  await joystick(page, 0, -55, (s) => s.player.z > 6.5);
  // Déplacements latéraux plus doux (pouce moins enfoncé) : moins de dépassement.
  await joystick(page, -30, 0, (s) => s.player.x < -0.4);
  await joystick(page, 0, -55, (s) => s.player.z > 10.6);
  if ((await hooks(page)).player.x < -0.8) await joystick(page, 30, 0, (s) => s.player.x > -0.8);
}

/** Doigt maintenu sur un bouton (action « à maintenir »). */
export async function touchHold(page: Page, button: Locator, ms: number): Promise<void> {
  const box = await button.boundingBox();
  if (!box) throw new Error('Bouton invisible');
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Attend que le joueur soit immobile (sinon la visée dérive). */
export async function waitStill(page: Page): Promise<void> {
  let last = await hooks(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(80);
    const now = await hooks(page);
    if (Math.hypot(now.player.x - last.player.x, now.player.z - last.player.z) < 0.003) return;
    last = now;
  }
}

/** Oriente le regard vers un emplacement de pièce de la moto (joueur immobile). */
export async function lookAtSlot(page: Page, slot: string): Promise<void> {
  await waitStill(page);
  await page.evaluate((s) => {
    const h = window.__50CC__!;
    const p = h.slotPosition(s)!;
    h.lookAt(p.x, p.y, p.z);
  }, slot);
}
