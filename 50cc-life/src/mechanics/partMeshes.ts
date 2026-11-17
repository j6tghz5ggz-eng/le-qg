/**
 * Modèles 3D des pièces, construits à partir de leur fiche (forme, taille,
 * couleur, autocollant). Le même modèle sert pour la pièce montée sur la
 * moto, la pièce posée dans le monde et le « fantôme » de remontage.
 * L'origine du modèle est le point d'ancrage de la pièce.
 *
 * Chaque pièce finit en UN seul maillage (sous-maillages par matériau) :
 * un seul objet à viser, à porter et à munir d'un volume physique.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Curve3 } from '@babylonjs/core/Maths/math.path';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { box, pipe, rod, v3 } from '../core/rendering/meshKit';
import { CHAMBER_PATH, SILENCER_DIRECTION, chamberRadius } from './exhaustGeometry';
import type { Decal, PartDefinition } from './parts';

type Rgb = readonly [number, number, number];

const materials = new Map<string, PBRMaterial>();

/** Matériaux partagés par couleur (peu de shaders différents). */
function materialFor(scene: Scene, color: Rgb, metallic = 0, roughness?: number): PBRMaterial {
  const key = `${color.join(',')}|${metallic}|${roughness ?? ''}`;
  let mat = materials.get(key);
  if (!mat || mat.getScene() !== scene) {
    mat = new PBRMaterial(`part-${materials.size}`, scene);
    mat.albedoColor = new Color3(...color);
    mat.metallic = metallic;
    mat.roughness = roughness ?? (metallic > 0.5 ? 0.28 : metallic > 0 ? 0.42 : 0.6);
    materials.set(key, mat);
  }
  return mat;
}

/** Autocollant : texture dessinée une fois (texte le long de la pièce). */
function decalMaterial(scene: Scene, decal: Decal): PBRMaterial {
  const key = `decal|${decal.text}|${decal.sub ?? ''}|${decal.background}`;
  let mat = materials.get(key);
  if (mat && mat.getScene() === scene) return mat;
  // Toile haute et étroite : x = tour de la pièce, y = sa longueur.
  const w = 128;
  const h = 512;
  const texture = new DynamicTexture(`${key}-tex`, { width: w, height: h }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = decal.background;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI / 2);
  // Repère tourné : x le long de la pièce (h), y autour (w). Retourné pour
  // se lire de gauche à droite vu du côté droit de la moto (de l'arrière
  // vers l'avant), comme les vrais autocollants de pot.
  ctx.scale(1, -1);
  if (decal.accent) {
    ctx.fillStyle = decal.accent;
    ctx.fillRect(-h / 2, w / 2 - 22, h, 10);
    ctx.fillRect(-h / 2, -w / 2 + 12, h, 4);
  }
  ctx.fillStyle = decal.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 900 ${decal.sub ? 58 : 70}px Arial, Helvetica, sans-serif`;
  ctx.fillText(decal.text, 0, decal.sub ? -12 : 0, h - 40);
  if (decal.sub) {
    ctx.font = '700 22px Arial, Helvetica, sans-serif';
    ctx.fillText(decal.sub, 0, 34, h - 60);
  }
  ctx.restore();
  texture.update();
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  mat = new PBRMaterial(`part-decal-${materials.size}`, scene);
  mat.albedoTexture = texture;
  mat.metallic = 0;
  mat.roughness = 0.35;
  materials.set(key, mat);
  return mat;
}

/** Tissage carbone (sergé 2/2), tuilé sur la cartouche. */
function carbonMaterial(scene: Scene): PBRMaterial {
  const key = 'carbon';
  let mat = materials.get(key);
  if (mat && mat.getScene() === scene) return mat;
  const size = 64;
  const texture = new DynamicTexture('part-carbon-tex', { width: size, height: size }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const cell = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const warp = Math.floor((x + y) / 2) % 2 === 0;
      const g = ctx.createLinearGradient(x * cell, y * cell, (x + (warp ? 1 : 0)) * cell, (y + (warp ? 0 : 1)) * cell);
      g.addColorStop(0, warp ? '#2a2c30' : '#121316');
      g.addColorStop(1, warp ? '#141518' : '#26282c');
      ctx.fillStyle = g;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  texture.update();
  texture.uScale = 6;
  texture.vScale = 10;
  mat = new PBRMaterial('part-carbon', scene);
  mat.albedoTexture = texture;
  mat.metallic = 0.1;
  mat.roughness = 0.22; // vernis brillant
  materials.set(key, mat);
  return mat;
}

let ghostMaterial: PBRMaterial | null = null;

/** Matériau translucide du fantôme (« pose la pièce ici »). */
export function getGhostMaterial(scene: Scene): PBRMaterial {
  if (!ghostMaterial || ghostMaterial.getScene() !== scene) {
    ghostMaterial = new PBRMaterial('part-ghost', scene);
    ghostMaterial.albedoColor = new Color3(1, 0.7, 0.15);
    ghostMaterial.emissiveColor = new Color3(0.6, 0.38, 0.05);
    ghostMaterial.alpha = 0.4;
    ghostMaterial.metallic = 0;
    ghostMaterial.roughness = 1;
  }
  return ghostMaterial;
}

/** Oriente un maillage construit le long de y vers `direction`, et le place en `at`. */
function orient(mesh: Mesh, at: Vector3, direction: Vector3): Mesh {
  mesh.position.copyFrom(at);
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.normalizeToNew(), new Quaternion());
  return mesh;
}

/**
 * Bande d'autocollant posée sur un tube : portion de cylindre (côté +x,
 * visible depuis la droite de la moto), légèrement au-dessus de la surface.
 */
function wrapDecal(scene: Scene, name: string, radius: number, length: number, arc: number): Mesh {
  const mesh = CreateCylinder(name, { diameter: radius * 2, height: length, arc, tessellation: 12, cap: Mesh.NO_CAP }, scene);
  // L'arc part de +x et tourne vers -z : on le recentre sur +x.
  mesh.rotation.y = -Math.PI * arc;
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

type Piece = [Mesh, PBRMaterial];

/** Fusionne les morceaux en un maillage unique (un sous-maillage par matériau). */
function assemble(name: string, pieces: Piece[]): Mesh {
  const byMaterial = new Map<PBRMaterial, Mesh[]>();
  for (const [mesh, mat] of pieces) {
    const list = byMaterial.get(mat) ?? [];
    list.push(mesh);
    byMaterial.set(mat, list);
  }
  const groups: Mesh[] = [];
  for (const [mat, list] of byMaterial) {
    const merged = list.length > 1 ? Mesh.MergeMeshes(list, true, true)! : list[0]!;
    merged.material = mat;
    groups.push(merged);
  }
  const mesh = groups.length > 1 ? Mesh.MergeMeshes(groups, true, true, undefined, false, true)! : groups[0]!;
  mesh.name = name;
  return mesh;
}

/** Point du tracé à une distance donnée depuis le début (et la tangente). */
function sampleAt(points: readonly Vector3[], distance: number): { point: Vector3; tangent: Vector3 } {
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Vector3.Distance(a, b);
    if (walked + seg >= distance || i === points.length - 1) {
      const k = seg > 0 ? Math.min((distance - walked) / seg, 1) : 0;
      return { point: Vector3.Lerp(a, b, k), tangent: b.subtract(a).normalize() };
    }
    walked += seg;
  }
  return { point: points[0]!.clone(), tangent: Vector3.Forward() };
}

/**
 * Pot de détente « passage haut » : bride de cylindre, collecteur, cône
 * divergent, ventre, cône convergent, queue. Cordons de soudure aux
 * jonctions, patte de fixation, autocollant de la marque sur le ventre.
 */
function createChamber(scene: Scene, def: PartDefinition, v: Extract<PartDefinition['visual'], { kind: 'chamber' }>): Mesh {
  const steel = materialFor(scene, v.color, v.metallic);
  const dark = materialFor(scene, [0.06, 0.06, 0.065], 0.4);
  const curve = Curve3.CreateCatmullRomSpline(CHAMBER_PATH.map((p) => Vector3.FromArray(p)), 8);
  const path = curve.getPoints();
  const total = curve.length();
  const radiusAt = (d: number): number => chamberRadius(v.belly, d / total);
  const pieces: Piece[] = [];

  pieces.push([CreateTube(`${def.id}-body`, { path, radiusFunction: (_i, d) => radiusAt(d), tessellation: 16, cap: Mesh.CAP_ALL }, scene), steel]);

  // Bride et ressorts de fixation sur le cylindre.
  const start = sampleAt(path, 0.004);
  pieces.push([orient(CreateCylinder(`${def.id}-flange`, { diameter: v.belly * 0.8 + 0.035, height: 0.012, tessellation: 16 }, scene), start.point, start.tangent), dark]);
  // Cordons de soudure aux jonctions des cônes.
  for (const t of [0.16, 0.46, 0.64, 0.86]) {
    const s = sampleAt(path, t * total);
    const ring = CreateTorus(`${def.id}-weld`, { diameter: chamberRadius(v.belly, t) * 2, thickness: 0.004, tessellation: 10 }, scene);
    pieces.push([orient(ring, s.point, s.tangent), steel]);
  }
  // Patte de fixation (silentbloc) côté cadre, sous le ventre.
  const mount = sampleAt(path, 0.55 * total);
  pieces.push([orient(CreateBox(`${def.id}-tab`, { width: 0.05, height: 0.03, depth: 0.012 }, scene), mount.point.add(new Vector3(-v.belly - 0.012, 0, 0)), mount.tangent), dark]);
  // Crochets de ressort près de la queue (la cartouche y est tenue par deux ressorts).
  const tail = sampleAt(path, 0.9 * total);
  for (const side of [-1, 1]) {
    const hook = CreateCylinder(`${def.id}-hook`, { diameter: 0.006, height: 0.03, tessellation: 6 }, scene);
    pieces.push([orient(hook, tail.point.add(new Vector3(0, side * (chamberRadius(v.belly, 0.9) + 0.008), 0)), Vector3.Right()), steel]);
  }

  if (v.decal) {
    const a = sampleAt(path, 0.47 * total);
    const b = sampleAt(path, 0.63 * total);
    const length = Vector3.Distance(a.point, b.point);
    const decal = wrapDecal(scene, `${def.id}-decal`, v.belly + 0.0015, length, 0.24);
    pieces.push([orient(decal, Vector3.Center(a.point, b.point), b.point.subtract(a.point)), decalMaterial(scene, v.decal)]);
  }
  return assemble(def.id, pieces);
}

/**
 * Cartouche (silencieux) : manchon d'entrée, embout avant, corps, colliers,
 * embout arrière, canule de sortie, patte de fixation, autocollant.
 * Construite le long de y, puis orientée vers l'arrière de la moto.
 */
function createSilencer(scene: Scene, def: PartDefinition, v: Extract<PartDefinition['visual'], { kind: 'silencer' }>): Mesh {
  const caps = materialFor(scene, v.caps, 0.85);
  const body = def.id.includes('racing') ? carbonMaterial(scene) : materialFor(scene, v.body, v.bodyMetallic);
  const rubber = materialFor(scene, [0.03, 0.03, 0.03], 0, 0.9);
  const L = v.length;
  const D = v.diameter;
  const capLength = 0.05;
  const pieces: Piece[] = [];
  const along = (mesh: Mesh, y: number): Mesh => {
    mesh.position.y = y;
    return mesh;
  };
  pieces.push([along(CreateCylinder(`${def.id}-sleeve`, { diameter: 0.034, height: 0.06, tessellation: 12 }, scene), 0.01), rubber]);
  pieces.push([along(CreateCylinder(`${def.id}-capf`, { diameterBottom: 0.04, diameterTop: D, height: capLength, tessellation: 18 }, scene), 0.04 + capLength / 2), caps]);
  const bodyLength = L - 2 * capLength;
  const bodyStart = 0.04 + capLength;
  pieces.push([along(CreateCylinder(`${def.id}-body`, { diameter: D, height: bodyLength, tessellation: 20 }, scene), bodyStart + bodyLength / 2), body]);
  for (const y of [bodyStart + 0.02, bodyStart + bodyLength - 0.02]) {
    pieces.push([along(CreateTorus(`${def.id}-clamp`, { diameter: D + 0.002, thickness: 0.007, tessellation: 12 }, scene), y), caps]);
  }
  const rearStart = bodyStart + bodyLength;
  pieces.push([along(CreateCylinder(`${def.id}-capr`, { diameterBottom: D, diameterTop: D * 0.72, height: capLength, tessellation: 18 }, scene), rearStart + capLength / 2), caps]);
  pieces.push([along(CreateCylinder(`${def.id}-tip`, { diameter: 0.03, height: 0.04, tessellation: 12 }, scene), rearStart + capLength + 0.012), caps]);
  // Patte de fixation vers le cadre arrière (au-dessus, côté intérieur).
  const tab = CreateBox(`${def.id}-tab`, { width: 0.012, height: 0.05, depth: 0.04 }, scene);
  tab.position.set(-D * 0.35, rearStart - 0.03, D * 0.45);
  pieces.push([tab, caps]);
  if (v.decal) {
    const decal = wrapDecal(scene, `${def.id}-decal`, D / 2 + 0.0015, bodyLength * 0.62, 0.3);
    pieces.push([along(decal, bodyStart + bodyLength / 2), decalMaterial(scene, v.decal)]);
  }
  const mesh = assemble(def.id, pieces);
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), Vector3.FromArray(SILENCER_DIRECTION), new Quaternion());
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

/**
 * Recalcule les volumes englobants du maillage ET de ses sous-maillages.
 * Indispensable après avoir figé une rotation dans les sommets d'un
 * maillage fusionné : sinon les sous-maillages gardent leurs anciens
 * volumes et le rayon de visée passe à travers la pièce (bug de la
 * cartouche impossible à viser).
 */
function refreshBounds(mesh: Mesh): void {
  mesh.refreshBoundingInfo();
  for (const subMesh of mesh.subMeshes ?? []) subMesh.refreshBoundingInfo();
}

// --- Haut moteur et périphériques ------------------------------------------

const CAST: Rgb = [0.6, 0.6, 0.62]; // alu de fonderie
const STEEL: Rgb = [0.85, 0.85, 0.87];
const RUBBER: Rgb = [0.03, 0.03, 0.03];

/** Piston Ø40 : jupe, segments, axe. */
function createPiston(scene: Scene, def: PartDefinition): Mesh {
  const alu = materialFor(scene, CAST, 0.85);
  const dark = materialFor(scene, [0.12, 0.12, 0.13], 0.9);
  const pieces: Piece[] = [[CreateCylinder(`${def.id}-skirt`, { diameter: 0.04, height: 0.04, tessellation: 20 }, scene), alu]];
  for (const y of [0.013, 0.006]) {
    const ring = CreateTorus(`${def.id}-ring`, { diameter: 0.0402, thickness: 0.0016, tessellation: 10 }, scene);
    ring.position.y = y;
    pieces.push([ring, dark]);
  }
  pieces.push([rod(scene, `${def.id}-pin`, v3(-0.021, -0.006, 0), v3(0.021, -0.006, 0), 0.01, 10), materialFor(scene, STEEL, 1)]);
  return assemble(def.id, pieces);
}

/** Cylindre 2T refroidi par eau : fût, embase, plan de joint, goujons, lumière d'échappement. */
function createCylinderBlock(scene: Scene, def: PartDefinition): Mesh {
  const alu = materialFor(scene, CAST, 0.8);
  const steel = materialFor(scene, STEEL, 1);
  const pieces: Piece[] = [
    [box(scene, 'body', v3(0, 0, 0), 0.115, 0.12, 0.115), alu],
    [box(scene, 'base', v3(0, -0.064, 0), 0.13, 0.012, 0.13), alu],
    [box(scene, 'deck', v3(0, 0.0625, 0), 0.12, 0.005, 0.12), materialFor(scene, [0.75, 0.75, 0.77], 0.9)],
    // Lumière d'échappement (vers l'avant) avec ses goujons de bride.
    [rod(scene, 'port', v3(0, -0.03, 0.05), v3(0, -0.03, 0.072), 0.045, 16), alu],
    // Boîte à clapets (admission, à l'arrière).
    [box(scene, 'reed', v3(0, -0.048, -0.066), 0.07, 0.045, 0.02), alu],
    // Sortie de liquide de refroidissement.
    [rod(scene, 'coolant', v3(0.058, 0.03, 0.02), v3(0.074, 0.03, 0.02), 0.012, 8), alu],
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) pieces.push([rod(scene, 'stud', v3(sx * 0.047, -0.06, sz * 0.047), v3(sx * 0.047, 0.072, sz * 0.047), 0.008, 6), steel]);
    pieces.push([rod(scene, 'port-stud', v3(sx * 0.03, -0.03, 0.07), v3(sx * 0.03, -0.03, 0.08), 0.006, 6), steel]);
  }
  return assemble(def.id, pieces);
}

/** Culasse : semelle, dôme, écrous, puits de bougie, sortie d'eau. */
function createCylinderHead(scene: Scene, def: PartDefinition): Mesh {
  const alu = materialFor(scene, [0.72, 0.72, 0.74], 0.85);
  const steel = materialFor(scene, STEEL, 1);
  const pieces: Piece[] = [
    [box(scene, 'plate', v3(0, -0.006, 0), 0.122, 0.034, 0.122), alu],
    [CreateCylinder('dome', { diameterBottom: 0.1, diameterTop: 0.05, height: 0.022, tessellation: 24 }, scene), alu],
    [rod(scene, 'boss', v3(0, 0.02, 0), v3(0, 0.028, 0), 0.03, 16), alu],
    [pipe(scene, 'outlet', [v3(0.03, 0.012, 0.03), v3(0.035, 0.03, 0.035), v3(0.035, 0.035, 0.05)], 0.006, 8), alu],
  ];
  pieces[1]![0].position.y = 0.021;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) pieces.push([rod(scene, 'nut', v3(sx * 0.047, 0.011, sz * 0.047), v3(sx * 0.047, 0.022, sz * 0.047), 0.013, 6), steel]);
  }
  return assemble(def.id, pieces);
}

/** Bougie : filetage, six-pans, isolant céramique à ailettes, borne. */
function createSparkPlug(scene: Scene, def: PartDefinition): Mesh {
  const steel = materialFor(scene, STEEL, 1);
  const ceramic = materialFor(scene, [0.94, 0.93, 0.9], 0, 0.25);
  const pieces: Piece[] = [
    [rod(scene, 'thread', v3(0, -0.03, 0), v3(0, -0.014, 0), 0.012, 12), steel],
    [rod(scene, 'hex', v3(0, -0.014, 0), v3(0, -0.003, 0), 0.02, 6), steel],
    [rod(scene, 'insulator', v3(0, -0.003, 0), v3(0, 0.024, 0), 0.0115, 14, 0.0085), ceramic],
    [rod(scene, 'terminal', v3(0, 0.024, 0), v3(0, 0.03, 0), 0.006, 8), steel],
  ];
  for (const y of [0.004, 0.01, 0.016]) {
    const rib = CreateTorus('rib', { diameter: 0.0105 - (y - 0.004) * 0.08, thickness: 0.002, tessellation: 8 }, scene);
    rib.position.y = y;
    pieces.push([rib, ceramic]);
  }
  return assemble(def.id, pieces);
}

/** Carburateur : corps, boisseau, chapeau, cuve, pipe d'admission, manchon de filtre. */
function createCarburetor(scene: Scene, def: PartDefinition, v: Extract<PartDefinition['visual'], { kind: 'carburetor' }>): Mesh {
  const k = v.scale;
  const body = materialFor(scene, v.body, 0.85);
  const cap = materialFor(scene, v.cap, 0.8);
  const rubber = materialFor(scene, RUBBER, 0, 0.85);
  const pieces: Piece[] = [
    [box(scene, 'body', v3(0, 0, 0), 0.042 * k, 0.045 * k, 0.05 * k), body],
    [rod(scene, 'tower', v3(0, 0.02 * k, 0), v3(0, 0.05 * k, 0), 0.036 * k, 16), body],
    [rod(scene, 'cap', v3(0, 0.05 * k, 0), v3(0, 0.058 * k, 0), 0.04 * k, 16), cap],
    [rod(scene, 'bowl', v3(0, -0.022 * k, 0), v3(0, -0.05 * k, 0), 0.04 * k, 16), body],
    [rod(scene, 'choke', v3(-0.02 * k, 0.01, 0.005), v3(-0.035 * k, 0.012, 0.005), 0.008, 8), cap],
    // Pipe d'admission vers la boîte à clapets du cylindre (avant).
    [pipe(scene, 'manifold', [v3(0, 0, 0.022), v3(0.01, 0, 0.09), v3(0.03, 0, 0.165)], 0.016 * k, 12), rubber],
    // Manchon vers la boîte à air (arrière, en montant).
    [pipe(scene, 'boot', [v3(0, 0, -0.022), v3(0.01, 0.04, -0.07), v3(0.025, 0.11, -0.12)], 0.019 * k, 12), rubber],
  ];
  return assemble(def.id, pieces);
}

/** Boîte à air sous la selle (avec le filtre en mousse dedans) et sa prise d'air. */
function createAirbox(scene: Scene, def: PartDefinition): Mesh {
  const plastic = materialFor(scene, [0.04, 0.04, 0.045], 0, 0.7);
  const foam = materialFor(scene, [0.75, 0.25, 0.08], 0, 0.95);
  const pieces: Piece[] = [
    [box(scene, 'box', v3(0, 0, 0), 0.13, 0.11, 0.16), plastic],
    [box(scene, 'lid', v3(0, 0.06, 0), 0.136, 0.012, 0.166), plastic],
    [rod(scene, 'snorkel', v3(0, 0.03, -0.08), v3(0, 0.045, -0.12), 0.05, 14), plastic],
    // Le bord orange du filtre en mousse dépasse sous le couvercle.
    [box(scene, 'foam', v3(0, 0.051, 0), 0.128, 0.006, 0.158), foam],
    [box(scene, 'clip', v3(0.066, 0.05, 0.05), 0.006, 0.03, 0.02), materialFor(scene, STEEL, 1)],
  ];
  return assemble(def.id, pieces);
}

/**
 * Boîtier CDI, monté debout contre le réservoir d'huile (face plate côté
 * +x, ailettes vers l'extérieur -x) : boîtier, ailettes, connecteur, fils,
 * pattes de fixation.
 */
function createCdi(scene: Scene, def: PartDefinition, v: Extract<PartDefinition['visual'], { kind: 'cdi' }>): Mesh {
  const shell = materialFor(scene, v.color, 0.2, 0.45);
  const steel = materialFor(scene, STEEL, 1);
  const pieces: Piece[] = [
    [box(scene, 'case', v3(0, 0, 0), 0.028, 0.065, 0.085), shell],
    [box(scene, 'plug', v3(0.002, -0.012, -0.05), 0.02, 0.035, 0.015), materialFor(scene, [0.9, 0.9, 0.86], 0, 0.5)],
  ];
  for (let i = 0; i < 4; i++) pieces.push([box(scene, 'fin', v3(-0.017, -0.024 + i * 0.016, 0.005), 0.006, 0.004, 0.07), shell]);
  for (const sy of [-1, 1]) pieces.push([box(scene, 'tab', v3(0.012, sy * 0.04, 0.03), 0.003, 0.016, 0.016), steel]);
  const wire = materialFor(scene, RUBBER, 0, 0.5);
  for (let i = 0; i < 3; i++) {
    pieces.push([pipe(scene, 'wire', [v3(0.002, -0.02 + i * 0.01, -0.057), v3(0.004, -0.03 + i * 0.008, -0.07), v3(0.008, -0.055 + i * 0.006, -0.08)], 0.0018, 6, 4), wire]);
  }
  return assemble(def.id, pieces);
}

/** Crée le modèle d'une pièce (origine = point d'ancrage). */
export function createPartMesh(scene: Scene, def: PartDefinition): Mesh {
  const v = def.visual;
  let mesh: Mesh;
  switch (v.kind) {
    case 'box':
      mesh = CreateBox(def.id, { width: v.size[0], height: v.size[1], depth: v.size[2] }, scene);
      mesh.material = materialFor(scene, v.color, v.metallic ?? 0);
      break;
    case 'cylinder':
      mesh = CreateCylinder(def.id, { diameter: v.diameter, height: v.height, tessellation: 16 }, scene);
      if (v.axis === 'x') mesh.rotation.z = Math.PI / 2;
      if (v.axis === 'z') mesh.rotation.x = Math.PI / 2;
      mesh.material = materialFor(scene, v.color, v.metallic ?? 0);
      // Fige la rotation dans la géométrie : la pièce garde son orientation partout.
      mesh.bakeCurrentTransformIntoVertices();
      break;
    case 'chamber':
      mesh = createChamber(scene, def, v);
      break;
    case 'silencer':
      mesh = createSilencer(scene, def, v);
      break;
    case 'piston':
      mesh = createPiston(scene, def);
      break;
    case 'cylinderBlock':
      mesh = createCylinderBlock(scene, def);
      break;
    case 'cylinderHead':
      mesh = createCylinderHead(scene, def);
      break;
    case 'sparkPlug':
      mesh = createSparkPlug(scene, def);
      break;
    case 'carburetor':
      mesh = createCarburetor(scene, def, v);
      break;
    case 'airbox':
      mesh = createAirbox(scene, def);
      break;
    case 'cdi':
      mesh = createCdi(scene, def, v);
      break;
  }
  refreshBounds(mesh);
  mesh.receiveShadows = true;
  return mesh;
}
