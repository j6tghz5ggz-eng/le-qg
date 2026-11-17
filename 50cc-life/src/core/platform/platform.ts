/**
 * Description de l'appareil, utilisée pour choisir le profil de qualité
 * et le type de commandes (clavier/souris ou tactile).
 *
 * Les fonctions `parseOs` et `classifyGpu` sont pures (testées dans Node) ;
 * `detectPlatform()` lit les API du navigateur.
 */
export type OsKind = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'other';

/**
 * Niveau estimé du GPU.
 * - software : rendu sans GPU (SwiftShader, llvmpipe) — très lent
 * - low / mid / high : estimation d'après le nom du GPU
 * - unknown : nom masqué par le navigateur
 */
export type GpuTier = 'software' | 'low' | 'mid' | 'high' | 'unknown';

export interface PlatformInfo {
  readonly os: OsKind;
  /** Téléphone ou tablette. */
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
  /** Souris ou pavé tactile précis disponible. */
  readonly hasFinePointer: boolean;
  readonly devicePixelRatio: number;
  readonly cpuCores: number;
  /** Mémoire vive en Go (Chrome/Android uniquement, sinon null). */
  readonly memoryGb: number | null;
  readonly gpuRenderer: string;
  readonly gpuTier: GpuTier;
  readonly webgl2: boolean;
  /** WebGPU présent dans le navigateur (pas encore utilisé par le jeu). */
  readonly webgpu: boolean;
}

export function parseOs(userAgent: string, maxTouchPoints: number): OsKind {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile.
  if (ua.includes('macintosh') && maxTouchPoints > 1) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('linux') || ua.includes('cros')) return 'linux';
  return 'other';
}

export function isMobileOs(os: OsKind): boolean {
  return os === 'ios' || os === 'android';
}

/** Estime le niveau du GPU à partir du nom renvoyé par WebGL. */
export function classifyGpu(renderer: string, os: OsKind): GpuTier {
  const r = renderer.toLowerCase();
  if (!r) return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|software|basic render driver/.test(r)) return 'software';

  // Apple : Safari masque le modèle (« Apple GPU »). iPhone/iPad récents et
  // Mac Apple Silicon ont des GPU performants ; pickDefaultProfile() reste
  // prudent sur mobile (profil « medium » au maximum).
  if (r.includes('apple')) return 'high';

  // Sur mobile, un nom de GPU de PC est suspect (navigateur qui ment) : prudence.
  if (isMobileOs(os) && /nvidia|geforce|radeon|intel/.test(r)) return 'unknown';

  // Mobile Android
  const adreno = /adreno[^\d]*(\d{3})/.exec(r);
  if (adreno?.[1]) {
    const model = Number(adreno[1]);
    if (model >= 730) return 'high';
    if (model >= 640) return 'mid';
    return 'low';
  }
  if (r.includes('immortalis')) return 'high';
  const mali = /mali-g(\d+)/.exec(r);
  if (mali?.[1]) {
    const model = Number(mali[1]);
    // G76, G77, G78, G710, G715, G720… = milieu de gamme correct
    if (model >= 76) return 'mid';
    return 'low';
  }
  if (r.includes('mali') || r.includes('powervr')) return 'low';
  if (r.includes('xclipse')) return 'mid';

  // PC : cartes dédiées
  if (/rtx|gtx|geforce|quadro|radeon rx|radeon pro|arc\(tm\) a|arc a\d/.test(r)) return 'high';
  // PC : GPU intégrés
  if (/intel|radeon\(tm\) graphics|vega|uhd|iris/.test(r)) return 'mid';
  if (/nvidia|amd|radeon/.test(r)) return 'mid';

  return 'unknown';
}

/** Lit le nom du GPU via un contexte WebGL2 temporaire, aussitôt libéré. */
function probeWebGl(): { webgl2: boolean; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { webgl2: false, renderer: '' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(
      info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2: true, renderer };
  } catch {
    return { webgl2: false, renderer: '' };
  }
}

export function detectPlatform(): PlatformInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const os = parseOs(nav.userAgent, nav.maxTouchPoints ?? 0);
  const { webgl2, renderer } = probeWebGl();
  const hasTouch = (nav.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
  return {
    os,
    isMobile: isMobileOs(os),
    hasTouch,
    hasFinePointer: window.matchMedia?.('(any-pointer: fine)').matches ?? !hasTouch,
    devicePixelRatio: window.devicePixelRatio || 1,
    cpuCores: nav.hardwareConcurrency || 4,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    gpuRenderer: renderer,
    gpuTier: classifyGpu(renderer, os),
    webgl2,
    webgpu: 'gpu' in nav,
  };
}
