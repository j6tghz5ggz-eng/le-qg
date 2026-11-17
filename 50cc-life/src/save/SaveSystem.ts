/**
 * Sauvegarde automatique de la partie.
 *
 * - Quoi : argent, position du joueur, première moto (position, pièces
 *   montées et leur état), pièces posées dans le monde, colis en route.
 * - Quand : toutes les 20 s, quand l'onglet passe en arrière-plan ou que la
 *   page se ferme, et à la demande (onglet DEV).
 * - Où : localStorage (une seule clé, quelques Ko). Écriture synchrone :
 *   elle aboutit même pendant la fermeture de la page, ce qui n'est pas
 *   garanti avec IndexedDB. On passera à IndexedDB quand l'état du monde
 *   grossira.
 * - Au démarrage, la sauvegarde est appliquée après l'initialisation de
 *   tous les systèmes (ce système est ajouté en dernier).
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { GameContext, GameSystem } from '../app/GameContext';
import { readPref, writePref } from '../core/save/safeStorage';
import type { EconomySystem } from '../economy/EconomySystem';
import type { ShopSystem } from '../economy/ShopSystem';
import type { MechanicsSystem } from '../mechanics/MechanicsSystem';
import { PART_CATALOG } from '../mechanics/parts';
import type { PlayerController } from '../player/PlayerController';
import { t } from '../ui/i18n';
import type { VehicleSystem } from '../vehicles/VehicleSystem';
import { SAVE_VERSION, parseSave, serializeSave, type SaveData } from './saveData';

const SAVE_KEY = 'save';
const AUTOSAVE_SECONDS = 20;

export interface SaveDeps {
  readonly economy: EconomySystem;
  readonly player: PlayerController;
  readonly vehicles: VehicleSystem;
  readonly mechanics: MechanicsSystem;
  readonly shop: ShopSystem;
}

export class SaveSystem implements GameSystem {
  readonly id = 'save';
  private timer = 0;
  /** Vrai après « Nouvelle partie » : plus rien n'est écrit avant le rechargement. */
  private disabled = false;
  private readonly onHidden = (): void => {
    if (document.hidden) this.save();
  };
  private readonly onPageHide = (): void => this.save();

  constructor(private readonly deps: SaveDeps) {}

  init(ctx: GameContext): void {
    const data = parseSave(readPref(SAVE_KEY), PART_CATALOG);
    if (data) {
      this.apply(data);
      ctx.bus.emit('ui:notice', { message: t('save.loaded') });
    }
    document.addEventListener('visibilitychange', this.onHidden);
    window.addEventListener('pagehide', this.onPageHide);

    ctx.cheats.add('Sauvegarde', {
      kind: 'action',
      id: 'save-now',
      label: 'Sauvegarder maintenant',
      run: () => {
        this.save();
        ctx.bus.emit('ui:notice', { message: t('save.saved') });
      },
    });
    ctx.cheats.add('Sauvegarde', {
      kind: 'action',
      id: 'new-game',
      label: 'Nouvelle partie (efface la sauvegarde)',
      run: () => {
        this.disabled = true;
        writePref(SAVE_KEY, null);
        window.location.reload();
      },
    });
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer < AUTOSAVE_SECONDS) return;
    this.timer = 0;
    this.save();
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onHidden);
    window.removeEventListener('pagehide', this.onPageHide);
  }

  /** Une sauvegarde existe-t-elle ? */
  get hasSave(): boolean {
    return readPref(SAVE_KEY) !== null;
  }

  save(): void {
    if (this.disabled) return;
    writePref(SAVE_KEY, serializeSave(this.capture()));
  }

  capture(): SaveData {
    const { economy, player, vehicles, mechanics, shop } = this.deps;
    const bike = vehicles.bikes[0] ?? null;
    let foot = { x: player.footPosition.x, y: player.footPosition.y, z: player.footPosition.z };
    let yaw = player.heading;
    if (player.isRiding && bike) {
      // En selle : on se retrouvera debout à gauche de la moto.
      const h = bike.heading;
      foot = { x: bike.position.x - Math.cos(h) * 0.9, y: bike.position.y - bike.spec.wheelRadius, z: bike.position.z + Math.sin(h) * 0.9 };
      yaw = h;
    }
    const state = mechanics.exportState();
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      money: economy.wallet.balance,
      player: { ...foot, yaw },
      bike: bike && state.parts
        ? {
            x: bike.position.x,
            // Hauteur du sol sous la moto (la position est celle du châssis).
            y: bike.position.y - bike.spec.wheelRadius,
            z: bike.position.z,
            yaw: bike.heading,
            parts: state.parts,
          }
        : null,
      loose: [...state.loose, ...shop.pendingParts()],
    };
  }

  private apply(data: SaveData): void {
    const { economy, player, vehicles, mechanics } = this.deps;
    economy.wallet.set(data.money);
    mechanics.importState(data.bike?.parts ?? null, data.loose);
    const bike = vehicles.bikes[0];
    if (bike && data.bike) vehicles.place(bike, new Vector3(data.bike.x, data.bike.y + 0.02, data.bike.z), data.bike.yaw);
    player.teleport(data.player, data.player.yaw);
  }
}
