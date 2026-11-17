/**
 * Atelier : pièces démontables des motos.
 *
 * - Chaque moto « mécanique » a un EngineAssembly (règles, état) et un
 *   modèle 3D par pièce montée, accroché à la moto.
 * - Viser une pièce montée + maintenir Utiliser = la dévisser (durée selon
 *   le nombre de fixations). Moto à l'arrêt, sans pilote, moteur coupé.
 * - La pièce démontée devient un objet physique : on peut la porter, la
 *   poser sur l'établi, la lancer…
 * - En portant une pièce près de son emplacement libre, un fantôme montre
 *   où elle va ; maintenir Utiliser pour la revisser.
 * - Après chaque changement, les performances du moteur sont recalculées
 *   (CDI débridé → rupteur plus haut, pot course → plus de puissance…).
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { GameContext, GameSystem } from '../app/GameContext';
import type { HoldAction } from '../core/interaction/Interactable';
import type { PlayerController } from '../player/PlayerController';
import type { InteractionSystem } from '../player/interaction/InteractionSystem';
import { t } from '../ui/i18n';
import type { Bike } from '../vehicles/bike/Bike';
import type { ShadowHost, VehicleSystem } from '../vehicles/VehicleSystem';
import { EngineAssembly, SEIZED_CONDITION, createPart, stockSm50, type PartInstance } from './EngineAssembly';
import { wearStep } from './wear';
import { createPartMesh, getGhostMaterial } from './partMeshes';
import { PART_CATALOG, PARTS, isFeminine, type PartDefinition } from './parts';
import type { SlotDefinition } from './slots';
import type { SavedPart } from '../save/saveData';

/** Pièce posée dans le monde, vue de l'extérieur (boutique, sauvegarde). */
export interface LoosePartInfo {
  readonly uid: string;
  readonly def: PartDefinition;
  readonly condition: number;
  readonly position: Vector3;
  /** Tenue en main par le joueur (ne peut pas être vendue). */
  readonly held: boolean;
}

export interface SparePart {
  readonly defId: string;
  readonly condition: number;
  readonly position: Vector3;
}

interface BikeRig {
  readonly bike: Bike;
  readonly engine: EngineAssembly;
  /** Modèle 3D de chaque pièce montée, par emplacement. */
  readonly meshes: Map<string, Mesh>;
  /** Jauge de serrage (0 à 1 ; 1 = le piston grippe). */
  seize: number;
  /** Temps depuis le dernier recalcul des performances (usure). */
  statsTimer: number;
}

/** Pièces qui s'usent en roulant, et leur emplacement. */
const WEARING_SLOTS = ['piston', 'cylinder', 'sparkPlug', 'airFilter'] as const;

interface LoosePart {
  readonly part: PartInstance;
  readonly def: PartDefinition;
  readonly mesh: Mesh;
  readonly aggregate: PhysicsAggregate;
}

interface InstallCandidate {
  readonly rig: BikeRig;
  readonly slot: SlotDefinition;
  readonly loose: LoosePart;
  readonly blocker: string | null;
}

/** Kit de débridage complet (triche) : emplacement → pièce. */
const RACING_KIT: ReadonlyArray<readonly [string, string]> = [
  ['ignition', 'cdi-free'],
  ['exhaust', 'exhaust-racing'],
  ['silencer', 'silencer-racing'],
  ['carburetor', 'carb-17'],
];

/** Distance max entre la pièce portée et son emplacement pour la remonter (m). */
const INSTALL_DISTANCE = 0.85;
/**
 * Havok gère mal les objets minuscules (une bougie : 2 × 6 cm, 50 g) : ils
 * traversent le décor. Volume de collision et masse physique minimaux.
 */
const MIN_COLLIDER_SIZE = 0.05;
const MIN_PHYSICS_MASS = 0.25;

export class MechanicsSystem implements GameSystem {
  readonly id = 'mechanics';
  private ctx!: GameContext;
  private readonly rigs: BikeRig[] = [];
  private readonly loose = new Map<PhysicsBody, LoosePart>();
  private ghost: Mesh | null = null;
  private ghostKey = '';
  private candidate: InstallCandidate | null = null;
  private candidateAction: HoldAction | null = null;
  /** Triche « moteur DEV » : couple ×2,5, aucun bridage. */
  private devEngine = false;
  /** Multiplicateur d'usure (triche « usure accélérée »). */
  private wearRate = 1;

  constructor(
    private readonly vehicles: VehicleSystem,
    private readonly interaction: InteractionSystem,
    private readonly player: PlayerController,
    private readonly shadows: ShadowHost,
    private readonly spares: readonly SparePart[],
    /** Graissage reçu par le moteur d'une moto (rapport huile / essence), fourni par le carburant. */
    private readonly lubrication: (bike: Bike) => number = () => 0.02,
  ) {}

  init(ctx: GameContext): void {
    this.ctx = ctx;
    for (const bike of this.vehicles.bikes) {
      const slots = bike.spec.engineSlots;
      if (!slots) continue;
      const rig: BikeRig = { bike, engine: stockSm50(new EngineAssembly(slots, PART_CATALOG)), meshes: new Map(), seize: 0, statsTimer: 0 };
      this.rigs.push(rig);
      for (const [slotId, part] of rig.engine.entries()) this.attachMesh(rig, slotId, part);
      this.refreshStats(rig);
    }
    for (const spare of this.spares) this.spawnLoose(createPart(spare.defId, spare.condition), spare.position);
    this.registerCheats();
  }

  private registerCheats(): void {
    const cheats = this.ctx.cheats;
    cheats.add('Mécanique', {
      kind: 'action',
      id: 'repair-all',
      label: 'Tout remettre à neuf',
      run: () => this.cheatRebuild((engine) => {
        for (const [, part] of engine.entries()) part.condition = 1;
      }, t('cheat.repaired')),
    });
    cheats.add('Mécanique', {
      kind: 'action',
      id: 'racing-kit',
      label: 'Kit débridage complet',
      run: () => this.cheatRebuild((engine) => {
        for (const [slot, defId] of RACING_KIT) engine.forceSet(slot, createPart(defId));
      }, t('cheat.racingKit')),
    });
    cheats.add('Mécanique', {
      kind: 'action',
      id: 'stock-engine',
      label: "Moteur d'origine",
      run: () => this.cheatRebuild((engine) => {
        engine.clear();
        stockSm50(engine);
      }, t('cheat.stock')),
    });
    cheats.add('Mécanique', {
      kind: 'choice',
      id: 'spawn-part',
      label: 'Pièce neuve',
      button: 'Faire apparaître',
      options: () => PARTS.map((p) => ({ value: p.id, label: p.name })),
      run: (defId) => this.spawnInFront(defId),
    });
    cheats.add('Mécanique', {
      kind: 'action',
      id: 'clear-parts',
      label: 'Ranger les pièces au sol',
      run: () => {
        if (this.interaction.isHolding) return;
        for (const loose of [...this.loose.values()]) this.disposeLoose(loose);
      },
    });
    cheats.add('Mécanique', {
      kind: 'toggle',
      id: 'fast-wear',
      label: 'Usure accélérée ×20',
      get: () => this.wearRate > 1,
      set: (on) => (this.wearRate = on ? 20 : 1),
    });
    cheats.add('Mécanique', {
      kind: 'action',
      id: 'seize-engine',
      label: 'Serrer le moteur (test)',
      run: () => {
        const rig = this.rigs[0];
        if (rig) this.seize(rig);
      },
    });
    cheats.add('Moto', {
      kind: 'toggle',
      id: 'dev-engine',
      label: 'Moteur DEV (×2,5, sans bridage)',
      get: () => this.devEngine,
      set: (on) => {
        this.devEngine = on;
        for (const rig of this.rigs) this.refreshStats(rig);
      },
    });
  }

  /** Change les pièces de la première moto sans passer par l'atelier (triches). */
  private cheatRebuild(mutate: (engine: EngineAssembly) => void, message: string): void {
    const rig = this.rigs[0];
    if (!rig) return;
    this.rebuildRig(rig, mutate);
    this.ctx.bus.emit('ui:notice', { message });
  }

  /** Remplace les pièces d'une moto (modèles 3D et performances recalculés). */
  private rebuildRig(rig: BikeRig, mutate: (engine: EngineAssembly) => void): void {
    for (const mesh of rig.meshes.values()) {
      this.ctx.interactables.unregisterMesh(mesh);
      mesh.dispose();
    }
    rig.meshes.clear();
    mutate(rig.engine);
    for (const [slotId, part] of rig.engine.entries()) this.attachMesh(rig, slotId, part);
    this.refreshStats(rig);
  }

  /** Pièce neuve devant le joueur, à hauteur de poitrine (elle tombe au sol). */
  private spawnInFront(defId: string): void {
    if (!PART_CATALOG.has(defId)) return;
    const eye = this.player.getEyePosition(new Vector3());
    const forward = this.player.getForward(new Vector3());
    forward.y = 0;
    if (forward.lengthSquared() < 1e-4) forward.set(0, 0, 1);
    forward.normalize();
    this.spawnLoose(createPart(defId, 1), eye.addInPlace(forward.scaleInPlace(1.1)).addInPlaceFromFloats(0, -0.4, 0));
  }

  /** Emplacements occupés de la première moto (pour les tests). */
  installedSlots(): string[] {
    const rig = this.rigs[0];
    return rig ? [...rig.engine.entries()].map(([slot]) => slot) : [];
  }

  /** Position monde d'un emplacement de la première moto (pour les tests). */
  slotWorldPosition(slotId: string): Vector3 | null {
    const rig = this.rigs[0];
    if (!rig) return null;
    return this.anchorWorld(rig, rig.engine.slot(slotId));
  }

  /** Pièces posées dans le monde (pour les tests). */
  looseParts(): Array<{ name: string; position: Vector3 }> {
    return [...this.loose.values()].map((l) => ({ name: l.def.name, position: l.mesh.getAbsolutePosition().clone() }));
  }

  /** Pièces posées dans le monde, avec leur état (boutique, sauvegarde). */
  listLoose(): LoosePartInfo[] {
    const held = this.interaction.heldBody;
    return [...this.loose.values()].map((l) => ({
      uid: l.part.uid,
      def: l.def,
      condition: l.part.condition,
      position: l.mesh.getAbsolutePosition().clone(),
      held: l.aggregate.body === held,
    }));
  }

  /** Retire une pièce du monde (vendue). Refusé si le joueur la tient. */
  removeLoose(uid: string): boolean {
    for (const loose of this.loose.values()) {
      if (loose.part.uid !== uid) continue;
      if (loose.aggregate.body === this.interaction.heldBody) return false;
      this.disposeLoose(loose);
      return true;
    }
    return false;
  }

  /** Fait apparaître une pièce (livraison, sauvegarde). */
  spawnPart(defId: string, condition: number, position: Vector3): void {
    if (PART_CATALOG.has(defId)) this.spawnLoose(createPart(defId, condition), position);
  }

  /** État à sauvegarder : pièces montées sur la première moto, pièces au sol. */
  exportState(): { parts: Record<string, SavedPart> | null; loose: Array<SavedPart & { x: number; y: number; z: number }> } {
    const rig = this.rigs[0];
    let parts: Record<string, SavedPart> | null = null;
    if (rig) {
      parts = {};
      for (const [slot, part] of rig.engine.entries()) parts[slot] = { defId: part.defId, condition: part.condition };
    }
    const loose = this.listLoose().map((l) => ({ defId: l.def.id, condition: l.condition, x: l.position.x, y: l.position.y, z: l.position.z }));
    return { parts, loose };
  }

  /** Restaure une sauvegarde : remplace les pièces de la moto et celles au sol. */
  importState(parts: Readonly<Record<string, SavedPart>> | null, loose: ReadonlyArray<SavedPart & { x: number; y: number; z: number }>): void {
    if (this.interaction.isHolding) this.interaction.dropHeld();
    for (const l of [...this.loose.values()]) this.disposeLoose(l);
    const rig = this.rigs[0];
    if (rig && parts) {
      this.rebuildRig(rig, (engine) => {
        engine.clear();
        for (const slot of engine.slots) {
          const saved = parts[slot.id];
          if (saved) engine.forceSet(slot.id, createPart(saved.defId, saved.condition));
        }
      });
    }
    // Légèrement au-dessus de leur place : elles se reposent sans traverser le sol.
    for (const l of loose) this.spawnPart(l.defId, l.condition, new Vector3(l.x, l.y + 0.03, l.z));
  }

  /** Usure en roulant : piston, cylindre, bougie, filtre ; serrage sans huile. */
  fixedUpdate(dt: number): void {
    for (const rig of this.rigs) {
      const pt = rig.bike.powertrain;
      if (!pt.running) continue;
      const w = wearStep({ dt, rpm: pt.rpm, limiterRpm: pt.limiterRpm, throttle: pt.throttle, lubrication: this.lubrication(rig.bike), rate: this.wearRate });
      for (const slot of WEARING_SLOTS) {
        const part = rig.engine.part(slot);
        if (part) part.condition = Math.max(0, part.condition - w[slot]);
      }
      rig.seize = Math.min(1, Math.max(0, rig.seize + w.seize));
      if (rig.seize >= 1) {
        this.seize(rig);
        continue;
      }
      rig.statsTimer += dt;
      if (rig.statsTimer >= 1) {
        rig.statsTimer = 0;
        this.refreshStats(rig);
      }
    }
  }

  /** Le piston grippe : moteur serré (roue bloquée si l'embrayage est relâché). */
  private seize(rig: BikeRig): void {
    rig.seize = 0;
    const piston = rig.engine.part('piston');
    if (piston) piston.condition = 0;
    const cylinder = rig.engine.part('cylinder');
    if (cylinder) cylinder.condition = Math.max(0, cylinder.condition - 0.35);
    this.refreshStats(rig);
    this.ctx.bus.emit('ui:notice', { message: t('wear.seized') });
  }

  update(): void {
    // Pièce portée près d'un emplacement libre : fantôme + action « Remonter ».
    const held = this.interaction.heldBody;
    const loose = held ? this.loose.get(held) : undefined;
    this.candidate = loose ? this.findInstallCandidate(loose) : null;
    this.showGhost(this.candidate);
  }

  dispose(): void {
    this.ghost?.dispose();
  }

  // --- Pièces montées ---------------------------------------------------

  private attachMesh(rig: BikeRig, slotId: string, part: PartInstance): void {
    const def = rig.engine.definition(part);
    const slot = rig.engine.slot(slotId);
    const mesh = createPartMesh(this.ctx.scene, def);
    mesh.parent = rig.bike.visual.root;
    mesh.position.set(...slot.anchor);
    this.shadows.addShadowCaster(mesh);
    rig.meshes.set(slotId, mesh);
    this.ctx.interactables.registerMesh(mesh, {
      // Accesseur : le libellé suit l'usure (« usée », « serré »).
      get label() {
        return partLabel(def, part);
      },
      hold: {
        label: t('mechanics.remove'),
        detail: fastenersLabel(slot.fasteners),
        seconds: holdSeconds(slot),
        blocker: () => this.removalBlocker(rig, slotId),
        complete: () => this.removePart(rig, slotId),
      },
    }, rig.bike.body);
  }

  private removalBlocker(rig: BikeRig, slotId: string): string | null {
    if (rig.bike.rider) return t('mechanics.getOff');
    if (rig.bike.powertrain.running) return t('mechanics.engineRunning');
    return rig.engine.removalBlocker(slotId);
  }

  private removePart(rig: BikeRig, slotId: string): void {
    if (this.removalBlocker(rig, slotId)) return;
    const mesh = rig.meshes.get(slotId);
    const part = rig.engine.remove(slotId);
    const position = mesh ? mesh.getAbsolutePosition().clone() : this.anchorWorld(rig, rig.engine.slot(slotId));
    if (mesh) {
      this.ctx.interactables.unregisterMesh(mesh);
      mesh.dispose();
      rig.meshes.delete(slotId);
    }
    // La pièce apparaît un peu vers le joueur, pour ne pas naître dans la moto.
    const eye = this.player.getEyePosition(new Vector3());
    const toward = eye.subtract(position);
    toward.y = 0;
    if (toward.lengthSquared() > 1e-4) position.addInPlace(toward.normalize().scaleInPlace(0.3));
    position.y += 0.05;
    this.spawnLoose(part, position);
    this.refreshStats(rig);
    this.ctx.bus.emit('ui:notice', { message: `${rig.engine.definition(part).name} : ${t('mechanics.removed')}` });
  }

  // --- Pièces posées dans le monde --------------------------------------

  private spawnLoose(part: PartInstance, position: Vector3): LoosePart {
    const def = PART_CATALOG.get(part.defId);
    if (!def) throw new Error(`Pièce inconnue : ${part.defId}`);
    const mesh = createPartMesh(this.ctx.scene, def);
    mesh.position.copyFrom(position);
    this.shadows.addShadowCaster(mesh);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const size = bounds.extendSize.scale(2);
    const aggregate = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      {
        mass: Math.max(def.mass, MIN_PHYSICS_MASS),
        friction: 0.8,
        restitution: 0.1,
        center: bounds.center.clone(),
        extents: new Vector3(
          Math.max(size.x, MIN_COLLIDER_SIZE),
          Math.max(size.y, MIN_COLLIDER_SIZE),
          Math.max(size.z, MIN_COLLIDER_SIZE),
        ),
      },
      this.ctx.scene,
    );
    const loose: LoosePart = { part, def, mesh, aggregate };
    this.loose.set(aggregate.body, loose);
    this.ctx.interactables.register(aggregate.body, {
      get label() {
        return partLabel(def, part);
      },
      grabbable: true,
      installTarget: () => this.installActionFor(loose),
    });
    return loose;
  }

  private disposeLoose(loose: LoosePart): void {
    this.ctx.interactables.unregister(loose.aggregate.body);
    this.loose.delete(loose.aggregate.body);
    loose.aggregate.dispose();
    loose.mesh.dispose();
  }

  // --- Remontage ---------------------------------------------------------

  private findInstallCandidate(loose: LoosePart): InstallCandidate | null {
    const position = loose.mesh.getAbsolutePosition();
    let best: InstallCandidate | null = null;
    let bestDistance = INSTALL_DISTANCE;
    for (const rig of this.rigs) {
      for (const slot of rig.engine.slotsFor(loose.part)) {
        if (rig.engine.part(slot.id)) continue;
        const distance = Vector3.Distance(position, this.anchorWorld(rig, slot));
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { rig, slot, loose, blocker: rig.engine.installBlocker(slot.id, loose.part) };
        }
      }
    }
    return best;
  }

  private installActionFor(loose: LoosePart): HoldAction | null {
    const candidate = this.candidate;
    if (!candidate || candidate.loose !== loose) return null;
    if (this.candidateAction && this.ghostKey === candidateKey(candidate)) return this.candidateAction;
    const { rig, slot } = candidate;
    this.candidateAction = {
      label: t('mechanics.install'),
      detail: candidate.blocker ?? fastenersLabel(slot.fasteners),
      seconds: holdSeconds(slot),
      blocker: () => {
        if (rig.bike.rider) return t('mechanics.getOff');
        if (rig.bike.powertrain.running) return t('mechanics.engineRunning');
        return rig.engine.installBlocker(slot.id, loose.part);
      },
      complete: () => this.installPart(rig, slot, loose),
    };
    return this.candidateAction;
  }

  private installPart(rig: BikeRig, slot: SlotDefinition, loose: LoosePart): void {
    if (rig.engine.installBlocker(slot.id, loose.part)) return;
    rig.engine.install(slot.id, loose.part);
    this.disposeLoose(loose);
    this.attachMesh(rig, slot.id, loose.part);
    this.refreshStats(rig);
    this.candidate = null;
    this.candidateAction = null;
    this.showGhost(null);
    this.ctx.bus.emit('ui:notice', { message: `${loose.def.name} : ${t('mechanics.installed')}` });
  }

  private showGhost(candidate: InstallCandidate | null): void {
    const key = candidate ? candidateKey(candidate) : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.candidateAction = null;
    this.ghost?.dispose();
    this.ghost = null;
    if (!candidate) return;
    const ghost = createPartMesh(this.ctx.scene, candidate.loose.def);
    ghost.material = getGhostMaterial(this.ctx.scene);
    ghost.isPickable = false;
    ghost.parent = candidate.rig.bike.visual.root;
    ghost.position.set(...candidate.slot.anchor);
    // Un peu plus grand : visible même s'il chevauche d'autres pièces.
    ghost.scaling.setAll(1.04);
    this.ghost = ghost;
  }

  // --- Utilitaires -------------------------------------------------------

  private anchorWorld(rig: BikeRig, slot: SlotDefinition): Vector3 {
    const root = rig.bike.visual.root;
    root.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(Vector3.FromArray(slot.anchor), root.getWorldMatrix());
  }

  private refreshStats(rig: BikeRig): void {
    const stats = rig.engine.stats();
    rig.bike.powertrain.setEngineStats(
      this.devEngine ? { ...stats, powerFactor: stats.powerFactor * 2.5, restrictions: [], limiterRpm: Math.max(stats.limiterRpm, 11800) } : stats,
    );
  }
}

function holdSeconds(slot: SlotDefinition): number {
  return 0.5 + 0.45 * slot.fasteners;
}

function fastenersLabel(count: number): string {
  return `${count} ${count > 1 ? t('mechanics.fasteners') : t('mechanics.fastener')}`;
}

function partLabel(def: PartDefinition, part: PartInstance): string {
  const f = isFeminine(def);
  if (def.category === 'piston' && part.condition <= SEIZED_CONDITION) return `${def.name} (${t('mechanics.seized')})`;
  if (part.condition < 0.45) return `${def.name} (${t(f ? 'mechanics.worn' : 'mechanics.wornM')})`;
  if (part.condition > 0.97) return `${def.name} (${t(f ? 'mechanics.new' : 'mechanics.newM')})`;
  return def.name;
}

function candidateKey(c: InstallCandidate): string {
  return `${c.rig.bike.spec.id}|${c.slot.id}|${c.loose.part.uid}|${c.blocker ?? ''}`;
}
