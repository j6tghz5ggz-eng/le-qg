/**
 * Tracé de l'échappement « passage haut » du supermotard, partagé par les
 * emplacements (où se fixe la cartouche) et les modèles 3D (forme du pot).
 *
 * Repère : celui du point d'ancrage du pot (la lumière d'échappement, à
 * l'avant du cylindre). x = droite de la moto, y = haut, z = avant.
 * Le pot descend un peu devant le cylindre, part sur la droite, puis
 * remonte le long du cadre jusque sous le cache latéral : c'est là que la
 * cartouche s'emboîte et file vers la queue de selle.
 */
export type Vec3 = readonly [number, number, number];

/** Lumière d'échappement (repère de la moto). */
export const EXHAUST_PORT: Vec3 = [0, 0.27, 0.2];

/** Points de passage du pot (repère du pot). Le dernier est la sortie (la « queue »). */
export const CHAMBER_PATH: readonly Vec3[] = [
  [0, 0, 0],
  [0.015, -0.05, 0.08],
  [0.09, -0.08, 0.11],
  [0.18, -0.03, -0.02],
  [0.21, 0.07, -0.25],
  [0.215, 0.15, -0.5],
  [0.205, 0.2, -0.66],
];

/**
 * Profil du pot (rayon relatif au ventre selon la position le long du
 * tracé, de 0 à 1) : collecteur, cône divergent, ventre, cône convergent,
 * queue fine qui entre dans la cartouche.
 */
export const CHAMBER_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.4],
  [0.16, 0.4],
  [0.46, 1],
  [0.64, 1],
  [0.86, 0.3],
  [1, 0.27],
];

/** Sortie du pot = entrée de la cartouche (repère de la moto). */
export const SILENCER_INLET: Vec3 = [
  EXHAUST_PORT[0] + CHAMBER_PATH[CHAMBER_PATH.length - 1]![0],
  EXHAUST_PORT[1] + CHAMBER_PATH[CHAMBER_PATH.length - 1]![1],
  EXHAUST_PORT[2] + CHAMBER_PATH[CHAMBER_PATH.length - 1]![2],
];

/** Direction de la cartouche depuis son entrée (vers l'arrière, en remontant). */
export const SILENCER_DIRECTION: Vec3 = normalize([0, 0.27, -1]);

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Rayon du pot à une position relative (0 à 1) du tracé. */
export function chamberRadius(belly: number, t: number): number {
  const p = CHAMBER_PROFILE;
  if (t <= p[0]![0]) return belly * p[0]![1];
  for (let i = 1; i < p.length; i++) {
    const [t1, r1] = p[i]!;
    const [t0, r0] = p[i - 1]!;
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      // Transitions adoucies (les cônes d'un pot sont roulés, pas cassés).
      const s = k * k * (3 - 2 * k);
      return belly * (r0 + (r1 - r0) * s);
    }
  }
  return belly * p[p.length - 1]![1];
}
