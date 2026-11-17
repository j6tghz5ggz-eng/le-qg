/**
 * Règles de déplacement du joueur. Module pur (testé dans Node).
 *
 * Repère Babylon (main gauche) : x = droite, y = haut, z = avant.
 * yaw = 0 regarde vers +z ; yaw > 0 tourne vers la droite ;
 * pitch > 0 regarde vers le bas.
 */
export const PLAYER = {
  /** Capsule debout / accroupi (m). */
  standingHeight: 1.8,
  crouchHeight: 1.15,
  radius: 0.3,
  /** Hauteur des yeux au-dessus des pieds (m). */
  eyeStanding: 1.65,
  eyeCrouch: 1.0,
  /** Vitesses (m/s). */
  walkSpeed: 2.8,
  sprintSpeed: 5.2,
  crouchSpeed: 1.3,
  /** Part du contrôle conservée en l'air. */
  airControl: 0.35,
  jumpHeight: 0.7,
  /** Marche franchie automatiquement (m) : trottoir, seuil de garage. */
  maxStepHeight: 0.35,
  /**
   * Marge de sécurité du contrôleur Havok (m). Babylon recule de cette marge
   * avant de monter une marche : elle doit rester inférieure au trajet d'un
   * pas de 1/60 s (1,3 m/s accroupi → 2,2 cm), sinon les marches sont
   * refusées en marchant (défaut Babylon : 5 cm).
   */
  keepDistance: 0.015,
  /**
   * Distance (m) sous laquelle un contact compte comme « touché ». Le
   * contrôleur se pose à peu près à cette distance au-dessus du sol : avec
   * la valeur par défaut de Babylon (10 cm), le joueur flotte de 9 cm.
   */
  keepContactTolerance: 0.03,
  /**
   * Légère vitesse vers le bas au sol (m/s) : le contrôleur se considère
   * « au sol » dès qu'il est à moins de 10 cm d'une surface et cesserait de
   * descendre ; cette poussée le plaque au sol (et dans les descentes).
   */
  groundSnapSpeed: 1.5,
  /**
   * Pente max (°). 60° = valeur par défaut de Babylon : en arrivant sur le
   * bord d'une marche, le bas arrondi de la capsule touche l'arête avec un
   * angle d'environ 50-60° ; une limite plus basse ferait refuser les marches.
   * Les murs et talus trop hauts restent bloqués par maxStepHeight.
   */
  maxSlopeDegrees: 60,
  mass: 75,
  /** Force de poussée sur les objets (N). */
  pushStrength: 600,
  /** Réactivité du démarrage / de l'arrêt (0 à 1, par pas). */
  acceleration: 0.12,
  /** Limite du regard haut/bas (radians). */
  pitchLimit: (89 * Math.PI) / 180,
  /** Sous cette altitude, le joueur est replacé au point de départ. */
  fallLimit: -30,
} as const;

export type MoveState = 'onGround' | 'inAir' | 'startJump';

/**
 * Transition d'état du joueur à chaque pas.
 * `verticalSpeed` évite de « re-toucher le sol » juste après un saut.
 */
export function nextMoveState(
  state: MoveState,
  supported: boolean,
  wantsJump: boolean,
  verticalSpeed: number,
): MoveState {
  switch (state) {
    case 'startJump':
      return 'inAir';
    case 'inAir':
      return supported && verticalSpeed <= 0.5 ? 'onGround' : 'inAir';
    case 'onGround':
      if (!supported) return 'inAir';
      return wantsJump ? 'startJump' : 'onGround';
  }
}

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/**
 * Convertit une commande locale (x = droite, y = avant) en direction
 * horizontale dans le monde, selon l'orientation du regard.
 */
export function moveDirection<T extends XYZ>(x: number, y: number, yaw: number, out: T): T {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  out.x = cos * x + sin * y;
  out.y = 0;
  out.z = -sin * x + cos * y;
  return out;
}

/** Direction du regard (vecteur unitaire). */
export function lookDirection<T extends XYZ>(yaw: number, pitch: number, out: T): T {
  const cp = Math.cos(pitch);
  out.x = Math.sin(yaw) * cp;
  out.y = -Math.sin(pitch);
  out.z = Math.cos(yaw) * cp;
  return out;
}

export function clampPitch(pitch: number): number {
  return Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, pitch));
}

/** Vitesse verticale nécessaire pour sauter à `height` mètres. */
export function jumpVelocity(gravity: number, height: number): number {
  return Math.sqrt(2 * Math.abs(gravity) * height);
}

export function groundSpeed(options: { sprint: boolean; crouched: boolean }): number {
  if (options.crouched) return PLAYER.crouchSpeed;
  return options.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
}

/** Hauteur de marche minimale prise en charge par l'aide (m) : en dessous, la capsule passe seule. */
export const MIN_STEP = 0.02;

/**
 * Aide à la montée de marche : hauteur à monter si le sol trouvé devant les
 * pieds est une marche franchissable, sinon null.
 * @param footY altitude des pieds
 * @param hitY altitude du dessus de l'obstacle (rayon vertical)
 * @param hitNormalY composante verticale de la normale au point touché
 */
export function stepUpHeight(footY: number, hitY: number, hitNormalY: number, maxStep: number): number | null {
  const height = hitY - footY;
  if (height <= MIN_STEP || height > maxStep) return null;
  if (hitNormalY < 0.8) return null; // dessus incliné : ce n'est pas une marche
  return height;
}

/** Lissage exponentiel indépendant de la fréquence d'images. */
export function smoothTowards(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}
