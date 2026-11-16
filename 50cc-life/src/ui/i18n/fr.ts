/** Textes français du jeu. Une autre langue = un autre fichier avec les mêmes clés. */
export const fr = {
  'loading.platform': "Détection de l'appareil…",
  'loading.engine': 'Démarrage du moteur 3D…',
  'loading.physics': 'Chargement de la physique…',
  'loading.world': 'Construction du monde…',
  'loading.shaders': 'Préparation des matériaux…',
  'error.title': 'Le jeu ne peut pas démarrer',
  'error.noWebgl2':
    "Votre navigateur ou votre appareil ne prend pas en charge WebGL 2. Mettez à jour le navigateur (Chrome, Edge, Firefox ou Safari récent) puis réessayez.",
  'error.generic': 'Une erreur inattendue est survenue.',
  'error.reload': 'Recharger',
  'error.contextLost': 'Affichage interrompu par le système, reprise en cours…',
  'quality.label': 'Qualité',
  'quality.auto': 'Auto',
  'quality.low': 'Basse',
  'quality.medium': 'Moyenne',
  'quality.high': 'Haute',
  'quality.ultra': 'Ultra',
  'quality.restartHint': 'Le jeu redémarre pour appliquer le changement.',
  'debug.toggle': 'Afficher ou masquer les statistiques (F3)',
  'debug.spawnCrate': 'Lâcher une caisse',
} as const;

export type StringKey = keyof typeof fr;
