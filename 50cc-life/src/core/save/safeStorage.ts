/**
 * Accès à localStorage qui ne plante jamais (navigation privée, stockage
 * bloqué, aperçu…). Réservé aux petites préférences (profil graphique…).
 * Les sauvegardes de partie utiliseront IndexedDB (étape ultérieure).
 */
const PREFIX = '50cc-life:';

export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* stockage indisponible : la préférence ne sera simplement pas retenue */
  }
}
