import { fr, type StringKey } from './fr';

export type { StringKey };

/** Traduit une clé. Le français est la seule langue pour l'instant. */
export function t(key: StringKey): string {
  return fr[key];
}
