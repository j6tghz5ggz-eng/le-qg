import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events/EventBus';

interface TestEvents {
  sold: { partId: string; price: number };
  tick: number;
}

describe('EventBus', () => {
  it('transmet la charge utile aux abonnés', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('sold', handler);
    bus.emit('sold', { partId: 'piston-40', price: 25 });
    expect(handler).toHaveBeenCalledWith({ partId: 'piston-40', price: 25 });
  });

  it('se désabonne avec la fonction retournée', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('tick', handler);
    off();
    bus.emit('tick', 1);
    expect(handler).not.toHaveBeenCalled();
    expect(bus.listenerCount('tick')).toBe(0);
  });

  it('once() ne déclenche qu’une fois', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.once('tick', handler);
    bus.emit('tick', 1);
    bus.emit('tick', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('une erreur dans un gestionnaire n’empêche pas les autres', () => {
    const bus = new EventBus<TestEvents>();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();
    bus.on('tick', () => {
      throw new Error('boom');
    });
    bus.on('tick', second);
    bus.emit('tick', 3);
    expect(second).toHaveBeenCalledWith(3);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('un gestionnaire peut se désabonner pendant l’émission', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const offA = bus.on('tick', () => {
      calls.push('a');
      offA();
    });
    bus.on('tick', () => calls.push('b'));
    bus.emit('tick', 1);
    bus.emit('tick', 2);
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
