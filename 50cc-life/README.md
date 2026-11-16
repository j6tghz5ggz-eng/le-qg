# 50cc LIFE

Simulateur de vie et de mécanique autour des motos 50cc, en 3D et en vue à la
première personne. Inspirations : My Summer Car, Mon Bazou.

**Babylon.js · Havok · TypeScript · Vite** : 100 % gratuit, fonctionne dans le
navigateur sur PC, Android et iOS.

> État : **étape 0** (fondations techniques). La scène actuelle est une scène
> de test : sol, rampe, caisses physiques, caméra orbitale.

## Démarrer

Prérequis : [Node.js](https://nodejs.org) 22.12 ou plus récent.

```bash
cd 50cc-life
npm install
npm run dev          # http://localhost:5173
```

### Tester sur un téléphone

PC et téléphone sur le même Wi-Fi :

```bash
npm run dev:lan      # affiche une adresse du type http://192.168.x.x:5173
```

Ouvrez cette adresse sur le téléphone.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (rechargement instantané) |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Sert le build de production localement |
| `npm run typecheck` | Vérifie les types TypeScript |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Tests de démarrage dans un vrai navigateur (Playwright) |
| `npm run check:sizes` | Contrôle les budgets de taille (dépôt + build) |
| `npm run ci` | Tout vérifier d'un coup (sauf e2e) |
| `npm run hooks:install` | Active le garde-fou anti-gros-fichiers avant chaque commit |

## Scène de test : commandes

| Action | PC | Mobile |
|---|---|---|
| Tourner la caméra | clic gauche + glisser | 1 doigt |
| Zoomer | molette | pincer |
| Lâcher une caisse | touche **C** ou bouton | bouton |
| Statistiques / qualité | **F3** ou bouton 📊 | bouton 📊 |

## Documentation

- [Architecture et choix techniques](docs/ARCHITECTURE.md)
- [Sources lourdes (hors Git)](assets-src/README.md)
