# 50cc LIFE

Simulateur de vie et de mécanique autour des motos 50cc, en 3D et en vue à la
première personne. Inspirations : My Summer Car, Mon Bazou.

**Babylon.js · Havok · TypeScript · Vite** : 100 % gratuit, fonctionne dans le
navigateur sur PC, Android et iOS.

> État : **étape 5** (boutique et sauvegarde).
>
> - Le supermotard détaillé (VARONE SMX 50, marque fictive) a une boîte 6
>   vitesses, un embrayage, il peut caler et démarre au kick.
> - Il est bridé comme en vrai : environ 50 km/h à plat, 55 à 60 km/h en
>   descente.
> - Les pièces du moteur se démontent et se remontent : bougie, culasse,
>   cylindre, piston, pot passage haut, cartouche, carburateur, filtre, CDI.
>   Elles changent les performances (kit TURBINO pour débrider).
> - Son moteur 2 temps synthétisé.
> - Onglet DEV de triches (argent, téléportation, pièces…), porte-monnaie et
>   colline d'essai.
> - Boutique en ligne (ordinateur du garage) : les pièces achetées sont
>   livrées sur une palette, et on peut revendre ses pièces.
> - Sauvegarde automatique de la partie (argent, moto, pièces, position).

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
| Boutique (ordinateur du garage) | E en visant l'ordinateur, Échap pour fermer | Ouvrir la boutique | Y |

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

### Panneau 📊 (F3) : onglets Infos et DEV

- **Infos** : statistiques, qualité graphique, réglages.
- **DEV** : triches pour tester. On y trouve l'argent, la téléportation
  (garage, route, colline…), la moto (ramener, démarrage instantané, moteur
  DEV), la mécanique (pièce neuve du catalogue, kit débridage, moteur
  d'origine, tout à neuf) et la marche rapide. Le raccourci **B** lâche une
  caisse.
- Chaque nouvelle fonctionnalité y ajoute ses triches.

## Documentation

- [Architecture et choix techniques](docs/ARCHITECTURE.md)
- [Sources lourdes (hors Git)](assets-src/README.md)
