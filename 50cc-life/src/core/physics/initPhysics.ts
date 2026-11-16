/**
 * Initialisation de Havok (moteur physique WebAssembly, licence MIT).
 *
 * Le fichier .wasm (~2 Mo) est importé avec « ?url » : Vite le copie dans
 * le build avec un nom versionné, et on indique à Havok où le trouver.
 */
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import '@babylonjs/core/Physics/v2/physicsEngineComponent';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

export const GRAVITY = new Vector3(0, -9.81, 0);

export async function initPhysics(scene: Scene): Promise<HavokPlugin> {
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  // true : Havok avance du pas fourni par la scène (le pas fixe de 1/60 s).
  const plugin = new HavokPlugin(true, havok);
  if (!scene.enablePhysics(GRAVITY, plugin)) {
    throw new Error("Impossible d'activer la physique Havok.");
  }
  return plugin;
}
