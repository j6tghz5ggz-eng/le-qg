/**
 * Clavier + souris.
 *
 * - Les touches sont lues par leur POSITION physique (`event.code`) : la
 *   touche « KeyW » est le Z d'un clavier AZERTY. ZQSD fonctionne donc en
 *   France et WASD ailleurs, sans réglage.
 * - La souris est capturée (Pointer Lock) au premier clic : le curseur
 *   disparaît et ses mouvements tournent la caméra. Échap la libère.
 * - Si la capture est refusée (certaines fenêtres intégrées), repli :
 *   regarder en maintenant le clic droit.
 * - Une touche peut servir à pied ET en moto (ex. Maj = courir / embrayage) :
 *   c'est le contexte (marche ou conduite) qui lit l'une ou l'autre action.
 * - En moto, la molette passe les vitesses.
 */
import type { ActionState } from '../ActionState';
import type { ButtonAction } from '../actions';

const KEY_ACTIONS: Readonly<Record<string, readonly ButtonAction[]>> = {
  Space: ['jump', 'rearBrake'],
  ShiftLeft: ['sprint', 'clutch'],
  ShiftRight: ['sprint', 'clutch'],
  KeyC: ['crouch', 'engine'],
  KeyE: ['use'],
  KeyF: ['throw', 'gearDown'],
  KeyR: ['gearUp'],
};
/** Délai minimal entre deux crans de molette pris en compte (pavés tactiles très sensibles). */
const WHEEL_COOLDOWN_MS = 150;

const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
} as const;

const GAME_KEYS = new Set<string>([...Object.keys(KEY_ACTIONS), ...Object.values(MOVE_KEYS).flat()]);

/** Radians par pixel de souris. */
export const DEFAULT_MOUSE_SENSITIVITY = 0.0022;
/** Certains navigateurs envoient un énorme saut au moment de la capture. */
const MAX_MOUSE_DELTA = 250;

export interface KeyboardMouseCallbacks {
  onActivity(): void;
  onPointerLockChange(locked: boolean): void;
}

export class KeyboardMouseDevice {
  sensitivity = DEFAULT_MOUSE_SENSITIVITY;
  invertY = false;
  private readonly keys = new Set<string>();
  private _locked = false;
  private _lockUnavailable = false;
  private buttons = 0;
  /** Ignore le clic qui a servi à capturer la souris. */
  private ignoreButtonsUntilRelease = false;
  private lastWheel = 0;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: ActionState,
    private readonly callbacks: KeyboardMouseCallbacks,
  ) {
    const opts = { signal: this.abort.signal };
    window.addEventListener('keydown', this.onKeyDown, opts);
    window.addEventListener('keyup', this.onKeyUp, opts);
    window.addEventListener('blur', () => this.releaseAll(), opts);
    canvas.addEventListener('pointerdown', this.onPointerDown, opts);
    document.addEventListener('pointermove', this.onPointerMove, opts);
    document.addEventListener('pointerup', this.onPointerButtons, opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    canvas.addEventListener('wheel', this.onWheel, { ...opts, passive: false });
    document.addEventListener('pointerlockchange', this.onLockChange, opts);
    document.addEventListener('pointerlockerror', () => (this._lockUnavailable = true), opts);
  }

  /** Souris capturée (regard libre). */
  get locked(): boolean {
    return this._locked;
  }

  /** Capture refusée par le navigateur : mode « clic droit pour regarder ». */
  get lockUnavailable(): boolean {
    return this._lockUnavailable;
  }

  requestLock(): void {
    if (this._locked || this._lockUnavailable) return;
    const fallback = (): void => {
      try {
        const retry = this.canvas.requestPointerLock() as Promise<void> | undefined;
        retry?.catch?.(() => (this._lockUnavailable = true));
      } catch {
        this._lockUnavailable = true;
      }
    };
    try {
      // Mouvement brut (sans accélération du système) quand c'est possible.
      const result = this.canvas.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined;
      result?.catch?.(fallback);
    } catch {
      fallback();
    }
  }

  /** Libellés des 4 touches de déplacement (ex. Z, Q, S, D en AZERTY). */
  static async keyLabels(): Promise<{ forward: string; left: string; back: string; right: string }> {
    const label = await KeyboardMouseDevice.moveKeysLabel();
    if (label.length === 4) {
      return { forward: label[0]!, left: label[1]!, back: label[2]!, right: label[3]! };
    }
    return { forward: 'Z/W', left: 'Q/A', back: 'S', right: 'D' };
  }

  /** Libellé des touches de déplacement selon la disposition du clavier (ex. « ZQSD »). */
  static async moveKeysLabel(): Promise<string> {
    const nav = navigator as Navigator & {
      keyboard?: { getLayoutMap(): Promise<Map<string, string>> };
    };
    try {
      const map = await nav.keyboard?.getLayoutMap();
      if (map) {
        const label = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map((code) => map.get(code) ?? '?').join('');
        if (!label.includes('?')) return label.toUpperCase();
      }
    } catch {
      /* API indisponible */
    }
    return 'ZQSD / WASD';
  }

  dispose(): void {
    this.abort.abort();
    if (this._locked) document.exitPointerLock();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault(); // pas de défilement de page avec Espace / flèches
    this.callbacks.onActivity();
    if (this.keys.has(event.code)) return; // répétition automatique
    this.keys.add(event.code);
    this.sync(event.code, true);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!this.keys.delete(event.code)) return;
    this.sync(event.code, false);
  };

  private sync(code: string, down: boolean): void {
    for (const action of KEY_ACTIONS[code] ?? []) this.state.setButton(action, `kb:${code}`, down);
    const held = (list: readonly string[]): number => (list.some((k) => this.keys.has(k)) ? 1 : 0);
    // Valeurs brutes : ActionState normalise la diagonale pour la marche
    // (getMove), mais pas pour la conduite (getMoveAxes).
    this.state.setMove('kb', held(MOVE_KEYS.right) - held(MOVE_KEYS.left), held(MOVE_KEYS.forward) - held(MOVE_KEYS.back));
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    this.callbacks.onActivity();
    if (!this._locked && !this._lockUnavailable) {
      this.ignoreButtonsUntilRelease = true;
      this.requestLock();
      return;
    }
    this.onPointerButtons(event);
  };

  /** Les boutons sont lus via `buttons` : gère les appuis simultanés. */
  private readonly onPointerButtons = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    const buttons = event.buttons;
    if (this.ignoreButtonsUntilRelease) {
      if (buttons === 0) this.ignoreButtonsUntilRelease = false;
      return;
    }
    if (!this._locked && !this._lockUnavailable) return;
    this.buttons = buttons;
    this.state.setButton('grab', 'mouse:left', (buttons & 1) !== 0);
    // En mode repli, le clic droit sert à regarder : le lancer passe par F.
    if (!this._lockUnavailable) this.state.setButton('throw', 'mouse:right', (buttons & 2) !== 0);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    if (event.buttons !== this.buttons) this.onPointerButtons(event);
    const dragLook = this._lockUnavailable && (event.buttons & 2) !== 0;
    if (!this._locked && !dragLook) return;
    const dx = clamp(event.movementX, MAX_MOUSE_DELTA);
    const dy = clamp(event.movementY, MAX_MOUSE_DELTA);
    if (dx === 0 && dy === 0) return;
    this.state.addLook(dx * this.sensitivity, dy * this.sensitivity * (this.invertY ? -1 : 1));
  };

  /** Molette : un cran = un appui sur « vitesse + » ou « vitesse − ». */
  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const now = performance.now();
    if (now - this.lastWheel < WHEEL_COOLDOWN_MS || event.deltaY === 0) return;
    this.lastWheel = now;
    const action: ButtonAction = event.deltaY < 0 ? 'gearUp' : 'gearDown';
    this.state.setButton(action, 'mouse:wheel', true);
    this.state.setButton(action, 'mouse:wheel', false);
    this.callbacks.onActivity();
  };

  private readonly onLockChange = (): void => {
    this._locked = document.pointerLockElement === this.canvas;
    if (!this._locked) {
      this.buttons = 0;
      this.state.setButton('grab', 'mouse:left', false);
      this.state.setButton('throw', 'mouse:right', false);
    }
    this.callbacks.onPointerLockChange(this._locked);
  };

  private releaseAll(): void {
    for (const code of [...this.keys]) {
      this.keys.delete(code);
      this.sync(code, false);
    }
  }
}

function clamp(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value || 0));
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
}
