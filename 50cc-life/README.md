# 50cc LIFE

Simulateur de vie et de mécanique autour des motos 50cc, en 3D et en vue à la
première personne. Inspirations : My Summer Car, Mon Bazou.

**Babylon.js · Havok · TypeScript · Vite** : 100 % gratuit, fonctionne dans le
navigateur sur PC, Android et iOS.

> État : **étape 2** (le cyclomoteur). Scène de test : à pied en vue à la
> première personne, un garage, des objets à prendre, et un cyclomoteur
> conduisible (bridé à 45 km/h) avec une route d'essai et un slalom de plots.

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

## Scripts

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

## Commandes du jeu

| Action | Clavier / souris | Tactile | Manette |
|---|---|---|---|
| Se déplacer | ZQSD (AZERTY) / WASD, flèches | pouce gauche (joystick) | stick gauche |
| Regarder | souris (cliquer pour la capturer) | glisser à droite | stick droit |
| Courir | Maj | joystick poussé à fond | clic stick gauche |
| Sauter | Espace | Sauter | A |
| S'accroupir | C (maintenir) | Accroupir (bascule) | B |
| Prendre / poser | clic gauche (maintenir) | Prendre / Lâcher | X |
| Lancer | clic droit ou F | Lancer | RB |
| Monter / descendre du cyclo | E | Monter / Descendre | Y |
| Gaz / frein / guidon (en cyclo) | Z/W · S · Q/A, D | joystick (haut, bas, côtés) | gâchettes + stick gauche |
| Reculer aux pieds (à l'arrêt) | maintenir S | joystick vers le bas | gâchette gauche |
| Libérer la souris | Échap | | |
| Statistiques / qualité | F3 ou 📊 | 📊 | |
| Lâcher une caisse (test) | B | bouton dans le panneau 📊 | |

## Documentation

- [Architecture et choix techniques](docs/ARCHITECTURE.md)
- [Sources lourdes (hors Git)](assets-src/README.md)
