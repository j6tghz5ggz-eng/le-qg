/**
 * Décorations de la moto, dessinées en code dans des textures (aucune
 * image à télécharger). Marques et modèle FICTIFS : VARONE SMX 50.
 * La plaque d'immatriculation est inventée (format français, sans
 * correspondance réelle).
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';

export const BRAND = 'VARONE';
export const MODEL = 'SMX 50';
const YELLOW = '#f4b400';
const BLACK = '#141518';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function paintedMaterial(scene: Scene, name: string, w: number, h: number, draw: Draw, roughness: number): PBRMaterial {
  const texture = new DynamicTexture(`${name}-tex`, { width: w, height: h }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  draw(ctx, w, h);
  texture.update();
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  const mat = new PBRMaterial(name, scene);
  mat.albedoTexture = texture;
  mat.metallic = 0;
  mat.roughness = roughness;
  return mat;
}

/** Plastique fin vu des deux côtés (écopes, caches, plaque). */
function plastic(mat: PBRMaterial): PBRMaterial {
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  return mat;
}

function brandText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, stroke?: string): void {
  ctx.font = `italic 900 ${size}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Écopes de radiateur : jaune, bandes noire et blanche, logo. */
export function shroudMaterial(scene: Scene): PBRMaterial {
  return plastic(
    paintedMaterial(scene, 'sm-shroud', 512, 256, (ctx, w, h) => {
      ctx.fillStyle = YELLOW;
      ctx.fillRect(0, 0, w, h);
      // Bande noire en biais, liseré blanc.
      ctx.fillStyle = BLACK;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.62);
      ctx.lineTo(w, h * 0.38);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.56);
      ctx.lineTo(w, h * 0.32);
      ctx.stroke();
      brandText(ctx, BRAND, w * 0.5, h * 0.33, 92, BLACK, '#ffffff');
      ctx.font = 'italic 800 34px Arial, Helvetica, sans-serif';
      ctx.fillStyle = YELLOW;
      ctx.textAlign = 'right';
      ctx.fillText(MODEL, w * 0.9, h * 0.82);
    }, 0.3),
  );
}

/** Caches latéraux : plaque numéro blanche avec le « 50 ». */
export function panelMaterial(scene: Scene): PBRMaterial {
  return plastic(
    paintedMaterial(scene, 'sm-panel', 512, 256, (ctx, w, h) => {
      ctx.fillStyle = YELLOW;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f7f7f2';
      ctx.beginPath();
      ctx.ellipse(w * 0.46, h * 0.5, w * 0.27, h * 0.33, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = BLACK;
      ctx.font = '900 128px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('50', w * 0.46, h * 0.53);
      ctx.fillRect(0, h * 0.9, w, h * 0.1);
      brandText(ctx, BRAND, w * 0.84, h * 0.2, 36, BLACK);
    }, 0.32),
  );
}

/** Masque avant : haut jaune, pointe noire en V, liseré blanc, logo. */
export function maskMaterial(scene: Scene): PBRMaterial {
  return plastic(
    paintedMaterial(scene, 'sm-mask', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = YELLOW;
      ctx.fillRect(0, 0, w, h);
      // Pointe noire en V qui descend vers le garde-boue.
      ctx.fillStyle = BLACK;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w / 2, h * 0.62);
      ctx.lineTo(w, h * 0.5);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.45);
      ctx.lineTo(w / 2, h * 0.57);
      ctx.lineTo(w, h * 0.45);
      ctx.stroke();
      brandText(ctx, BRAND, w / 2, h * 0.8, 40, YELLOW);
    }, 0.32),
  );
}

/** Plaque d'immatriculation inventée (format moto, deux lignes). */
export function licensePlateMaterial(scene: Scene): PBRMaterial {
  return paintedMaterial(scene, 'sm-plate', 256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#fbfbf7';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#1f3fa8';
    ctx.fillRect(6, 6, 30, h - 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 22px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('F', 21, h - 22);
    ctx.fillStyle = BLACK;
    ctx.font = '700 58px Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('GV-050', w * 0.57, h * 0.32);
    ctx.fillText('SM', w * 0.57, h * 0.74);
  }, 0.4);
}

/** Faisceau du radiateur (ailettes). */
export function radiatorMaterial(scene: Scene): PBRMaterial {
  const mat = paintedMaterial(scene, 'sm-radiator', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#2a2c30';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0d0e10';
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 2, h);
    ctx.fillStyle = '#3a3d42';
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 2);
  }, 0.6);
  mat.metallic = 0.5;
  (mat.albedoTexture as Texture).uScale = 3;
  (mat.albedoTexture as Texture).vScale = 3;
  (mat.albedoTexture as Texture).wrapU = Texture.WRAP_ADDRESSMODE;
  (mat.albedoTexture as Texture).wrapV = Texture.WRAP_ADDRESSMODE;
  return mat;
}
