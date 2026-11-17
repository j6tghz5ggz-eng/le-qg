/**
 * Ciel de reflets généré en code (aucun fichier HDR à télécharger) : un
 * petit cube 32 × 32 par face avec un dégradé ciel → horizon → sol et une
 * lueur côté soleil. Il sert de « scene.environmentTexture » :
 * - reflets sur le chrome, l'alu, la peinture (matériaux PBR) ;
 * - éclairage d'ambiance venant du ciel (harmoniques sphériques calculées
 *   une fois sur le CPU), à la place d'une grosse partie de la lumière
 *   hémisphérique.
 */
import { Constants } from '@babylonjs/core/Engines/constants';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CubeMapToSphericalPolynomialTools } from '@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial';
import type { Scene } from '@babylonjs/core/scene';

const SIZE = 32;
type Rgb = readonly [number, number, number];

const ZENITH: Rgb = [0.36, 0.55, 0.85];
const HORIZON: Rgb = [0.82, 0.86, 0.9];
const GROUND: Rgb = [0.3, 0.33, 0.24];
const SUN: Rgb = [1, 0.96, 0.86];

function mix(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Couleur du ciel (sRGB 0-1) dans une direction. */
export function skyColor(dir: Vector3, sunDir: Vector3): [number, number, number] {
  const y = dir.y;
  let c = y >= 0 ? mix(HORIZON, ZENITH, Math.pow(y, 0.6)) : mix(HORIZON, GROUND, Math.min(1, Math.pow(-y * 4, 0.7)));
  const sun = Math.max(0, Vector3.Dot(dir, sunDir));
  c = mix(c, SUN, Math.pow(sun, 24) * 0.9 + Math.pow(sun, 4) * 0.15);
  return c;
}

/** Direction d'un texel de face de cube (ordre +X, -X, +Y, -Y, +Z, -Z). */
function faceDirection(face: number, u: number, v: number): Vector3 {
  switch (face) {
    case 0:
      return new Vector3(1, -v, -u);
    case 1:
      return new Vector3(-1, -v, u);
    case 2:
      return new Vector3(u, 1, v);
    case 3:
      return new Vector3(u, -1, -v);
    case 4:
      return new Vector3(u, -v, 1);
    default:
      return new Vector3(-u, -v, -1);
  }
}

export function createSkyReflection(scene: Scene, lightDirection: Vector3): RawCubeTexture {
  const sunDir = lightDirection.scale(-1).normalize();
  const faces: Uint8Array[] = [];
  for (let face = 0; face < 6; face++) {
    const data = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const u = ((x + 0.5) / SIZE) * 2 - 1;
        const v = ((y + 0.5) / SIZE) * 2 - 1;
        const c = skyColor(faceDirection(face, u, v).normalize(), sunDir);
        const i = (y * SIZE + x) * 4;
        data[i] = Math.round(Math.min(c[0], 1) * 255);
        data[i + 1] = Math.round(Math.min(c[1], 1) * 255);
        data[i + 2] = Math.round(Math.min(c[2], 1) * 255);
        data[i + 3] = 255;
      }
    }
    faces.push(data);
  }
  const texture = new RawCubeTexture(scene, faces, SIZE, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true);
  texture.gammaSpace = true;
  texture.name = 'sky-reflection';
  texture.sphericalPolynomial = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
    size: SIZE,
    right: faces[0]!,
    left: faces[1]!,
    up: faces[2]!,
    down: faces[3]!,
    front: faces[4]!,
    back: faces[5]!,
    format: Constants.TEXTUREFORMAT_RGBA,
    type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
    gammaSpace: true,
  });
  return texture;
}
