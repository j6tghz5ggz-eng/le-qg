/**
 * Calculs de la moto, sans Babylon (testés dans Node).
 */
export const GRAVITY_ACCEL = 9.81;

/**
 * Braquage maximal selon la vitesse : grand à l'arrêt (manœuvres), très
 * faible à vitesse élevée (sinon la moto tournerait sur place et
 * s'inclinerait au-delà du possible).
 */
export function maxSteerAngle(speed: number, atRest: number, atSpeed: number, referenceSpeed: number): number {
  const t = Math.min(Math.abs(speed) / referenceSpeed, 1);
  const eased = t * t * (3 - 2 * t);
  return atRest + (atSpeed - atRest) * eased;
}

/**
 * Inclinaison d'équilibre dans un virage : tan(φ) = a / g, avec
 * a = vitesse × vitesse de lacet (accélération centripète).
 * Positive = penché à droite.
 */
export function targetLeanAngle(speed: number, yawRate: number, maxLean: number): number {
  const lean = Math.atan((speed * yawRate) / GRAVITY_ACCEL);
  return Math.max(-maxLean, Math.min(maxLean, lean));
}

/** Force d'un amortisseur : ressort + amortissement, jamais négative (la roue ne tire pas le sol). */
export function suspensionForce(compression: number, compressionSpeed: number, stiffness: number, damping: number): number {
  return Math.max(0, stiffness * compression + damping * compressionSpeed);
}

/**
 * Cercle de friction : un pneu ne peut pas donner plus que μ·N au total.
 * Retourne le facteur (≤ 1) à appliquer aux deux composantes.
 */
export function frictionScale(lateral: number, longitudinal: number, max: number): number {
  const total = Math.hypot(lateral, longitudinal);
  if (total <= max || total === 0) return 1;
  return Math.max(0, max) / total;
}

/**
 * Répartit l'adhérence d'un pneu en donnant la priorité au latéral : la
 * moto ne glisse pas de travers sous les freins ; c'est la force de
 * freinage/motrice qui est réduite. Retourne [latéral, longitudinal].
 */
export function splitGrip(lateral: number, longitudinal: number, max: number): [number, number] {
  const limit = Math.max(0, max);
  const lat = Math.max(-limit, Math.min(limit, lateral));
  const remaining = Math.sqrt(Math.max(0, limit * limit - lat * lat));
  const long = Math.max(-remaining, Math.min(remaining, longitudinal));
  return [lat, long];
}

/** Rapproche `current` de `target` d'au plus `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/** Traînée aérodynamique (N), de signe opposé à la vitesse. */
export function aeroDrag(speed: number, cdA: number, airDensity = 1.2): number {
  return -0.5 * airDensity * cdA * speed * Math.abs(speed);
}

/**
 * Couple de roulis créé par les forces latérales des pneus. Elles agissent
 * au sol, sous le centre de gravité : dans un virage, elles redressent la
 * moto vers l'extérieur. Positive = vers la droite.
 *
 * Remarque : dans notre modèle, les suspensions poussent à peu près à la
 * hauteur du centre de gravité, donc la gravité ne fait pas basculer la
 * moto ; c'est le « pilote » (Bike.balance) qui crée l'inclinaison.
 */
export function tireRollTorque(mass: number, comHeight: number, lateralAccel: number, lean: number): number {
  return -mass * comHeight * lateralAccel * Math.cos(lean);
}
