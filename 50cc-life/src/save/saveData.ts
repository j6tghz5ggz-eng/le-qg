/**
 * Format de la sauvegarde et sa validation. Module pur, testé.
 *
 * Une sauvegarde abîmée ou d'une autre version ne doit jamais faire planter
 * le jeu : tout ce qui est invalide est ignoré (pièce inconnue, nombre
 * absurde…), et une sauvegarde illisible équivaut à une nouvelle partie.
 */
import type { PartCatalog } from '../mechanics/parts';

/**
 * Version 2 : niveaux d'essence et d'huile de la moto, jerricans et bidons.
 * Une sauvegarde de version 1 est relue (niveaux de départ par défaut).
 */
export const SAVE_VERSION = 2;

export interface SavedPart {
  readonly defId: string;
  /** 0 = hors d'usage, 1 = neuve. */
  readonly condition: number;
}

export interface SavedPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface SavedFluids {
  readonly fuel: number;
  readonly premixOil: number;
  readonly oilTank: number;
}

export interface SavedContainer {
  readonly kind: 'jerrican' | 'oil';
  readonly amount: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SaveData {
  readonly version: typeof SAVE_VERSION;
  /** Date (ms depuis 1970). */
  readonly savedAt: number;
  readonly money: number;
  readonly player: SavedPose;
  /** Première moto : position et pièces montées (emplacement → pièce). */
  readonly bike: (SavedPose & { readonly parts: Readonly<Record<string, SavedPart>>; readonly fluids: SavedFluids | null }) | null;
  /** Jerricans et bidons d'huile posés dans le monde. */
  readonly containers: readonly SavedContainer[];
  /** Pièces posées dans le monde. */
  readonly loose: ReadonlyArray<SavedPart & { readonly x: number; readonly y: number; readonly z: number }>;
}

const LIMIT = 10_000; // coordonnées plausibles (m)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown, limit = LIMIT): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

function pose(v: unknown): SavedPose | null {
  if (!isObject(v) || !finite(v.x) || !finite(v.y) || !finite(v.z) || !finite(v.yaw, 100)) return null;
  return { x: v.x, y: v.y, z: v.z, yaw: v.yaw };
}

function part(v: unknown, catalog: PartCatalog): SavedPart | null {
  if (!isObject(v) || typeof v.defId !== 'string' || !catalog.has(v.defId) || !finite(v.condition, 1e6)) return null;
  return { defId: v.defId, condition: Math.min(Math.max(v.condition, 0), 1) };
}

/** Lit une sauvegarde (texte JSON). null si absente ou illisible. */
export function parseSave(raw: string | null, catalog: PartCatalog): SaveData | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || (data.version !== 1 && data.version !== SAVE_VERSION)) return null;
  const player = pose(data.player);
  if (!player || !finite(data.money, 1e9)) return null;

  let bike: SaveData['bike'] = null;
  const bikePose = pose(data.bike);
  if (bikePose && isObject(data.bike) && isObject(data.bike.parts)) {
    const parts: Record<string, SavedPart> = {};
    for (const [slot, value] of Object.entries(data.bike.parts)) {
      const p = part(value, catalog);
      if (p) parts[slot] = p;
    }
    let fluids: SavedFluids | null = null;
    const f = data.bike.fluids;
    if (isObject(f) && finite(f.fuel, 100) && finite(f.premixOil, 100) && finite(f.oilTank, 100)) {
      fluids = { fuel: Math.max(0, f.fuel), premixOil: Math.max(0, f.premixOil), oilTank: Math.max(0, f.oilTank) };
    }
    bike = { ...bikePose, parts, fluids };
  }

  const containers: SavedContainer[] = [];
  if (Array.isArray(data.containers)) {
    for (const c of data.containers.slice(0, 200)) {
      if (!isObject(c) || (c.kind !== 'jerrican' && c.kind !== 'oil') || !finite(c.amount, 100) || !finite(c.x) || !finite(c.y) || !finite(c.z)) continue;
      containers.push({ kind: c.kind, amount: Math.max(0, c.amount), x: c.x, y: c.y, z: c.z });
    }
  }

  const loose: Array<SavedPart & { x: number; y: number; z: number }> = [];
  if (Array.isArray(data.loose)) {
    for (const item of data.loose.slice(0, 500)) {
      const p = part(item, catalog);
      if (p && isObject(item) && finite(item.x) && finite(item.y) && finite(item.z)) loose.push({ ...p, x: item.x, y: item.y, z: item.z });
    }
  }

  return {
    version: SAVE_VERSION,
    savedAt: finite(data.savedAt, 1e15) ? data.savedAt : 0,
    money: Math.max(0, Math.round(data.money)),
    player,
    bike,
    loose,
    containers,
  };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}
