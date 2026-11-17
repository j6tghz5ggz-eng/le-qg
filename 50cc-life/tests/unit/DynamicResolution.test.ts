import { describe, expect, it } from 'vitest';
import { DynamicResolution } from '../../src/core/quality/DynamicResolution';

const TARGET = 1000 / 60;

function feed(dr: DynamicResolution, frameMs: number, frames: number): number {
  let scale = dr.scale;
  for (let i = 0; i < frames; i++) scale = dr.sample(frameMs);
  return scale;
}

describe('DynamicResolution', () => {
  it('démarre à l’échelle maximale', () => {
    const dr = new DynamicResolution({ targetFrameMs: TARGET, minScale: 0.6, maxScale: 1 });
    expect(dr.scale).toBe(1);
  });

  it('baisse la résolution quand le jeu rame, sans passer sous le minimum', () => {
    const dr = new DynamicResolution({ targetFrameMs: TARGET, minScale: 0.6, maxScale: 1, windowSize: 10 });
    expect(feed(dr, 30, 10)).toBe(0.9);
    expect(feed(dr, 30, 200)).toBe(0.6);
  });

  it('ne bouge pas quand le jeu tient la cadence', () => {
    const dr = new DynamicResolution({ targetFrameMs: TARGET, minScale: 0.6, maxScale: 1, windowSize: 10 });
    expect(feed(dr, TARGET, 500)).toBe(1);
  });

  it('ignore les à-coups isolés (médiane)', () => {
    const dr = new DynamicResolution({ targetFrameMs: TARGET, minScale: 0.6, maxScale: 1, windowSize: 10 });
    for (let i = 0; i < 10; i++) dr.sample(i === 3 ? 400 : TARGET);
    expect(dr.scale).toBe(1);
  });

  it('remonte après une période stable', () => {
    const dr = new DynamicResolution({
      targetFrameMs: TARGET,
      minScale: 0.6,
      maxScale: 1,
      windowSize: 10,
      upgradeAfterWindows: 3,
    });
    feed(dr, 30, 20); // 0.8
    expect(dr.scale).toBe(0.8);
    feed(dr, TARGET, 30); // 3 fenêtres stables → +0.1
    expect(dr.scale).toBe(0.9);
  });

  it('attend plus longtemps après une hausse ratée', () => {
    const dr = new DynamicResolution({
      targetFrameMs: TARGET,
      minScale: 0.5,
      maxScale: 1,
      windowSize: 10,
      upgradeAfterWindows: 2,
    });
    feed(dr, 30, 10); // 0.9
    feed(dr, TARGET, 20); // hausse → 1.0 (test)
    expect(dr.scale).toBe(1);
    feed(dr, 30, 10); // la hausse échoue → 0.9, attente doublée (4 fenêtres)
    expect(dr.scale).toBe(0.9);
    feed(dr, TARGET, 30); // 3 fenêtres : pas encore
    expect(dr.scale).toBe(0.9);
    feed(dr, TARGET, 10); // 4e fenêtre : nouvelle tentative
    expect(dr.scale).toBe(1);
  });

  it('ignore les valeurs invalides', () => {
    const dr = new DynamicResolution({ targetFrameMs: TARGET, minScale: 0.6, maxScale: 1, windowSize: 2 });
    dr.sample(Number.NaN);
    dr.sample(-5);
    dr.sample(0);
    expect(dr.scale).toBe(1);
  });

  it('période de chauffe : les à-coups du démarrage ne baissent pas la résolution', () => {
    const dr = new DynamicResolution({ targetFrameMs: TARGET, minScale: 0.6, maxScale: 1, windowSize: 10, warmupMs: 1000 });
    // 1 s d'images très lentes (compilation des shaders) : ignorées.
    for (let i = 0; i < 10; i++) dr.sample(100);
    expect(dr.scale).toBe(1);
    // Ensuite, la lenteur compte de nouveau.
    for (let i = 0; i < 10; i++) dr.sample(TARGET * 2);
    expect(dr.scale).toBeLessThan(1);
  });
});
