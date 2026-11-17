/**
 * Monde ouvert : routes, village, arbres, panneaux.
 *
 * - Les routes forment UN maillage (quelques milliers de triangles, un
 *   seul appel GPU) : toujours là.
 * - Maisons et arbres sont construits par morceaux de 128 m, seulement
 *   autour du joueur (rayon = distance de vue du profil). Un morceau par
 *   image au maximum : le monde se charge progressivement, sans à-coup ; le
 *   brouillard cache la limite. Les morceaux lointains sont détruits
 *   (mémoire maîtrisée sur mobile).
 * - Chaque morceau a UN corps physique statique composé (troncs, murs) :
 *   peu d'objets pour Havok, même dans une forêt.
 * - Arbres en « instances fines » : un modèle, des centaines de copies, un
 *   appel GPU par type et par morceau.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox, PhysicsShapeContainer, PhysicsShapeCylinder } from '@babylonjs/core/Physics/v2/physicsShape';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext, GameSystem } from '../../app/GameContext';
import { MeshBin, type Surface } from '../../core/rendering/meshKit';
import type { PlayerController } from '../../player/PlayerController';
import type { WorldEnvironment } from '../environment/environment';
import {
  CHUNK_SIZE,
  ROADS,
  SIGNS,
  SQUARE_RADIUS,
  VILLAGE_NAME,
  VILLAGE_SQUARE,
  buildingsInChunk,
  chunksAround,
  treesInChunk,
  type Building,
  type Road,
} from './mapData';

type Key = 'walls' | 'roof' | 'trim' | 'glass' | 'stone';

interface Chunk {
  readonly meshes: Mesh[];
  readonly body: PhysicsBody | null;
  readonly node: TransformNode;
}

const WALL_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.93, 0.89, 0.8],
  [0.86, 0.86, 0.84],
  [0.9, 0.8, 0.62],
  [0.92, 0.82, 0.76],
  [0.96, 0.95, 0.92],
];
const ROOF_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.62, 0.3, 0.2],
  [0.55, 0.26, 0.18],
  [0.27, 0.29, 0.32],
];

export class WorldMap implements GameSystem {
  readonly id = 'world-map';
  private ctx!: GameContext;
  private readonly chunks = new Map<string, Chunk>();
  private loadRadius = 160;
  private palette!: Record<Key, Surface>;
  /** Modèles d'arbres : données de sommets (copiées dans chaque morceau) et matériau commun. */
  private treeBases: VertexData[] = [];
  private treeMaterial!: PBRMaterial;
  /** Un morceau est en attente de construction (après le rendu de l'image). */
  private building = false;

  constructor(
    private readonly player: PlayerController,
    private readonly environment: () => WorldEnvironment,
  ) {}

  init(ctx: GameContext): void {
    this.ctx = ctx;
    // Au-delà de ~300 m, maisons et arbres sont noyés dans le brouillard : inutile de les charger.
    this.loadRadius = Math.min(ctx.quality.profile.viewDistance, 300) + 20;
    this.palette = this.createPalette(ctx.scene);
    this.createRoads(ctx.scene);
    this.createSigns(ctx.scene);
    this.createSquare(ctx.scene);
    this.createTreeBases(ctx.scene);
  }

  /** Nombre de morceaux chargés (tests, statistiques). */
  get loadedChunks(): number {
    return this.chunks.size;
  }

  update(): void {
    const p = this.player.footPosition;
    const wanted = chunksAround(p.x, p.z, this.loadRadius);
    // Un morceau par image au plus (le plus proche manquant), construit
    // après le rendu de l'image pour ne pas modifier la scène en plein dessin.
    if (!this.building) {
      for (const [cx, cz] of wanted) {
        const key = `${cx},${cz}`;
        if (this.chunks.has(key)) continue;
        this.building = true;
        this.ctx.scene.onAfterRenderObservable.addOnce(() => {
          this.building = false;
          if (!this.chunks.has(key)) this.chunks.set(key, this.buildChunk(cx, cz));
        });
        break;
      }
    }
    // Morceaux trop loin (marge pour ne pas reconstruire en boucle à la limite).
    const unload = this.loadRadius + CHUNK_SIZE;
    for (const [key, chunk] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      if (Math.hypot((cx + 0.5) * CHUNK_SIZE - p.x, (cz + 0.5) * CHUNK_SIZE - p.z) > unload) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      }
    }
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
  }

  // --- Matériaux --------------------------------------------------------------

  private createPalette(scene: Scene): Record<Key, Surface> {
    const plain = (name: string, roughness: number, metallic = 0): PBRMaterial => {
      const m = new PBRMaterial(`map-${name}`, scene);
      m.albedoColor = Color3.White();
      m.roughness = roughness;
      m.metallic = metallic;
      return m;
    };
    const walls = plain('walls', 0.85);
    walls.albedoTexture = facadeTexture(scene);
    const roof = plain('roof', 0.75);
    const trim = plain('trim', 0.6);
    const glass = plain('glass', 0.1, 0.6);
    const stone = plain('stone', 0.9);
    // Matériaux « propres » : chaque morceau garde la couleur peinte sur ses sommets.
    return { walls: { material: walls }, roof: { material: roof }, trim: { material: trim }, glass: { material: glass }, stone: { material: stone } };
  }

  // --- Routes -------------------------------------------------------------------

  /** Toutes les routes en un seul maillage (bande texturée le long de chaque axe). */
  private createRoads(scene: Scene): void {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    ROADS.forEach((road, index) => appendRoad(road, 0.02 + index * 0.004, positions, uvs, indices));
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.uvs = uvs;
    data.indices = indices;
    data.normals = normals;
    const mesh = new Mesh('map-roads', scene);
    data.applyToMesh(mesh);
    const mat = new PBRMaterial('map-asphalt', scene);
    mat.albedoTexture = roadTexture(scene);
    mat.metallic = 0;
    mat.roughness = 0.85;
    mat.zOffset = -1; // au-dessus du sol, sans scintillement
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
  }

  // --- Place du village ---------------------------------------------------------------

  /** Place pavée et fontaine (toujours chargées : quelques triangles seulement). */
  private createSquare(scene: Scene): void {
    const [sx, sz] = VILLAGE_SQUARE;
    const paving = CreateDisc('map-square', { radius: SQUARE_RADIUS, tessellation: 40 }, scene);
    paving.rotation.x = Math.PI / 2;
    paving.position.set(sx, 0.03, sz);
    const mat = new PBRMaterial('map-paving', scene);
    const tex = pavingTexture(scene);
    // Une dalle de texture = 1 m (pavés de 25 cm) ; le disque fait 2R de côté en UV.
    tex.uScale = 2 * SQUARE_RADIUS;
    tex.vScale = 2 * SQUARE_RADIUS;
    mat.albedoTexture = tex;
    mat.metallic = 0;
    mat.roughness = 0.8;
    mat.zOffset = -1;
    paving.material = mat;
    paving.receiveShadows = true;
    paving.isPickable = false;
    paving.freezeWorldMatrix();

    // Fontaine : bassin, colonne, vasque, eau.
    const stoneColor = [0.72, 0.69, 0.62] as const;
    const parts: Mesh[] = [];
    const add = (mesh: Mesh, y: number): void => {
      mesh.position.set(sx, y, sz);
      paint(mesh, stoneColor);
      parts.push(mesh);
    };
    // Bassin creux : un anneau (tube) posé sur un fond.
    add(CreateCylinder('fountain-floor', { diameter: 3.4, height: 0.2, tessellation: 28 }, scene), 0.1);
    add(fountainRim(scene), 0);
    add(CreateCylinder('fountain-column', { diameter: 0.36, height: 1.5, tessellation: 12 }, scene), 1.3);
    add(CreateCylinder('fountain-bowl', { diameterTop: 1.2, diameterBottom: 0.45, height: 0.32, tessellation: 20 }, scene), 2.1);
    const fountain = Mesh.MergeMeshes(parts, true, true)!;
    fountain.name = 'map-fountain';
    const stone = this.palette.stone;
    fountain.material = 'material' in stone ? stone.material : stone.shared;
    fountain.receiveShadows = true;
    fountain.isPickable = false;
    fountain.freezeWorldMatrix();
    this.environment().addShadowCaster(fountain);
    const water = CreateDisc('fountain-water', { radius: 1.62, tessellation: 28 }, scene);
    water.rotation.x = Math.PI / 2;
    water.position.set(sx, 0.5, sz);
    const waterMat = new PBRMaterial('map-water', scene);
    waterMat.albedoColor = new Color3(0.16, 0.3, 0.36);
    waterMat.metallic = 0.3;
    waterMat.roughness = 0.08;
    water.material = waterMat;
    water.isPickable = false;
    water.freezeWorldMatrix();

    // Collision : le bassin (un cylindre statique).
    const holder = new TransformNode('fountain-body', scene);
    holder.position.set(sx, 0, sz);
    const body = new PhysicsBody(holder, PhysicsMotionType.STATIC, false, scene);
    body.shape = new PhysicsShapeCylinder(Vector3.Zero(), new Vector3(0, 0.55, 0), 1.8, scene);
  }

  // --- Panneaux -------------------------------------------------------------------

  private createSigns(scene: Scene): void {
    const pole = new PBRMaterial('map-pole', scene);
    pole.albedoColor = new Color3(0.6, 0.6, 0.62);
    pole.metallic = 0.8;
    pole.roughness = 0.4;
    const entryFront = signMaterial(scene, 'entry', (ctx, w, h) => entrySign(ctx, w, h, false));
    const entryBack = signMaterial(scene, 'exit', (ctx, w, h) => entrySign(ctx, w, h, true));
    const speed = signMaterial(scene, 'speed50', speedSign, 256, 256);
    const station = signMaterial(scene, 'station-sign', stationSign, 256, 384);
    for (const sign of SIGNS) {
      const node = new TransformNode(`sign-${sign.kind}`, scene);
      node.position.set(sign.x, 0, sign.z);
      node.rotation.y = sign.yaw;
      const meshes: Mesh[] = [];
      if (sign.kind === 'villageEntry') {
        for (const dx of [-0.7, 0.7]) meshes.push(post(scene, node, dx, 2.0, pole));
        meshes.push(panel(scene, node, CreatePlane('sign-front', { width: 1.9, height: 0.6 }, scene), 1.75, -0.03, 0, entryFront));
        meshes.push(panel(scene, node, CreatePlane('sign-back', { width: 1.9, height: 0.6 }, scene), 1.75, 0.03, Math.PI, entryBack));
      } else if (sign.kind === 'speed50') {
        meshes.push(post(scene, node, 0, 2.3, pole));
        meshes.push(panel(scene, node, CreateDisc('sign-50', { radius: 0.32, tessellation: 24 }, scene), 2.05, -0.03, 0, speed));
      } else {
        // Totem de la station (haut et visible de loin).
        meshes.push(post(scene, node, 0, 3.2, pole));
        meshes.push(panel(scene, node, CreatePlane('station-totem', { width: 1.2, height: 1.8 }, scene), 3.6, -0.03, 0, station));
        meshes.push(panel(scene, node, CreatePlane('station-totem-b', { width: 1.2, height: 1.8 }, scene), 3.6, 0.03, Math.PI, station));
      }
      for (const m of meshes) {
        m.receiveShadows = true;
        this.environment().addShadowCaster(m);
      }
    }
  }

  // --- Arbres -----------------------------------------------------------------

  /** Modèles d'arbres (tronc + feuillage, couleurs par sommet, un matériau). */
  private createTreeBases(scene: Scene): void {
    const mat = new PBRMaterial('map-tree', scene);
    this.treeMaterial = mat;
    mat.albedoColor = Color3.White();
    mat.roughness = 0.9;
    mat.metallic = 0;
    const make = (foliage: Mesh, foliageColor: readonly [number, number, number], trunkHeight: number): VertexData => {
      const trunk = CreateCylinder('tree-trunk', { diameterTop: 0.22, diameterBottom: 0.34, height: trunkHeight, tessellation: 6 }, scene);
      trunk.position.y = trunkHeight / 2;
      paint(trunk, [0.32, 0.23, 0.15]);
      paint(foliage, foliageColor);
      const mesh = Mesh.MergeMeshes([trunk, foliage], true, true)!;
      const data = VertexData.ExtractFromMesh(mesh);
      mesh.dispose();
      return data;
    };
    const leafA = CreateIcoSphere('leaf-a', { radius: 2.1, subdivisions: 2, flat: true }, scene);
    leafA.position.y = 4.4;
    leafA.scaling.set(1, 0.82, 1);
    const leafB = CreateIcoSphere('leaf-b', { radius: 1.7, subdivisions: 2, flat: true }, scene);
    leafB.position.y = 4;
    leafB.scaling.set(0.85, 1.15, 0.85);
    const cone = CreateCylinder('leaf-c', { diameterTop: 0, diameterBottom: 3, height: 6.5, tessellation: 7 }, scene);
    cone.position.y = 4.6;
    this.treeBases = [make(leafA, [0.2, 0.36, 0.13], 3.2), make(leafB, [0.32, 0.45, 0.18], 3), make(cone, [0.11, 0.26, 0.14], 1.8)];
  }

  // --- Morceaux -------------------------------------------------------------------

  private buildChunk(cx: number, cz: number): Chunk {
    const scene = this.ctx.scene;
    const node = new TransformNode(`chunk-${cx},${cz}`, scene);
    const meshes: Mesh[] = [];
    const shapes: Array<{ shape: PhysicsShapeBox | PhysicsShapeCylinder; at: Vector3; rot: Quaternion }> = [];

    // Arbres : instances fines par type.
    const trees = treesInChunk(cx, cz);
    const byType: Matrix[][] = [[], [], []];
    trees.forEach((tree, i) => {
      const type = tree.kind === 'conifer' ? 2 : i % 2;
      const rot = Quaternion.FromEulerAngles(0, tree.yaw, 0);
      byType[type]!.push(Matrix.Compose(new Vector3(tree.scale, tree.scale, tree.scale), rot, new Vector3(tree.x, 0, tree.z)));
      const radius = 0.17 * tree.scale;
      shapes.push({
        shape: new PhysicsShapeCylinder(Vector3.Zero(), new Vector3(0, 3 * tree.scale, 0), radius, scene),
        at: new Vector3(tree.x, 0, tree.z),
        rot: Quaternion.Identity(),
      });
    });
    byType.forEach((matrices, type) => {
      if (matrices.length === 0) return;
      // Chaque morceau a SA géométrie : Babylon range les matrices des
      // instances fines dans la géométrie. Partagée, le déchargement d'un
      // morceau lointain effaçait les arbres de tous les autres.
      const mesh = new Mesh(`trees-${cx},${cz}-${type}`, scene, node);
      this.treeBases[type]!.applyToMesh(mesh);
      mesh.material = this.treeMaterial;
      mesh.isPickable = false;
      const buffer = new Float32Array(matrices.length * 16);
      matrices.forEach((m, i) => m.copyToArray(buffer, i * 16));
      mesh.thinInstanceSetBuffer('matrix', buffer, 16, true);
      mesh.thinInstanceRefreshBoundingInfo(false);
      mesh.receiveShadows = true;
      meshes.push(mesh);
    });

    // Bâtiments : fusionnés par matériau.
    const bin = new MeshBin<Key>();
    const holders: TransformNode[] = [];
    for (const b of buildingsInChunk(cx, cz)) {
      holders.push(this.buildBuilding(scene, b, bin));
      const rot = Quaternion.FromEulerAngles(0, b.yaw, 0);
      shapes.push({ shape: new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(b.w, b.h, b.d), scene), at: new Vector3(b.x, b.h / 2, b.z), rot });
      if (b.kind === 'church') {
        const tower = new Vector3(-Math.sin(b.yaw) * (b.d / 2 + 2), 7.5, -Math.cos(b.yaw) * (b.d / 2 + 2)).addInPlaceFromFloats(b.x, 0, b.z);
        shapes.push({ shape: new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(4.5, 15, 4.5), scene), at: tower, rot });
      }
    }
    for (const m of bin.merge(`chunk-${cx},${cz}`, node, this.palette)) {
      m.receiveShadows = true;
      m.freezeWorldMatrix();
      meshes.push(m);
    }
    // Les morceaux fusionnés ont gardé leur position monde : les nœuds de placement ne servent plus.
    for (const h of holders) h.dispose(true, false);
    const env = this.environment();
    for (const m of meshes) env.addShadowCaster(m);

    // Un seul corps statique composé pour tout le morceau.
    let body: PhysicsBody | null = null;
    if (shapes.length > 0) {
      const container = new PhysicsShapeContainer(scene);
      for (const s of shapes) container.addChild(s.shape, s.at, s.rot);
      const holder = new TransformNode(`chunk-body-${cx},${cz}`, scene);
      holder.parent = node;
      body = new PhysicsBody(holder, PhysicsMotionType.STATIC, false, scene);
      body.shape = container;
    }
    return { meshes, body, node };
  }

  private disposeChunk(chunk: Chunk): void {
    const env = this.environment();
    for (const m of chunk.meshes) env.removeShadowCaster(m);
    if (chunk.body) {
      chunk.body.shape?.dispose();
      chunk.body.dispose();
    }
    chunk.node.dispose(false, false);
  }

  /** Maison (murs à fenêtres, toit à deux pans, porte), église, boutique, grange. */
  private buildBuilding(scene: Scene, b: Building, bin: MeshBin<Key>): TransformNode {
    const node = new TransformNode('building', scene);
    node.position.set(b.x, 0, b.z);
    node.rotation.y = b.yaw;
    const local = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.parent = node;
      mesh.position.set(x, y, z);
      return mesh;
    };
    const wallColor = b.kind === 'barn' ? ([0.55, 0.16, 0.1] as const) : b.kind === 'church' ? ([0.78, 0.75, 0.68] as const) : WALL_COLORS[Math.floor(b.tint * WALL_COLORS.length) % WALL_COLORS.length]!;
    const roofColor = b.kind === 'church' ? ROOF_COLORS[2]! : ROOF_COLORS[Math.floor(b.tint * 7) % ROOF_COLORS.length]!;
    // Motif de façade répété : 6 m de large (deux fenêtres) par étage ;
    // « wrap » garde les fenêtres droites sur les pignons.
    const floors = b.kind === 'house' && b.h >= 5.5 ? 2 : 1;
    const across = (length: number): number => Math.max(1, Math.round(length / 6));
    const plain = new Vector4(0, 0, 0.02, 0.02);
    const front = new Vector4(0, 0, across(b.w), floors);
    const side = new Vector4(0, 0, across(b.d), floors);
    const walls = local(CreateBox('walls', { width: b.w, height: b.h, depth: b.d, faceUV: [front, front, side, side, plain, plain], wrap: true }, scene), 0, b.h / 2, 0);
    paint(walls, wallColor);
    bin.add('walls', walls);
    if (b.kind === 'shop') {
      // Boutique de station : toit plat, grande vitrine, bandeau.
      const roof = local(CreateBox('roof', { width: b.w + 0.6, height: 0.3, depth: b.d + 0.6 }, scene), 0, b.h + 0.15, 0);
      paint(roof, [0.85, 0.85, 0.86]);
      bin.add('roof', roof);
      bin.add('glass', local(CreateBox('window', { width: b.w * 0.6, height: 2.2, depth: 0.08 }, scene), 0, 1.5, b.d / 2 + 0.02));
      const band = local(CreateBox('band', { width: b.w + 0.6, height: 0.6, depth: 0.1 }, scene), 0, b.h - 0.2, b.d / 2 + 0.32);
      paint(band, [0.05, 0.42, 0.25]);
      bin.add('trim', band);
    } else {
      // Toit à deux pans : prisme triangulaire, faîtage le long de la largeur.
      const r = (b.d + 0.8) / Math.sqrt(3);
      const pitch = b.kind === 'barn' ? 0.55 : b.kind === 'church' ? 0.9 : 0.62;
      const roof = local(CreateCylinder('roof', { diameter: 2 * r, height: b.w + 0.6, tessellation: 3 }, scene), 0, 0, 0);
      // Axe du prisme couché le long de la largeur, une arête vers le haut.
      roof.rotation.z = Math.PI / 2;
      const sx = (pitch * b.d) / (1.5 * r);
      roof.scaling.x = sx;
      roof.position.y = b.h + 0.5 * r * sx;
      paint(roof, roofColor);
      bin.add('roof', roof);
      // Porte et marche sur la façade (z local +).
      const door = local(CreateBox('door', { width: b.kind === 'barn' ? 3.5 : 1.0, height: b.kind === 'barn' ? 3.2 : 2.1, depth: 0.08 }, scene), 0, b.kind === 'barn' ? 1.6 : 1.05, b.d / 2 + 0.03);
      paint(door, b.kind === 'barn' ? [0.35, 0.12, 0.08] : [0.3, 0.2, 0.14]);
      bin.add('trim', door);
      if (b.kind === 'church') {
        // Clocher et flèche à l'arrière.
        const tower = local(CreateBox('tower', { width: 4.5, height: 15, depth: 4.5 }, scene), 0, 7.5, -(b.d / 2 + 2));
        paint(tower, wallColor);
        bin.add('stone', tower);
        const spire = local(CreateCylinder('spire', { diameterTop: 0, diameterBottom: 5, height: 7, tessellation: 4 }, scene), 0, 18.5, -(b.d / 2 + 2));
        spire.rotation.y = Math.PI / 4;
        paint(spire, ROOF_COLORS[2]!);
        bin.add('roof', spire);
      }
    }
    return node;
  }
}

// --- Aides ---------------------------------------------------------------------

/** Couleur par sommet (le matériau partagé est blanc). */
function paint(mesh: Mesh, color: readonly [number, number, number]): void {
  const count = mesh.getTotalVertices();
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) colors.set([color[0], color[1], color[2], 1], i * 4);
  mesh.setVerticesData('color', colors);
}

/** Ajoute la bande d'une route (deux bords, UV v le long, répétées tous les 8 m). */
function appendRoad(road: Road, y: number, positions: number[], uvs: number[], indices: number[]): void {
  const pts: Array<[number, number]> = [];
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!;
    const b = road.points[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8));
    for (let s = 0; s < steps; s++) pts.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
  }
  pts.push([...road.points[road.points.length - 1]!] as [number, number]);
  const half = road.width / 2;
  const base = positions.length / 3;
  let v = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(i - 1, 0)]!;
    const next = pts[Math.min(i + 1, pts.length - 1)]!;
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Normale (vers la gauche de la route).
    const nx = -dz;
    const nz = dx;
    const p = pts[i]!;
    if (i > 0) v += Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) / 8;
    positions.push(p[0] + nx * half, y, p[1] + nz * half, p[0] - nx * half, y, p[1] - nz * half);
    uvs.push(0, v, 1, v);
    if (i > 0) {
      const k = base + i * 2;
      // Ordre des sommets : face visible vers le haut.
      indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
}

function roadTexture(scene: Scene): DynamicTexture {
  const w = 128;
  const h = 256;
  const tex = new DynamicTexture('map-road', { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#2e2f31';
  ctx.fillRect(0, 0, w, h);
  // Grain de l'enrobé.
  for (let i = 0; i < 900; i++) {
    const g = 35 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgb(${g},${g},${g + 2})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
  ctx.fillStyle = '#d9d6ce';
  ctx.fillRect(w / 2 - 2, 0, 4, h * 0.45); // ligne centrale discontinue
  ctx.fillRect(5, 0, 3, h); // rives
  ctx.fillRect(w - 8, 0, 3, h);
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/** Rebord du bassin : profil (intérieur, haut, extérieur) tourné autour de l'axe vertical. */
function fountainRim(scene: Scene): Mesh {
  const shape = [new Vector3(1.5, 0.2, 0), new Vector3(1.5, 0.55, 0), new Vector3(1.8, 0.55, 0), new Vector3(1.8, 0, 0)];
  return CreateLathe('fountain-rim', { shape, tessellation: 28, sideOrientation: Mesh.DOUBLESIDE }, scene);
}

/** Pavés de la place : 4 × 4 pavés par dalle de texture, joints clairs. */
function pavingTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('map-paving', { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#9a958b';
  ctx.fillRect(0, 0, size, size);
  const step = size / 4;
  for (let row = 0; row < 4; row++) {
    const shift = row % 2 === 0 ? 0 : step / 2;
    for (let col = -1; col < 4; col++) {
      const g = 120 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${g},${g - 4},${g - 12})`;
      ctx.fillRect(col * step + shift + 2, row * step + 2, step - 4, step - 4);
    }
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/** Façade : enduit et deux fenêtres à volets (teinte par sommet). */
function facadeTexture(scene: Scene): DynamicTexture {
  const w = 256;
  const h = 128;
  const tex = new DynamicTexture('map-facade', { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#f0ede6';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1200; i++) {
    const g = 225 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgb(${g},${g - 3},${g - 8})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  for (const x of [52, 168]) {
    ctx.fillStyle = '#6b7f6a';
    ctx.fillRect(x - 26, 34, 12, 46); // volets
    ctx.fillRect(x + 14, 34, 12, 46);
    ctx.fillStyle = '#f7f7f4';
    ctx.fillRect(x - 16, 32, 32, 50); // encadrement
    ctx.fillStyle = '#3a4a5a';
    ctx.fillRect(x - 13, 35, 26, 44); // vitre
    ctx.fillStyle = '#f7f7f4';
    ctx.fillRect(x - 1, 35, 2, 44);
    ctx.fillRect(x - 13, 55, 26, 2);
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function signMaterial(scene: Scene, name: string, draw: Draw, w = 512, h = 160): PBRMaterial {
  const tex = new DynamicTexture(`map-${name}`, { width: w, height: h }, scene, true);
  draw(tex.getContext() as CanvasRenderingContext2D, w, h);
  tex.update();
  const mat = new PBRMaterial(`map-${name}`, scene);
  mat.albedoTexture = tex;
  mat.metallic = 0;
  mat.roughness = 0.5;
  return mat;
}

/** Panneau d'entrée d'agglomération (blanc, bord rouge) ; sortie : nom barré. */
function entrySign(ctx: CanvasRenderingContext2D, w: number, h: number, exit: boolean): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = 16;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#111111';
  ctx.font = '700 72px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(VILLAGE_NAME, w / 2, h / 2 + 4, w - 70);
  if (exit) {
    ctx.strokeStyle = '#c8102e';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(30, h - 25);
    ctx.lineTo(w - 30, 25);
    ctx.stroke();
  }
}

function speedSign(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.font = '700 110px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('50', w / 2, h / 2 + 6);
}

/** Totem de la station PÉTRO'VAL (nom fictif) avec le prix. */
function stationSign(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#0b5d3b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffd200';
  ctx.fillRect(0, 0, w, 90);
  ctx.fillStyle = '#0b5d3b';
  ctx.font = 'italic 900 46px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText("PÉTRO'VAL", w / 2, 47);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 34px Arial, Helvetica, sans-serif';
  ctx.fillText('SP95', w / 2, 150);
  ctx.fillStyle = '#111111';
  ctx.fillRect(28, 180, w - 56, 80);
  ctx.fillStyle = '#ff4d2e';
  ctx.font = '700 58px monospace';
  ctx.fillText('1,85', w / 2, 222);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px Arial, Helvetica, sans-serif';
  ctx.fillText('Huile 2T', w / 2, 300);
  ctx.fillText('Boutique', w / 2, 336);
}

function post(scene: Scene, parent: TransformNode, x: number, height: number, mat: PBRMaterial): Mesh {
  const mesh = CreateCylinder('sign-post', { diameter: 0.07, height, tessellation: 8 }, scene);
  mesh.parent = parent;
  mesh.position.set(x, height / 2, 0);
  mesh.material = mat;
  return mesh;
}

function panel(scene: Scene, parent: TransformNode, mesh: Mesh, y: number, z: number, yaw: number, mat: PBRMaterial): Mesh {
  void scene;
  mesh.parent = parent;
  mesh.position.set(0, y, z);
  mesh.rotation.y = yaw;
  mesh.material = mat;
  return mesh;
}
