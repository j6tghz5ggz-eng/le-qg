import { describe, expect, it } from 'vitest';
import { ActionState, PRESS_BUFFER_MS } from '../../src/core/input/ActionState';
import { clampToRadius, radialDeadZone, responseCurve, stickFromDrag } from '../../src/core/input/stick';

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('ActionState — boutons', () => {
  it('un appui est consommé une seule fois', () => {
    const state = new ActionState(clock().now);
    state.setButton('jump', 'kb:Space', true);
    expect(state.consumePress('jump')).toBe(true);
    expect(state.consumePress('jump')).toBe(false);
    expect(state.isHeld('jump')).toBe(true);
  });

  it('un appui bref (appuyé puis relâché avant consommation) n’est pas perdu', () => {
    const state = new ActionState(clock().now);
    state.setButton('jump', 'kb:Space', true);
    state.setButton('jump', 'kb:Space', false);
    expect(state.isHeld('jump')).toBe(false);
    expect(state.consumePress('jump')).toBe(true);
  });

  it('un appui trop ancien expire', () => {
    const c = clock();
    const state = new ActionState(c.now);
    state.setButton('jump', 'kb:Space', true);
    c.advance(PRESS_BUFFER_MS + 1);
    expect(state.consumePress('jump')).toBe(false);
  });

  it('deux sources sur la même action : tenue tant qu’une la tient, un seul appui', () => {
    const state = new ActionState(clock().now);
    state.setButton('grab', 'mouse:left', true);
    state.setButton('grab', 'pad:2', true);
    expect(state.consumePress('grab')).toBe(true);
    expect(state.consumePress('grab')).toBe(false);
    state.setButton('grab', 'mouse:left', false);
    expect(state.isHeld('grab')).toBe(true);
    state.setButton('grab', 'pad:2', false);
    expect(state.isHeld('grab')).toBe(false);
  });

  it('releaseSource et releaseAll relâchent tout', () => {
    const state = new ActionState(clock().now);
    state.setButton('sprint', 'pad:10', true);
    state.setMove('pad', 0.5, 0.5);
    state.releaseSource('pad:10');
    state.releaseSource('pad');
    expect(state.isHeld('sprint')).toBe(false);
    expect(state.getMove()).toEqual({ x: 0, y: 0 });
    state.setButton('jump', 'kb:Space', true);
    state.addLook(1, 1);
    state.releaseAll();
    expect(state.isHeld('jump')).toBe(false);
    expect(state.consumePress('jump')).toBe(false);
    expect(state.consumeLook()).toEqual({ x: 0, y: 0 });
  });
});

describe('ActionState — déplacement et regard', () => {
  it('combine les sources et limite la longueur à 1', () => {
    const state = new ActionState(clock().now);
    state.setMove('kb', 0, 1);
    state.setMove('touch', 1, 0);
    const move = state.getMove();
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(1);
    expect(move.x).toBeCloseTo(Math.SQRT1_2);
  });

  it('accumule le regard jusqu’à consommation', () => {
    const state = new ActionState(clock().now);
    state.addLook(0.1, -0.05);
    state.addLook(0.2, 0.01);
    const look = state.consumeLook();
    expect(look.x).toBeCloseTo(0.3);
    expect(look.y).toBeCloseTo(-0.04);
    expect(state.consumeLook()).toEqual({ x: 0, y: 0 });
  });
});

describe('sticks', () => {
  it('zone morte : rien sous le seuil, progressif au-delà, 1 au bord', () => {
    expect(radialDeadZone(0.1, 0, 0.18)).toEqual({ x: 0, y: 0 });
    expect(radialDeadZone(0.59, 0, 0.18).x).toBeCloseTo(0.5, 2);
    expect(radialDeadZone(1, 0, 0.18).x).toBeCloseTo(1);
    expect(radialDeadZone(2, 0, 0.18).x).toBeCloseTo(1);
  });

  it('joystick tactile : glisser vers le haut de l’écran = avancer', () => {
    const stick = stickFromDrag(0, -56, 56, 0.12);
    expect(stick.y).toBeCloseTo(1);
    expect(stick.x).toBeCloseTo(0);
    expect(stick.magnitude).toBeCloseTo(1);
  });

  it('le bouton du joystick reste dans son cercle', () => {
    const knob = clampToRadius(100, 0, 56);
    expect(knob).toEqual({ x: 56, y: 0 });
    expect(clampToRadius(10, 10, 56)).toEqual({ x: 10, y: 10 });
  });

  it('courbe de réponse : précise au centre, conserve le signe', () => {
    expect(responseCurve(0.5)).toBeCloseTo(0.25);
    expect(responseCurve(-0.5)).toBeCloseTo(-0.25);
    expect(responseCurve(1)).toBe(1);
  });
});
