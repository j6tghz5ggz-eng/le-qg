import { describe, expect, it } from 'vitest';
import { classifyGpu, parseOs, type PlatformInfo } from '../../src/core/platform/platform';
import {
  QUALITY_PROFILES,
  computeHardwareScaling,
  isQualityId,
  pickDefaultProfile,
} from '../../src/core/quality/qualityProfiles';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
};

describe('parseOs', () => {
  it('reconnaît les systèmes courants', () => {
    expect(parseOs(UA.iphone, 5)).toBe('ios');
    expect(parseOs(UA.android, 5)).toBe('android');
    expect(parseOs(UA.windows, 0)).toBe('windows');
    expect(parseOs(UA.linux, 0)).toBe('linux');
    expect(parseOs(UA.ipadOs, 0)).toBe('macos');
  });

  it('reconnaît un iPad qui se fait passer pour un Mac', () => {
    expect(parseOs(UA.ipadOs, 5)).toBe('ios');
  });
});

describe('classifyGpu', () => {
  it.each([
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'linux', 'software'],
    ['Apple GPU', 'ios', 'high'],
    ['Adreno (TM) 740', 'android', 'high'],
    ['Adreno (TM) 650', 'android', 'mid'],
    ['Adreno (TM) 610', 'android', 'low'],
    ['Mali-G78 MC14', 'android', 'mid'],
    ['Mali-G52 MC2', 'android', 'low'],
    ['Immortalis-G720', 'android', 'high'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)', 'windows', 'high'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)', 'windows', 'mid'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0)', 'windows', 'mid'],
    ['', 'windows', 'unknown'],
  ] as const)('%s → %s', (renderer, os, expected) => {
    expect(classifyGpu(renderer, os)).toBe(expected);
  });
});

function platform(overrides: Partial<PlatformInfo>): PlatformInfo {
  return {
    os: 'windows',
    isMobile: false,
    hasTouch: false,
    hasFinePointer: true,
    devicePixelRatio: 1,
    cpuCores: 8,
    memoryGb: 8,
    gpuRenderer: '',
    gpuTier: 'mid',
    webgl2: true,
    webgpu: false,
    ...overrides,
  };
}

describe('pickDefaultProfile', () => {
  it('PC avec carte graphique dédiée → haute', () => {
    expect(pickDefaultProfile(platform({ gpuTier: 'high' }))).toBe('high');
  });
  it('PC avec GPU intégré → moyenne', () => {
    expect(pickDefaultProfile(platform({ gpuTier: 'mid' }))).toBe('medium');
  });
  it('rendu logiciel → basse', () => {
    expect(pickDefaultProfile(platform({ gpuTier: 'software' }))).toBe('low');
  });
  it('téléphone haut de gamme → moyenne au maximum', () => {
    expect(pickDefaultProfile(platform({ os: 'ios', isMobile: true, gpuTier: 'high', memoryGb: null }))).toBe('medium');
  });
  it('téléphone modeste ou avec peu de mémoire → basse', () => {
    expect(pickDefaultProfile(platform({ os: 'android', isMobile: true, gpuTier: 'mid' }))).toBe('low');
    expect(pickDefaultProfile(platform({ os: 'android', isMobile: true, gpuTier: 'high', memoryGb: 4 }))).toBe('low');
  });
  it('sans WebGL2 → basse', () => {
    expect(pickDefaultProfile(platform({ webgl2: false, gpuTier: 'high' }))).toBe('low');
  });
  it('ne choisit jamais ultra automatiquement', () => {
    for (const gpuTier of ['software', 'low', 'mid', 'high', 'unknown'] as const) {
      expect(pickDefaultProfile(platform({ gpuTier }))).not.toBe('ultra');
    }
  });
});

describe('computeHardwareScaling', () => {
  it('écran standard, pleine résolution → 1', () => {
    expect(computeHardwareScaling(1, 2, 1)).toBe(1);
  });
  it('plafonne un écran x3 au maximum du profil', () => {
    expect(computeHardwareScaling(3, 1.5, 1)).toBeCloseTo(1 / 1.5);
  });
  it('applique l’échelle de la résolution dynamique', () => {
    expect(computeHardwareScaling(2, 2, 0.5)).toBeCloseTo(1);
  });
  it('ne descend jamais sous un pixel CSS pour un écran < 1', () => {
    expect(computeHardwareScaling(0.75, 2, 1)).toBe(1);
  });
});

describe('profils', () => {
  it('chaque profil porte son propre identifiant', () => {
    for (const [id, profile] of Object.entries(QUALITY_PROFILES)) expect(profile.id).toBe(id);
  });
  it('isQualityId valide les valeurs stockées', () => {
    expect(isQualityId('high')).toBe(true);
    expect(isQualityId('maximum')).toBe(false);
    expect(isQualityId(null)).toBe(false);
  });
});
