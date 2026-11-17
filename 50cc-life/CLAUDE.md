# 50cc LIFE : consignes de travail

- Répondre en **français**, expliquer les choix techniques.
- Ne jamais modifier les fichiers de Le QG (racine du dépôt : `README.md`, `index.html`…).
  Tout le jeu vit dans `50cc-life/`.
- Outils 100 % gratuits ; Babylon.js + TypeScript + Vite + Havok ; pas d'Unity ni d'Unreal.
- Marques **fictives** uniquement (VARONE = constructeur, TURBINO = échappements…),
  jamais de marque, logo ou modèle réel.

## Onglet DEV (triches) : règle permanente

À **chaque nouvelle fonctionnalité utile pour tester ou tricher** (argent, objets,
lieux, véhicules, pièces, temps, météo, PNJ…), ajouter sa triche dans l'onglet DEV :
dans le `init()` du système concerné, `ctx.cheats.add('<Groupe>', { kind: 'action' | 'toggle' | 'choice', … })`
(voir `src/debug/CheatRegistry.ts`). Un nouveau lieu important = un point dans
`TELEPORT_POINTS` (`src/world/TestWorld.ts`, puis le vrai monde).

## Vérifications avant commit

`npm run ci` (types, tests unitaires, build, tailles) puis `npm run test:e2e`.
