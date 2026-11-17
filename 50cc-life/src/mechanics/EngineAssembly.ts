/**
 * Pièces montées sur un moteur, règles de démontage/remontage et effet sur
 * les performances. Module pur (testé dans Node).
 */
import type { EngineStats, Restriction } from '../vehicles/simulation/Powertrain';
import type { PartCatalog, PartDefinition } from './parts';
import type { SlotDefinition } from './slots';

export interface PartInstance {
  readonly uid: string;
  readonly defId: string;
  /** État : 1 = neuve, 0 = hors d'usage. */
  condition: number;
}

let nextUid = 1;

export function createPart(defId: string, condition = 1): PartInstance {
  return { uid: `part-${nextUid++}`, defId, condition };
}

/**
 * Effets de l'absence d'une pièce non indispensable :
 * - sans pot de détente, un 2 temps perd beaucoup (plus d'onde de retour) ;
 * - sans cartouche, il perd un peu et hurle ;
 * - sans filtre, il respire un peu mieux (et s'use plus vite, plus tard).
 */
const MISSING_CHAMBER_POWER = 0.6;
const MISSING_SILENCER_POWER = 0.97;
const MISSING_SILENCER_LOUDNESS = 0.8;
const MISSING_FILTER_POWER = 1.03;
const DEFAULT_LIMITER = 8700;
/** En dessous, le piston est grippé : le moteur ne tourne plus. */
export const SEIZED_CONDITION = 0.02;

export class EngineAssembly {
  private readonly installed = new Map<string, PartInstance>();
  private readonly slotsById: ReadonlyMap<string, SlotDefinition>;

  constructor(
    readonly slots: readonly SlotDefinition[],
    private readonly catalog: PartCatalog,
  ) {
    this.slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  }

  slot(id: string): SlotDefinition {
    const slot = this.slotsById.get(id);
    if (!slot) throw new Error(`Emplacement inconnu : ${id}`);
    return slot;
  }

  part(slotId: string): PartInstance | undefined {
    return this.installed.get(slotId);
  }

  definition(part: PartInstance): PartDefinition {
    const def = this.catalog.get(part.defId);
    if (!def) throw new Error(`Pièce inconnue : ${part.defId}`);
    return def;
  }

  /** Emplacements qui acceptent cette pièce (vides ou non). */
  slotsFor(part: PartInstance): SlotDefinition[] {
    const category = this.definition(part).category;
    return this.slots.filter((slot) => slot.accepts === category);
  }

  /** Raison pour laquelle on ne peut pas démonter (null = possible). */
  removalBlocker(slotId: string): string | null {
    if (!this.installed.has(slotId)) return 'Emplacement vide';
    const blocking = this.slots.filter((s) => s.requires.includes(slotId) && this.installed.has(s.id));
    return blocking.length ? `Retirez d'abord : ${blocking.map((s) => s.name).join(', ')}` : null;
  }

  /** Raison pour laquelle on ne peut pas monter cette pièce ici (null = possible). */
  installBlocker(slotId: string, part: PartInstance): string | null {
    const slot = this.slot(slotId);
    if (this.installed.has(slotId)) return 'Emplacement occupé';
    if (this.definition(part).category !== slot.accepts) return 'Pièce incompatible';
    const missing = slot.requires.filter((id) => !this.installed.has(id)).map((id) => this.slot(id).name);
    return missing.length ? `Il faut d'abord : ${missing.join(', ')}` : null;
  }

  remove(slotId: string): PartInstance {
    const blocker = this.removalBlocker(slotId);
    if (blocker) throw new Error(blocker);
    const part = this.installed.get(slotId)!;
    this.installed.delete(slotId);
    return part;
  }

  install(slotId: string, part: PartInstance): void {
    const blocker = this.installBlocker(slotId, part);
    if (blocker) throw new Error(blocker);
    this.installed.set(slotId, part);
  }

  /**
   * Pose ou retire une pièce SANS vérifier les règles de démontage : pour
   * les triches (onglet DEV) et, plus tard, le chargement d'une sauvegarde.
   */
  forceSet(slotId: string, part: PartInstance | null): void {
    const slot = this.slot(slotId);
    if (!part) {
      this.installed.delete(slotId);
      return;
    }
    if (this.definition(part).category !== slot.accepts) throw new Error('Pièce incompatible');
    this.installed.set(slotId, part);
  }

  /** Retire toutes les pièces (triches). */
  clear(): void {
    this.installed.clear();
  }

  entries(): IterableIterator<[string, PartInstance]> {
    return this.installed.entries();
  }

  /** Ce que les pièces montées permettent au moteur. */
  stats(): EngineStats {
    const missing = this.slots.filter((s) => s.required && !this.installed.has(s.id)).map((s) => s.name);
    let powerFactor = 1;
    const restrictions: Restriction[] = [];
    // Parcours dans l'ordre des emplacements : résultat stable, quel que soit
    // l'ordre des démontages/remontages.
    for (const slot of this.slots) {
      const part = this.installed.get(slot.id);
      if (!part) continue;
      const effects = this.definition(part).effects;
      powerFactor *= effects.powerFactor ?? 1;
      if (effects.restriction) restrictions.push(effects.restriction);
    }

    const piston = this.installed.get('piston');
    if (piston) powerFactor *= 0.75 + 0.25 * piston.condition; // usure : perte de compression
    const cylinder = this.installed.get('cylinder');
    if (cylinder) powerFactor *= 0.9 + 0.1 * cylinder.condition; // chemise rayée
    const filter = this.installed.get('airFilter');
    if (filter) powerFactor *= 0.95 + 0.05 * filter.condition; // filtre encrassé : moins d'air
    // Piston grippé (moteur serré faute d'huile) : à remplacer.
    const seized = piston !== undefined && piston.condition <= SEIZED_CONDITION;
    if (seized) missing.push('Piston (serré)');
    const chamber = this.installed.get('exhaust');
    const silencer = this.installed.get('silencer');
    if (!chamber) powerFactor *= MISSING_CHAMBER_POWER;
    else if (!silencer) powerFactor *= MISSING_SILENCER_POWER;
    if (!this.installed.has('airFilter')) powerFactor *= MISSING_FILTER_POWER;

    let loudness = 1;
    if (chamber) {
      loudness = this.definition(chamber).effects.loudness ?? 0;
      loudness += silencer ? (this.definition(silencer).effects.loudness ?? 0.3) : MISSING_SILENCER_LOUDNESS;
    }

    const ignition = this.installed.get('ignition');
    const plug = this.installed.get('sparkPlug');
    let startChance = 0.5 + 0.45 * (plug?.condition ?? 0);
    if (piston && piston.condition < 0.4) startChance -= 0.2;

    return {
      canRun: missing.length === 0,
      seized,
      missing,
      powerFactor,
      limiterRpm: ignition ? (this.definition(ignition).effects.limiterRpm ?? DEFAULT_LIMITER) : DEFAULT_LIMITER,
      restrictions,
      startChance: Math.min(Math.max(startChance, 0.05), 0.98),
      loudness: Math.min(loudness, 1),
    };
  }
}

/** Moteur d'origine du supermotard (bougie usée : une raison d'aller à l'établi). */
export function stockSm50(assembly: EngineAssembly): EngineAssembly {
  const stock: Array<[string, string, number]> = [
    ['piston', 'piston-40', 0.8],
    ['cylinder', 'cylinder-50', 0.85],
    ['head', 'head-50', 0.9],
    ['sparkPlug', 'plug-std', 0.3],
    ['exhaust', 'exhaust-stock', 0.9],
    ['silencer', 'silencer-stock', 0.9],
    ['carburetor', 'carb-12', 0.85],
    ['airFilter', 'airfilter-std', 0.6],
    ['ignition', 'cdi-restricted', 1],
  ];
  for (const [slot, defId, condition] of stock) assembly.install(slot, createPart(defId, condition));
  return assembly;
}
