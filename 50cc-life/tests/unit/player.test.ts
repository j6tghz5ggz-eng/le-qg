import { describe, expect, it } from 'vitest';
import { stepAlpha } from '../../src/core/loop/stepAlpha';
import { CARRY, canCarry, carryVelocity, isUnderFeet, throwSpeed } from '../../src/player/interaction/carry';
import {
  PLAYER,
  clampPitch,
  groundSpeed,
  jumpVelocity,
  lookDirection,
  moveDirection,
  nextMoveState,
  smoothTowards,
  stepUpHeight,
} from '../../src/player/movement';

const v = () => ({ x: 0, y: 0, z: 0 });

describe('déplacement', () => {
  it('avancer avec yaw = 0 va vers +z, à droite vers +x', () => {
    const forward = moveDirection(0, 1, 0, v());
    expect(forward.z).toBeCloseTo(1);
    expect(forward.x).toBeCloseTo(0);
    const right = moveDirection(1, 0, 0, v());
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  it('après un quart de tour à droite, avancer va vers +x', () => {
    const forward = moveDirection(0, 1, Math.PI / 2, v());
    expect(forward.x).toBeCloseTo(1);
    expect(forward.z).toBeCloseTo(0);
    const right = moveDirection(1, 0, Math.PI / 2, v());
    expect(right.z).toBeCloseTo(-1);
  });

  it('le regard vers le bas donne une composante y négative', () => {
    const dir = lookDirection(0, 0.5, v());
    expect(dir.y).toBeLessThan(0);
    expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1);
  });

  it('le regard est limité à ±89°', () => {
    expect(clampPitch(10)).toBeCloseTo(PLAYER.pitchLimit);
    expect(clampPitch(-10)).toBeCloseTo(-PLAYER.pitchLimit);
    expect(clampPitch(0.2)).toBe(0.2);
  });

  it('vitesses : accroupi < marche < course', () => {
    const crouch = groundSpeed({ sprint: true, crouched: true });
    const walk = groundSpeed({ sprint: false, crouched: false });
    const run = groundSpeed({ sprint: true, crouched: false });
    expect(crouch).toBeLessThan(walk);
    expect(walk).toBeLessThan(run);
  });

  it('vitesse de saut : v = √(2gh)', () => {
    expect(jumpVelocity(-9.81, 0.7)).toBeCloseTo(Math.sqrt(2 * 9.81 * 0.7));
  });

  it('lissage indépendant de la fréquence d’images', () => {
    let a = 0;
    for (let i = 0; i < 2; i++) a = smoothTowards(a, 1, 10, 1 / 30);
    let b = 0;
    for (let i = 0; i < 4; i++) b = smoothTowards(b, 1, 10, 1 / 60);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('aide à la montée de marche', () => {
  it('accepte une marche plate entre 2 cm et la hauteur max', () => {
    expect(stepUpHeight(0, 0.15, 1, 0.35)).toBeCloseTo(0.15);
    expect(stepUpHeight(0.15, 0.4, 0.99, 0.35)).toBeCloseTo(0.25);
  });
  it('refuse trop haut, trop bas ou incliné', () => {
    expect(stepUpHeight(0, 0.5, 1, 0.35)).toBeNull();
    expect(stepUpHeight(0, 0.01, 1, 0.35)).toBeNull();
    expect(stepUpHeight(0, -0.2, 1, 0.35)).toBeNull();
    expect(stepUpHeight(0, 0.15, 0.6, 0.35)).toBeNull();
  });
});

describe('états du joueur', () => {
  it('saut : au sol → départ du saut → en l’air → au sol', () => {
    expect(nextMoveState('onGround', true, true, 0)).toBe('startJump');
    expect(nextMoveState('startJump', true, false, 3)).toBe('inAir');
    expect(nextMoveState('inAir', true, false, 2.5)).toBe('inAir'); // encore en montée
    expect(nextMoveState('inAir', true, false, -1)).toBe('onGround');
  });

  it('quitter un rebord fait passer en l’air', () => {
    expect(nextMoveState('onGround', false, false, 0)).toBe('inAir');
    expect(nextMoveState('onGround', false, true, 0)).toBe('inAir');
  });
});

describe('porter et lancer', () => {
  it('l’objet est attiré vers le point de maintien, vitesse limitée', () => {
    const vel = carryVelocity({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0.5 }, 14, 12, v());
    expect(vel.z).toBeCloseTo(7);
    const far = carryVelocity({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, 14, 12, v());
    expect(Math.hypot(far.x, far.y, far.z)).toBeCloseTo(12);
  });

  it('un objet léger part plus vite qu’un lourd, dans les limites', () => {
    expect(throwSpeed(4)).toBe(CARRY.maxThrowSpeed);
    expect(throwSpeed(12)).toBeCloseTo(CARRY.throwImpulse / 12);
    expect(throwSpeed(39)).toBeGreaterThanOrEqual(CARRY.minThrowSpeed);
    expect(throwSpeed(12)).toBeGreaterThan(throwSpeed(30));
  });

  it('limite de poids', () => {
    expect(canCarry(12)).toBe(true);
    expect(canCarry(CARRY.maxMass + 1)).toBe(false);
  });

  it('détecte un objet sous les pieds (anti « auto-levage »)', () => {
    const foot = { x: 0, y: 1, z: 0 };
    expect(isUnderFeet({ x: 0.2, y: 0.9, z: 0 }, foot, 0.3)).toBe(true);
    expect(isUnderFeet({ x: 1.5, y: 0.9, z: 0 }, foot, 0.3)).toBe(false);
    expect(isUnderFeet({ x: 0.2, y: 2, z: 0 }, foot, 0.3)).toBe(false);
  });
});

describe('interpolation entre deux pas', () => {
  it('alpha suit le temps restant, borné entre 0 et 1', () => {
    expect(stepAlpha(8, 16)).toBeCloseTo(0.5);
    expect(stepAlpha(0, 16)).toBe(0);
    expect(stepAlpha(40, 16)).toBe(1);
    expect(stepAlpha(Number.NaN, 16)).toBe(1);
  });
});
