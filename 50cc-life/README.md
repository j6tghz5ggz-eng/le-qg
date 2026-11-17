# 50cc LIFE

Simulateur de vie et de mécanique autour des motos 50cc, en 3D et en vue à la
première personne. Inspirations : My Summer Car, Mon Bazou.

**Babylon.js · Havok · TypeScript · Vite** : 100 % gratuit, fonctionne dans le
navigateur sur PC, Android et iOS.

> État : **étape 3** (garage, mécanique, boîte de vitesses). Un supermotard
> 50 à boîte 6 vitesses (embrayage, calage, kick, bridé à 45 km/h) garé dans
> un garage aménagé ; les pièces du moteur se démontent et se remontent
> (bougie, culasse, cylindre, piston, pot, carburateur, filtre, CDI) et
> changent les performances. Son moteur 2 temps synthétisé.

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

### À pied

| Action | Clavier / souris | Tactile | Manette |
|---|---|---|---|
| Se déplacer | ZQSD (AZERTY) / WASD, flèches | pouce gauche (joystick) | stick gauche |
| Regarder | souris (cliquer pour la capturer) | glisser à droite | stick droit |
| Courir / sauter / s'accroupir | Maj / Espace / C | joystick à fond / Sauter / Accroupir | clic stick / A / B |
| Prendre / poser | clic gauche (maintenir) | Prendre / Lâcher | X |
| Lancer | clic droit ou F | Lancer | RB |
| Utiliser, monter sur la moto | E | bouton contextuel | Y |
| **Démonter / remonter une pièce** | **maintenir E** en visant la pièce (ou en portant la pièce près de son emplacement) | maintenir le bouton contextuel | maintenir Y |

### Sur le supermotard (boîte manuelle)

| Action | Clavier / souris | Tactile | Manette |
|---|---|---|---|
| Gaz / frein / guidon | Z (W) / S / Q (A), D | joystick (haut, bas, côtés) | gâchette droite / gauche, stick |
| Frein arrière | Espace | — | A |
| Embrayage (maintenir) | Maj | Embrayage (si embrayage manuel) | B |
| Vitesse + / − | R / F ou molette | + / − | RB / LB |
| Démarrer (kick) / couper | C | Démarrer / Couper | X |
| Descendre | E | Descendre | Y |

Point mort sous la 1re (N - 1 - 2 - … - 6). Pour démarrer : point mort ou
embrayage tiré. **Embrayage automatique** : activé par défaut sur écran
tactile, réglable dans le panneau 📊.

## Documentation

- [Architecture et choix techniques](docs/ARCHITECTURE.md)
- [Sources lourdes (hors Git)](assets-src/README.md)
