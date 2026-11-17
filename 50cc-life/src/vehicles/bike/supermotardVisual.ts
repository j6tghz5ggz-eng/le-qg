/**
 * Modèle 3D détaillé du supermotard 50 (VARONE SMX 50, modèle fictif),
 * construit en code. Le haut moteur (cylindre, culasse, bougie, pot,
 * cartouche, carburateur, filtre, CDI) n'est PAS ici : ce sont des pièces
 * démontables ajoutées par le système de mécanique.
 *
 * Organisation des nœuds (voir BikeVisual) :
 *   root ─┬─ cadre, moteur, plastiques, selle, amortisseur, éclairage
 *         ├─ swingarm (bras oscillant + chaîne + étrier AR) → pivote avec la suspension
 *         ├─ steer (fourche inversée, tés, guidon, leviers, rétros, masque)
 *         │    └─ front.mount (tubes plongeurs, pieds de fourche, étrier, garde-boue)
 *         │         └─ front.spin (roue à rayons, disque)
 *         ├─ rear.mount → rear.spin (roue, disque, couronne)
 *         ├─ stand (béquille)
 *         └─ eye (yeux du pilote)
 *
 * Repère : x = droite, y = haut (0 = hauteur des axes de roue), z = avant.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { BikeVisual, WheelVisual } from './BikeVisual';
import { licensePlateMaterial, maskMaterial, panelMaterial, radiatorMaterial, shroudMaterial } from './bikeGraphics';
import type { BikeSpec } from './specs';
import { MeshBin, between, block, box, coil, facePlate, latheX, pipe, plate, rod, sweep, v3, waveDisc, type Surface } from '../../core/rendering/meshKit';

type Key =
  | 'paint'
  | 'white'
  | 'frame'
  | 'plastic'
  | 'alu'
  | 'anodized'
  | 'steel'
  | 'disc'
  | 'rubber'
  | 'seat'
  | 'engine'
  | 'spring'
  | 'caliper'
  | 'chain'
  | 'glass'
  | 'light'
  | 'tail'
  | 'amber'
  | 'shroud'
  | 'panel'
  | 'mask'
  | 'plate'
  | 'radiator';

function pbr(scene: Scene, name: string, roughness: number, metallic: number): PBRMaterial {
  const mat = new PBRMaterial(`sm-${name}`, scene);
  mat.albedoColor = Color3.White(); // la teinte vient des sommets
  mat.roughness = roughness;
  mat.metallic = metallic;
  return mat;
}

/**
 * Familles de surfaces (un matériau chacune) et teinte de chaque surface.
 * Les feux sont « sans éclairage » : ils paraissent allumés.
 */
function createPalette(scene: Scene): Record<Key, Surface> {
  const chrome = pbr(scene, 'chrome', 0.15, 1);
  const metal = pbr(scene, 'metal', 0.36, 1);
  const gloss = pbr(scene, 'gloss', 0.26, 0);
  const matte = pbr(scene, 'matte', 0.75, 0);
  const lamp = pbr(scene, 'lamp', 1, 0);
  lamp.unlit = true;
  const c = (r: number, g: number, b: number): Color3 => new Color3(r, g, b);
  return {
    paint: { shared: gloss, color: c(0.95, 0.68, 0.02) },
    white: { shared: gloss, color: c(0.9, 0.9, 0.88) },
    spring: { shared: gloss, color: c(0.78, 0.06, 0.04) },
    // Cadre acier peint en noir brillant (style des 50 SM récentes).
    frame: { shared: gloss, color: c(0.025, 0.025, 0.03) },
    alu: { shared: metal, color: c(0.8, 0.8, 0.82) },
    anodized: { shared: metal, color: c(0.06, 0.06, 0.07) },
    disc: { shared: metal, color: c(0.6, 0.6, 0.62) },
    engine: { shared: metal, color: c(0.52, 0.53, 0.55) },
    caliper: { shared: metal, color: c(0.75, 0.52, 0.08) },
    chain: { shared: metal, color: c(0.2, 0.2, 0.21) },
    steel: { shared: chrome, color: c(0.88, 0.88, 0.9) },
    glass: { shared: chrome, color: c(0.92, 0.94, 0.97) },
    plastic: { shared: matte, color: c(0.03, 0.03, 0.035) },
    rubber: { shared: matte, color: c(0.028, 0.028, 0.028) },
    seat: { shared: matte, color: c(0.035, 0.035, 0.04) },
    light: { shared: lamp, color: c(1, 0.97, 0.88) },
    tail: { shared: lamp, color: c(0.85, 0.04, 0.03) },
    amber: { shared: lamp, color: c(1, 0.55, 0.05) },
    shroud: { material: shroudMaterial(scene) },
    panel: { material: panelMaterial(scene) },
    mask: { material: maskMaterial(scene) },
    plate: { material: licensePlateMaterial(scene) },
    radiator: { material: radiatorMaterial(scene) },
  };
}

/** Place un maillage (pièces tournées construites autour de l'axe x). */
function at(mesh: Mesh, x: number, y: number, z: number): Mesh {
  mesh.position.set(x, y, z);
  return mesh;
}

/** Portion de cylindre (garde-boue, masque) : arc centré sur +x, axe y. */
function arcShell(scene: Scene, name: string, radius: number, height: number, arc: number): Mesh {
  const mesh = CreateCylinder(name, { diameter: radius * 2, height, arc, tessellation: 24, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }, scene);
  mesh.rotation.y = -Math.PI * arc;
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

interface WheelOptions {
  readonly tireRadius: number;
  readonly tireWidth: number;
  readonly rimWidth: number;
  readonly hubWidth: number;
  /** Disque « pétale » : plan x, rayons, nombre d'ondulations. */
  readonly disc: { readonly x: number; readonly outer: number; readonly inner: number; readonly waves: number };
  readonly sprocket?: { readonly x: number; readonly radius: number; readonly teeth: number };
}

/** Roue à rayons 17 pouces : pneu profilé, jante, moyeu, 36 rayons, disque (et couronne). */
function spokedWheel(scene: Scene, name: string, o: WheelOptions, bin: MeshBin<Key>): void {
  const R = o.tireRadius;
  const w = o.tireWidth;
  const rimR = 0.216;
  // Pneu : talons sur la jante, flancs bombés, bande de roulement arrondie.
  const tire: Array<[number, number]> = [
    [rimR - 0.004, -w * 0.38],
    [rimR + 0.016, -w * 0.5],
    [R - 0.045, -w * 0.52],
    [R - 0.019, -w * 0.44],
    [R - 0.005, -w * 0.28],
    [R, -w * 0.1],
    [R, w * 0.1],
    [R - 0.005, w * 0.28],
    [R - 0.019, w * 0.44],
    [R - 0.045, w * 0.52],
    [rimR + 0.016, w * 0.5],
    [rimR - 0.004, w * 0.38],
  ];
  bin.add('rubber', latheX(scene, `${name}-tire`, tire, 36));
  const rw = o.rimWidth / 2;
  bin.add(
    'anodized',
    latheX(
      scene,
      `${name}-rim`,
      [
        [rimR + 0.006, -rw],
        [rimR - 0.002, -rw + 0.004],
        [rimR - 0.01, -rw + 0.008],
        [rimR - 0.016, -rw + 0.012],
        [rimR - 0.02, -rw * 0.2],
        [rimR - 0.02, rw * 0.2],
        [rimR - 0.016, rw - 0.012],
        [rimR - 0.01, rw - 0.008],
        [rimR - 0.002, rw - 0.004],
        [rimR + 0.006, rw],
      ],
      32,
      true,
    ),
  );
  const hw = o.hubWidth / 2;
  bin.add(
    'alu',
    latheX(
      scene,
      `${name}-hub`,
      [
        [0.012, -hw],
        [0.045, -hw],
        [0.06, -hw + 0.004],
        [0.06, -hw + 0.012],
        [0.04, -hw + 0.016],
        [0.034, 0],
        [0.04, hw - 0.016],
        [0.06, hw - 0.012],
        [0.06, hw - 0.004],
        [0.045, hw],
        [0.012, hw],
      ],
      20,
    ),
  );
  // Rayons croisés, alternés à gauche et à droite.
  const spokes: Mesh[] = [];
  for (let i = 0; i < 36; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const a = (i / 36) * Math.PI * 2;
    const b = a + (i % 4 < 2 ? 0.32 : -0.32);
    const from = v3(side * (hw - 0.008), 0.056 * Math.cos(a), 0.056 * Math.sin(a));
    const to = v3(side * 0.012, (rimR - 0.018) * Math.cos(b), (rimR - 0.018) * Math.sin(b));
    spokes.push(rod(scene, `${name}-spoke`, from, to, 0.0038, 4));
  }
  bin.add('steel', ...spokes);
  // Disque « pétale » flottant : piste ondulée, rivets, étoile de fixation.
  const d = o.disc;
  bin.add('disc', waveDisc(scene, `${name}-disc`, d.x, d.inner, d.outer, d.waves, 0.008));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    bin.add('steel', rod(scene, `${name}-rivet`, v3(d.x - 0.004, (d.inner - 0.004) * Math.cos(a), (d.inner - 0.004) * Math.sin(a)), v3(d.x + 0.004, (d.inner - 0.004) * Math.cos(a), (d.inner - 0.004) * Math.sin(a)), 0.008, 6));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const carrier = box(scene, `${name}-carrier`, v3(d.x, ((0.045 + d.inner) / 2) * Math.cos(a), ((0.045 + d.inner) / 2) * Math.sin(a)), 0.006, d.inner - 0.04, 0.014, a);
    bin.add('alu', carrier);
  }
  if (o.sprocket) {
    const s = o.sprocket;
    bin.add(
      'alu',
      latheX(
        scene,
        `${name}-sprocket`,
        [
          [0.055, s.x - 0.003],
          [s.radius, s.x - 0.003],
          [s.radius, s.x + 0.003],
          [0.055, s.x + 0.003],
        ],
        32,
        true,
      ),
    );
    const teeth: Mesh[] = [];
    for (let i = 0; i < s.teeth; i++) {
      const a = (i / s.teeth) * Math.PI * 2;
      teeth.push(box(scene, `${name}-tooth`, v3(s.x, (s.radius + 0.004) * Math.cos(a), (s.radius + 0.004) * Math.sin(a)), 0.006, 0.009, 0.006, a));
    }
    bin.add('alu', ...teeth);
  }
}

export function createSupermotardVisual(scene: Scene, spec: BikeSpec): BikeVisual {
  const m = createPalette(scene);
  const root = new TransformNode('bike-visual', scene);
  const half = spec.wheelBase / 2;
  const meshes: Mesh[] = [];
  const sides = [-1, 1] as const;

  // ===================== Cadre, moteur, carrosserie (fixes) =====================
  const frame = new MeshBin<Key>();
  const head = v3(0, 0.8, half - 0.2); // tête de fourche (pivot de direction)
  const pivot = v3(0, 0.2, -0.13); // axe du bras oscillant

  // Cadre périmétrique en acier : colonne, longerons, berceau, boucle arrière.
  frame.add('frame', rod(scene, 'headtube', v3(0, 0.88, head.z + 0.025), v3(0, 0.69, head.z - 0.022), 0.056, 16));
  for (const s of sides) {
    frame.add(
      'frame',
      pipe(scene, 'spar', [v3(s * 0.03, 0.83, head.z), v3(s * 0.105, 0.76, 0.36), v3(s * 0.12, 0.62, 0.12), v3(s * 0.115, 0.47, -0.06), v3(s * 0.1, 0.3, -0.12)], 0.022),
      pipe(scene, 'cradle', [v3(0, 0.3, 0.33), v3(s * 0.05, 0.15, 0.3), v3(s * 0.06, -0.04, 0.18), v3(s * 0.065, -0.07, 0), v3(s * 0.08, 0.05, -0.11), v3(s * 0.1, 0.14, -0.13)], 0.015),
      pipe(scene, 'rail', [v3(s * 0.115, 0.55, -0.04), v3(s * 0.1, 0.6, -0.35), v3(s * 0.075, 0.63, -0.74)], 0.012),
      pipe(scene, 'stay', [v3(s * 0.1, 0.32, -0.12), v3(s * 0.09, 0.47, -0.35), v3(s * 0.078, 0.61, -0.6)], 0.011),
      box(scene, 'pivot-plate', v3(s * 0.1, 0.22, -0.13), 0.03, 0.2, 0.11),
    );
    // Repose-pieds crantés et leurs supports.
    frame.add('steel', box(scene, 'peg', v3(s * 0.175, 0.07, -0.13), 0.11, 0.022, 0.045));
    frame.add('frame', block(scene, 'peg-mount', v3(s * 0.1, 0.1, -0.13), v3(s * 0.13, 0.07, -0.13), 0.03, 0.03));
  }
  frame.add('frame', pipe(scene, 'downtube', [v3(0, 0.7, head.z - 0.02), v3(0, 0.5, 0.4), v3(0, 0.3, 0.33)], 0.02));
  frame.add('frame', box(scene, 'subframe-cross', v3(0, 0.62, -0.52), 0.17, 0.02, 0.03));
  frame.add('steel', rod(scene, 'pivot-bolt', v3(-0.125, 0.2, -0.13), v3(0.125, 0.2, -0.13), 0.022, 10));

  // Bas moteur : carters, couvercles d'embrayage et d'allumage, pompe à eau.
  // (Les pièces tournées sont construites autour de l'axe x passant par l'origine : on les place.)
  frame.add('engine', box(scene, 'case', v3(0, 0.06, 0.02), 0.15, 0.18, 0.3));
  frame.add('engine', at(latheX(scene, 'crank', [[0, -0.08], [0.098, -0.08], [0.104, -0.07], [0.104, 0.07], [0.098, 0.08], [0, 0.08]], 28), 0, 0.08, 0.1));
  frame.add('engine', at(latheX(scene, 'gearbox', [[0, -0.075], [0.075, -0.075], [0.08, -0.065], [0.08, 0.065], [0.075, 0.075], [0, 0.075]], 24), 0, 0.02, -0.12));
  frame.add('engine', at(latheX(scene, 'clutch-cover', [[0, 0.07], [0.095, 0.07], [0.095, 0.108], [0.085, 0.124], [0.045, 0.13], [0, 0.131]], 28), 0, 0.04, -0.03));
  frame.add('engine', at(latheX(scene, 'ignition-cover', [[0, -0.07], [0.075, -0.07], [0.075, -0.102], [0.064, -0.114], [0, -0.117]], 24), 0, 0.1, 0.1));
  frame.add('engine', at(latheX(scene, 'pump', [[0, 0.1], [0.03, 0.1], [0.03, 0.138], [0.022, 0.146], [0, 0.147]], 16), 0, 0.14, 0.03));
  // Vis des couvercles.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    frame.add('steel', rod(scene, 'cover-bolt', v3(0.124, 0.04 + 0.082 * Math.cos(a), -0.03 + 0.082 * Math.sin(a)), v3(0.134, 0.04 + 0.082 * Math.cos(a), -0.03 + 0.082 * Math.sin(a)), 0.009, 6));
  }

  // Leviers : sélecteur (gauche), kick et frein arrière (droite).
  frame.add('steel', pipe(scene, 'shifter', [v3(-0.085, 0.07, -0.1), v3(-0.12, 0.06, -0.03), v3(-0.13, 0.08, 0.045)], 0.007, 6));
  frame.add('rubber', rod(scene, 'shifter-toe', v3(-0.125, 0.085, 0.048), v3(-0.19, 0.085, 0.048), 0.017, 8));
  frame.add('steel', pipe(scene, 'kick', [v3(0.135, 0.1, -0.09), v3(0.142, 0.15, -0.17), v3(0.15, 0.2, -0.24)], 0.009, 6));
  frame.add('rubber', rod(scene, 'kick-pedal', v3(0.148, 0.2, -0.24), v3(0.21, 0.2, -0.24), 0.02, 8));
  frame.add('steel', pipe(scene, 'brake-pedal', [v3(0.11, 0.09, -0.13), v3(0.13, 0.062, -0.03), v3(0.14, 0.062, 0.06)], 0.007, 6));
  frame.add('steel', box(scene, 'brake-pad', v3(0.15, 0.066, 0.07), 0.035, 0.012, 0.03));
  // Pignon de sortie de boîte (la chaîne part d'ici).
  frame.add('steel', at(latheX(scene, 'pinion', [[0.012, -0.088], [0.036, -0.088], [0.036, -0.08], [0.012, -0.08]], 14, true), 0, 0.06, -0.1));

  // Radiateur (entre les écopes) et durites vers la culasse et la pompe.
  frame.add('radiator', box(scene, 'radiator', v3(0, 0.52, 0.36), 0.2, 0.2, 0.035, -0.12));
  frame.add('plastic', box(scene, 'radiator-frame', v3(0, 0.52, 0.355), 0.215, 0.215, 0.025, -0.12));
  frame.add('rubber', pipe(scene, 'hose-top', [v3(0.07, 0.6, 0.35), v3(0.05, 0.55, 0.26), v3(0.03, 0.44, 0.17)], 0.011, 8));
  frame.add('rubber', pipe(scene, 'hose-low', [v3(0.08, 0.43, 0.35), v3(0.11, 0.3, 0.25), v3(0.125, 0.15, 0.06)], 0.011, 8));

  // Amortisseur arrière : corps, bonbonne, tige, ressort rouge.
  const shockTop = v3(0, 0.56, -0.17);
  const shockLow = v3(0, 0.25, -0.34);
  const shockDir = shockLow.subtract(shockTop);
  frame.add('anodized', rod(scene, 'shock-body', shockTop, shockTop.add(shockDir.scale(0.45)), 0.045, 14));
  frame.add('alu', rod(scene, 'shock-reservoir', v3(0.04, 0.55, -0.16), v3(0.04, 0.47, -0.2), 0.035, 12));
  frame.add('steel', rod(scene, 'shock-rod', shockTop.add(shockDir.scale(0.4)), shockLow, 0.014, 8));
  frame.add('spring', between(coil(scene, 'shock-spring', 0.031, 0.0055, shockDir.length() * 0.62, 8), shockTop.add(shockDir.scale(0.22)), shockLow));
  for (const p of [shockTop, shockLow]) frame.add('steel', rod(scene, 'shock-eye', p.add(v3(-0.025, 0, 0)), p.add(v3(0.025, 0, 0)), 0.026, 10));

  // Réservoir (sous les écopes), bouchon.
  frame.add(
    'paint',
    sweep(
      scene,
      'tank',
      [[-0.12, 0], [-0.12, 0.06], [-0.1, 0.12], [-0.05, 0.15], [0.05, 0.15], [0.1, 0.12], [0.12, 0.06], [0.12, 0]],
      [v3(0, 0.64, 0.42), v3(0, 0.63, 0.22), v3(0, 0.6, 0.02)],
      (t) => [t < 0.4 ? 0.75 + t * 0.6 : 1 - (t - 0.4) * 0.3, t < 0.4 ? 0.9 + t * 0.25 : 1 - (t - 0.4) * 0.5],
    ),
  );
  frame.add('alu', rod(scene, 'fuel-cap', v3(0, 0.775, 0.3), v3(0, 0.792, 0.3), 0.058, 16));
  frame.add('plastic', rod(scene, 'fuel-vent', v3(0, 0.792, 0.3), v3(0.03, 0.83, 0.26), 0.006, 6));

  // Sabot moteur en alu (protège le bas moteur et le berceau).
  frame.add('alu', block(scene, 'skid', v3(0, -0.105, 0.3), v3(0, -0.105, -0.09), 0.17, 0.008));
  frame.add('alu', block(scene, 'skid-nose', v3(0, -0.1, 0.3), v3(0, 0.02, 0.36), 0.15, 0.008));
  for (const s of sides) frame.add('alu', block(scene, 'skid-wing', v3(s * 0.088, -0.07, 0.26), v3(s * 0.088, -0.07, -0.06), 0.008, 0.07));

  // Garde-boue intérieur (protège l'amortisseur des projections).
  frame.add(
    'plastic',
    sweep(scene, 'inner-guard', [[-0.065, 0], [-0.065, 0.012], [0.065, 0.012], [0.065, 0]], [v3(0, 0.53, -0.37), v3(0, 0.44, -0.42), v3(0, 0.32, -0.45)]),
  );

  // Selle longue et plate, qui remonte sur le réservoir.
  frame.add(
    'seat',
    sweep(
      scene,
      'seat',
      [[-0.12, 0], [-0.12, 0.04], [-0.09, 0.075], [0, 0.085], [0.09, 0.075], [0.12, 0.04], [0.12, 0]],
      [v3(0, 0.73, 0.27), v3(0, 0.665, 0.08), v3(0, 0.645, -0.25), v3(0, 0.65, -0.62)],
      (t) => [Math.min(0.55 + t * 2.2, 1) * (t > 0.85 ? 1 - (t - 0.85) * 1.5 : 1), t < 0.1 ? 0.6 + t * 4 : 1],
    ),
  );

  // Garde-boue arrière relevé (blanc), feu, plaque, clignotants.
  frame.add(
    'white',
    sweep(
      scene,
      'tail',
      [[-0.09, 0], [-0.095, 0.022], [-0.06, 0.034], [0, 0.038], [0.06, 0.034], [0.095, 0.022], [0.09, 0]],
      [v3(0, 0.6, -0.5), v3(0, 0.655, -0.8), v3(0, 0.74, -1.06)],
      (t) => [1 - t * 0.35, 1 - t * 0.4],
    ),
  );
  frame.add('tail', box(scene, 'tail-light', v3(0, 0.712, -1.0), 0.08, 0.03, 0.05, 0.35));
  frame.add('plastic', block(scene, 'plate-hanger', v3(0, 0.7, -0.98), v3(0, 0.6, -1.03), 0.04, 0.008));
  // Plaque inclinée vers le haut, comme en vrai.
  frame.add('plastic', box(scene, 'plate-back', v3(0, 0.56, -1.035), 0.19, 0.145, 0.006, 0.25));
  const plateMesh = CreatePlane('plate', { width: 0.18, height: 0.115 }, scene);
  plateMesh.position.set(0, 0.56, -1.04);
  plateMesh.rotation.x = 0.25;
  frame.add('plate', plateMesh);
  for (const s of sides) {
    frame.add('plastic', rod(scene, 'blinker-stalk', v3(s * 0.035, 0.665, -0.99), v3(s * 0.11, 0.665, -0.99), 0.008, 6));
    frame.add('amber', rod(scene, 'blinker', v3(s * 0.1, 0.665, -0.99), v3(s * 0.14, 0.665, -0.99), 0.024, 10, 0.016));
  }

  // Plastiques découpés avec leur déco : écopes et caches latéraux.
  for (const s of sides) {
    frame.add(
      'shroud',
      // Écopes anguleuses qui descendent en pointe devant le moteur.
      plate(scene, 'shroud', [[0.22, 0.795], [0.37, 0.82], [0.53, 0.78], [0.565, 0.62], [0.52, 0.47], [0.43, 0.33], [0.36, 0.35], [0.25, 0.52]], s * 0.152, 0.08),
    );
    // Caches latéraux longs, qui filent jusqu'au garde-boue arrière.
    frame.add('panel', plate(scene, 'panel', [[-0.15, 0.635], [-0.5, 0.66], [-0.76, 0.69], [-0.72, 0.6], [-0.52, 0.48], [-0.32, 0.41], [-0.17, 0.44]], s * 0.135, 0.05));
  }

  meshes.push(...frame.merge('bike-frame', root, m));

  // ===================== Bras oscillant (pivote) =====================
  const swingNode = new TransformNode('bike-swingarm', scene);
  swingNode.parent = root;
  swingNode.position.copyFrom(pivot);
  const hubRel = v3(0, -pivot.y, -half - pivot.z); // moyeu AR dans le repère du pivot
  const arm = new MeshBin<Key>();
  for (const s of sides) {
    arm.add('alu', block(scene, 'arm', v3(s * 0.095, 0, -0.02), v3(s * 0.095, hubRel.y, hubRel.z - 0.03), 0.034, 0.058));
    arm.add('alu', block(scene, 'arm-brace', v3(s * 0.095, -0.03, -0.06), v3(s * 0.095, hubRel.y * 0.85, hubRel.z * 0.8), 0.028, 0.02));
    arm.add('anodized', box(scene, 'adjuster', v3(s * 0.095, hubRel.y, hubRel.z), 0.04, 0.036, 0.06));
  }
  arm.add('alu', box(scene, 'arm-cross', v3(0, -0.02, -0.13), 0.19, 0.04, 0.04));
  arm.add('steel', rod(scene, 'arm-pivot', v3(-0.112, 0, 0), v3(0.112, 0, 0), 0.034, 12));
  arm.add('steel', rod(scene, 'axle', v3(-0.125, hubRel.y, hubRel.z), v3(0.125, hubRel.y, hubRel.z), 0.018, 8));
  arm.add('plastic', block(scene, 'chain-slider', v3(-0.095, 0.033, -0.02), v3(-0.095, -0.03, -0.26), 0.03, 0.016));
  // Chaîne (brins haut et bas) entre le pignon et la couronne.
  const pinion = v3(-0.075, 0.06 - pivot.y, -0.1 - pivot.z);
  const crown = 0.1;
  for (const [a, b] of [
    [pinion.add(v3(0, 0.037, 0)), v3(-0.075, hubRel.y + crown + 0.004, hubRel.z)],
    [pinion.add(v3(0, -0.037, 0)), v3(-0.075, hubRel.y - crown - 0.004, hubRel.z)],
  ] as const) {
    arm.add('chain', block(scene, 'chain', a, b, 0.012, 0.008));
  }
  // Étrier arrière (à droite) et sa patte.
  const rearCaliper = v3(0.062, hubRel.y - 0.051, hubRel.z + 0.068);
  arm.add('caliper', box(scene, 'caliper-r', rearCaliper, 0.034, 0.07, 0.04, 0.64));
  arm.add('anodized', block(scene, 'caliper-r-mount', v3(0.09, hubRel.y, hubRel.z), rearCaliper.add(v3(0.01, 0, 0)), 0.012, 0.03));
  meshes.push(...arm.merge('bike-swingarm', swingNode, m));

  // ===================== Avant : fourche inversée, guidon =====================
  const steer = new TransformNode('bike-steer', scene);
  steer.parent = root;
  steer.position.copyFrom(head);
  const hubLocal = v3(0, -head.y, half - head.z); // moyeu AV dans le repère de la direction
  const forkDown = hubLocal.normalizeToNew(); // le long des tubes, vers le bas
  const along = (x: number, k: number): Vector3 => v3(x, 0, 0).addInPlace(forkDown.scale(k));
  const tilt = Math.atan2(-forkDown.z, -forkDown.y); // inclinaison des tés (angle de chasse)
  const fork = new MeshBin<Key>();
  for (const s of sides) {
    fork.add('anodized', rod(scene, 'fork-outer', along(s * 0.085, -0.07), along(s * 0.085, 0.5), 0.052, 16));
    fork.add('alu', rod(scene, 'fork-cap', along(s * 0.085, -0.085), along(s * 0.085, -0.07), 0.04, 12));
    fork.add('alu', box(scene, 'clamp-bolt', along(s * 0.085, 0.12).addInPlace(v3(s * 0.035, 0, -0.03)), 0.02, 0.025, 0.02));
  }
  fork.add('alu', box(scene, 'top-clamp', along(0, -0.035), 0.24, 0.03, 0.075, tilt));
  fork.add('alu', box(scene, 'bottom-clamp', along(0, 0.12), 0.24, 0.035, 0.085, tilt));
  fork.add('steel', rod(scene, 'stem', along(0, -0.035), along(0, 0.12), 0.03, 10));
  // Cintre (guidon alu), pontets, mousse, poignées.
  const bar = (x: number): Vector3 => v3(x, 0.095 + Math.max(Math.abs(x) - 0.1, 0) * 0.2, -0.035 - Math.max(Math.abs(x) - 0.1, 0) * 0.17);
  for (const s of sides) fork.add('alu', box(scene, 'riser', v3(s * 0.035, 0.065, -0.025), 0.025, 0.035, 0.04));
  fork.add('alu', pipe(scene, 'handlebar', [bar(-0.4), bar(-0.25), bar(-0.1), bar(0.1), bar(0.25), bar(0.4)], 0.0125, 12));
  fork.add('plastic', box(scene, 'bar-pad', v3(0, 0.103, -0.035), 0.15, 0.032, 0.036));
  for (const s of sides) {
    fork.add('rubber', rod(scene, 'grip', bar(s * 0.275), bar(s * 0.41), 0.034, 12));
    fork.add('plastic', rod(scene, 'bar-end', bar(s * 0.41), bar(s * 0.42), 0.038, 12));
    // Levier (embrayage à gauche, frein à droite) et son support.
    fork.add('alu', box(scene, 'perch', bar(s * 0.2).addInPlace(v3(0, 0.012, 0.008)), 0.03, 0.028, 0.035));
    fork.add('alu', block(scene, 'lever', bar(s * 0.21).addInPlace(v3(0, 0.005, 0.03)), bar(s * 0.37).addInPlace(v3(0, 0.01, 0.045)), 0.016, 0.008));
    // Rétroviseurs.
    fork.add('steel', pipe(scene, 'mirror-stalk', [bar(s * 0.215).addInPlace(v3(0, 0.02, 0)), v3(s * 0.245, 0.24, -0.07), v3(s * 0.275, 0.33, -0.06)], 0.005, 6));
    const head3 = rod(scene, 'mirror', v3(s * 0.28, 0.35, -0.048), v3(s * 0.28, 0.35, -0.066), 0.085, 16);
    head3.scaling.x = 1.4;
    fork.add('plastic', head3);
    const glass = rod(scene, 'mirror-glass', v3(s * 0.28, 0.35, -0.0665), v3(s * 0.28, 0.35, -0.068), 0.075, 16);
    glass.scaling.x = 1.4;
    fork.add('glass', glass);
  }
  fork.add('plastic', rod(scene, 'throttle', bar(0.255), bar(0.275), 0.042, 12));
  fork.add('plastic', box(scene, 'switch', bar(-0.245).addInPlace(v3(0, 0.012, 0)), 0.03, 0.032, 0.04));
  fork.add('plastic', box(scene, 'reservoir', v3(0.17, 0.155, -0.065), 0.035, 0.03, 0.03));
  fork.add('rubber', pipe(scene, 'brake-hose', [v3(0.17, 0.14, -0.06), v3(0.06, 0.05, 0.06), along(-0.1, 0.2).addInPlace(v3(0, 0, 0.05)), along(-0.11, 0.48).addInPlace(v3(0, 0, 0.03))], 0.004, 6));
  // Compteur, masque avant avec phare, clignotants.
  fork.add('plastic', box(scene, 'dash', v3(0, 0.12, 0.025), 0.095, 0.05, 0.04, -0.5));
  fork.add('glass', box(scene, 'dash-screen', v3(0, 0.137, 0.012), 0.07, 0.03, 0.004, -0.5));
  // Masque avant anguleux (galbé, incliné) avec deux optiques LED en biais et un feu de jour.
  fork.add(
    'mask',
    facePlate(
      scene,
      'mask',
      [[0, -0.27], [0.075, -0.2], [0.125, -0.06], [0.13, 0.06], [0.1, 0.14], [0.04, 0.17], [-0.04, 0.17], [-0.1, 0.14], [-0.13, 0.06], [-0.125, -0.06], [-0.075, -0.2]],
      0.165,
      1.6,
      0.22,
    ),
  );
  fork.add('plastic', box(scene, 'light-housing', v3(0, 0.03, 0.135), 0.16, 0.085, 0.05));
  for (const s of sides) {
    fork.add('light', box(scene, 'led', v3(s * 0.042, 0.022, 0.163), 0.062, 0.03, 0.012, 0, 0, s * 0.28));
    fork.add('steel', box(scene, 'led-reflector', v3(s * 0.042, 0.022, 0.158), 0.07, 0.038, 0.006, 0, 0, s * 0.28));
    fork.add('amber', rod(scene, 'blinker-f', v3(s * 0.125, 0.06, 0.13), v3(s * 0.165, 0.06, 0.12), 0.02, 10, 0.014));
  }
  fork.add('light', box(scene, 'drl', v3(0, 0.075, 0.162), 0.12, 0.007, 0.008));
  // Protège-mains enveloppant les leviers (de la potence du levier au bout du guidon).
  for (const s of sides) {
    fork.add(
      'white',
      sweep(
        scene,
        'handguard',
        [[-0.003, -0.03], [0.003, -0.03], [0.003, 0.034], [-0.003, 0.034]],
        [bar(s * 0.235).addInPlace(v3(0, 0.015, 0.03)), v3(s * 0.31, 0.155, 0.075), v3(s * 0.4, 0.165, 0.055), bar(s * 0.43).addInPlace(v3(0, 0.005, 0.01))],
        (t) => [1, 0.75 + 0.5 * Math.sin(t * Math.PI)],
      ),
    );
  }
  meshes.push(...fork.merge('bike-fork', steer, m));

  // --- Partie mobile de la fourche : tubes plongeurs, pieds, étrier, garde-boue ---
  const frontMount = new TransformNode('bike-wheel-front', scene);
  const frontSpin = new TransformNode('bike-wheel-front-spin', scene);
  frontSpin.parent = frontMount;
  frontMount.parent = steer;
  frontMount.position.copyFrom(hubLocal);
  const lower = new MeshBin<Key>();
  const up = forkDown.scale(-1);
  for (const s of sides) {
    const foot = v3(s * 0.085, 0, 0);
    lower.add('steel', rod(scene, 'fork-inner', foot.add(up.scale(0.03)), foot.add(up.scale(0.42)), 0.04, 14));
    lower.add('anodized', rod(scene, 'fork-foot', foot.add(up.scale(-0.035)), foot.add(up.scale(0.08)), 0.05, 12));
    lower.add('plastic', block(scene, 'fork-guard', foot.add(up.scale(0.07)).addInPlace(v3(0, 0, 0.03)), foot.add(up.scale(0.3)).addInPlace(v3(0, 0, 0.03)), 0.05, 0.018));
  }
  lower.add('steel', rod(scene, 'axle-f', v3(-0.115, 0, 0), v3(0.115, 0, 0), 0.018, 8));
  // Étrier radial (à gauche), à cheval sur la piste du disque de 300 mm, derrière le tube.
  const frontCaliper = v3(-0.058, 0.107, -0.075);
  lower.add('caliper', box(scene, 'caliper-f', frontCaliper, 0.042, 0.095, 0.048, 0.96));
  lower.add('anodized', block(scene, 'caliper-f-mount', v3(-0.085, 0.03, -0.01), frontCaliper.add(v3(-0.016, -0.02, 0.01)), 0.012, 0.04));
  for (const k of [-1, 1]) lower.add('steel', rod(scene, 'caliper-f-bolt', frontCaliper.add(v3(-0.024, 0.035 * k * 0.57, 0.035 * k * 0.82)), frontCaliper.add(v3(-0.03, 0.035 * k * 0.57, 0.035 * k * 0.82)), 0.01, 6));
  // Garde-boue bas (supermotard), fixé aux protège-tubes.
  const fender = arcShell(scene, 'fender', 0.335, 0.12, 0.22);
  fender.rotation.z = Math.PI / 2;
  fender.bakeCurrentTransformIntoVertices();
  fender.rotation.x = 0.4;
  lower.add('white', fender);
  meshes.push(...lower.merge('bike-fork-lower', frontMount, m));

  const frontWheel = new MeshBin<Key>();
  spokedWheel(scene, 'front', { tireRadius: spec.wheelRadius, tireWidth: 0.1, rimWidth: 0.075, hubWidth: 0.12, disc: { x: -0.058, outer: 0.15, inner: 0.112, waves: 12 } }, frontWheel);
  meshes.push(...frontWheel.merge('bike-wheel-front', frontSpin, m));
  const front: WheelVisual = { mount: frontMount, spin: frontSpin, rest: hubLocal.clone(), axis: up.clone() };

  // ===================== Roue arrière =====================
  const rearMount = new TransformNode('bike-wheel-rear', scene);
  const rearSpin = new TransformNode('bike-wheel-rear-spin', scene);
  rearSpin.parent = rearMount;
  rearMount.parent = root;
  rearMount.position.set(0, 0, -half);
  const rearWheel = new MeshBin<Key>();
  spokedWheel(
    scene,
    'rear',
    {
      tireRadius: spec.wheelRadius,
      tireWidth: 0.13,
      rimWidth: 0.09,
      hubWidth: 0.14,
      disc: { x: 0.062, outer: 0.1, inner: 0.072, waves: 9 },
      sprocket: { x: -0.075, radius: crown, teeth: 46 },
    },
    rearWheel,
  );
  meshes.push(...rearWheel.merge('bike-wheel-rear', rearSpin, m));
  const rear: WheelVisual = { mount: rearMount, spin: rearSpin };

  // ===================== Béquille, yeux =====================
  const stand = new TransformNode('bike-stand', scene);
  stand.parent = root;
  stand.position.set(-0.1, 0.05, -0.12);
  const standBin = new MeshBin<Key>();
  standBin.add('frame', rod(scene, 'stand-leg', Vector3.Zero(), v3(-0.2, -0.33, -0.05), 0.022, 8));
  standBin.add('frame', box(scene, 'stand-foot', v3(-0.2, -0.335, -0.05), 0.05, 0.01, 0.07));
  meshes.push(...standBin.merge('bike-stand', stand, m));

  const eye = new TransformNode('bike-eye', scene);
  eye.parent = root;
  eye.position.set(...spec.eyeLocal);

  // Bras oscillant : longueur et chute (pivot → moyeu) pour suivre la suspension.
  return {
    root,
    steer,
    front,
    rear,
    stand,
    eye,
    meshes,
    swingarm: { node: swingNode, length: -hubRel.z, drop: -hubRel.y },
  };
}
