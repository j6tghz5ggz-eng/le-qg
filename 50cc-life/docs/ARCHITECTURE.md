# 50cc LIFE — Architecture et choix techniques

Ce document explique **comment le jeu est construit et pourquoi**. Il évolue à
chaque étape.

## 1. Contraintes du projet

1. Outils 100 % gratuits, sans Unity ni Unreal.
2. Un vrai jeu 3D interactif, pas un site web.
3. PC, Android et iOS, avec un seul code.
4. Optimisé pour les téléphones, **sans sacrifier la qualité PC**.
5. Grand monde ouvert chargé progressivement.
6. Architecture modulaire, développée fonctionnalité par fonctionnalité.

## 2. Pile technique

| Rôle | Outil | Version | Licence |
|---|---|---|---|
| Rendu 3D | Babylon.js (`@babylonjs/core`) | 9.37.0 | Apache-2.0 |
| Physique | Havok (`@babylonjs/havok`, WebAssembly) | 1.3.14 | MIT |
| Langage | TypeScript (compilateur natif 7.x) | 7.0.2 | Apache-2.0 |
| Outil de dev / build | Vite | 8.3.8 | MIT |
| Tests unitaires | Vitest | 5.1.0 | MIT |
| Tests navigateur | Playwright | 1.65.1 | Apache-2.0 |
| Interface | HTML / CSS natifs, sans framework | — | — |

Les versions sont **figées exactement** (`--save-exact`). Babylon publie
presque chaque semaine : on met à jour volontairement, tous les paquets
`@babylonjs/*` ensemble, puis on relance les tests.

## 3. Couches et règle de dépendance

```
 ui/  app/                      ← écrans, HUD, orchestration du jeu
   │
   ▼
 world/ player/ vehicles/ mechanics/ economy/ …   ← fonctionnalités
   │
   ▼
 core/                          ← moteur interne, sans gameplay
   │
   ▼
 Babylon.js · Havok · API du navigateur
```

- Une couche n'importe **que** les couches en dessous d'elle.
- `core/` ne connaît rien du gameplay (ni moto, ni argent).
- Les **modèles purs** (simulation moteur 2 temps, pièces, économie,
  résolution dynamique, détection de l'appareil…) n'importent pas Babylon.
  Ils sont testés dans Node en quelques millisecondes et pourront tourner
  dans un Web Worker si besoin.
- Les modules communiquent par le **bus d'événements typé**
  (`core/events/EventBus.ts`) plutôt qu'en s'important mutuellement.
- Chaque morceau de jeu est un **système** (`GameSystem`) avec `init`,
  `fixedUpdate`, `update` et `dispose`. Il reçoit un `GameContext` (moteur,
  scène, physique, bus, qualité…) : c'est une injection de dépendances
  simple, explicite et typée.

## 4. Arborescence

```
50cc-life/
├── index.html                 entrée du jeu (canvas + couche UI)
├── package.json · tsconfig*.json · vite.config.ts · playwright.config.ts
├── public/                    fichiers servis tels quels (icône, puis assets optimisés)
├── assets-src/                sources lourdes : HORS GIT (voir § 9)
├── tools/check-sizes.mjs      budgets de taille
├── .githooks/pre-commit       refuse les fichiers de plus de 10 Mo
├── docs/ARCHITECTURE.md       ce document
├── tests/
│   ├── unit/                  Vitest (modules purs)
│   └── e2e/                   Playwright (le jeu démarre sur PC + mobile émulé)
└── src/
    ├── main.ts                point d'entrée
    ├── app/                   Game (démarrage, systèmes, cycle de vie), événements
    ├── core/
    │   ├── engine/            création du moteur WebGL2
    │   ├── loop/              boucle à pas fixe, interpolation
    │   ├── events/            bus d'événements typé
    │   ├── input/             actions + appareils (clavier/souris, tactile, manette)
    │   ├── interaction/       registre des objets interactifs
    │   ├── physics/           initialisation Havok, couches de collision
    │   ├── platform/          détection de l'appareil et du GPU
    │   ├── quality/           profils, résolution dynamique
    │   ├── rendering/         post-traitements
    │   └── save/              préférences (puis sauvegardes IndexedDB)
    ├── player/                joueur à la 1re personne, interaction (prendre, lancer)
    ├── vehicles/
    │   ├── bike/              physique de la moto, modèle 3D provisoire, fiches techniques
    │   └── simulation/        moteur 2T + variateur + embrayage (TS pur, testé)
    ├── world/                 environnement (ciel, lumière, ombres), scène de test
    ├── debug/                 statistiques, API pour les tests
    └── ui/                    écrans et HUD HTML/CSS, commandes tactiles, textes (i18n)
```

Dossiers prévus aux étapes suivantes : `core/assets/`, `core/audio/`,
`world/streaming/`, `mechanics/`, `economy/`, `inventory/`, `garage/`,
`data/` (pièces et motos décrites en données).

## 5. Boucle de jeu : pas fixe à 60 Hz

**Problème.** Si la physique avance au rythme de l'affichage, une moto se
comporte différemment à 144 i/s sur PC et à 30 i/s sur téléphone, et devient
instable quand l'affichage ralentit.

**Solution.** La simulation avance **toujours par pas de 1/60 s**. Pour ça, on
utilise le mode *deterministic lockstep* intégré à Babylon :

- `fixedUpdate(dt)` est appelé avant chaque pas de physique, de 0 à 4 fois par
  image selon le temps écoulé (4 au maximum, pour éviter la « spirale de la
  mort » sur un appareil lent). C'est là que vont la moto, le moteur et le
  gameplay.
- `update(dt)` est appelé une fois par image rendue, pour la caméra,
  l'interface et les effets.
- `engine.maxFPS` limite le nombre d'images par seconde selon le profil (30 en
  qualité basse) : moins de chauffe et de batterie consommée, avec une
  simulation inchangée.

- `beforeFrame(dt)` est appelé une fois par image, avant la simulation, pour
  lire la manette.

**Interpolation.** Sur un écran 120/144 Hz, il y a plusieurs images entre deux
pas de simulation. `update` reçoit `alpha` (0 à 1), la position entre les deux
derniers pas. La caméra du joueur est placée entre ces deux positions, d'où un
mouvement fluide sans changer la simulation. La rotation du regard, elle,
s'applique immédiatement à chaque image, sans latence.

## 6. Qualité graphique : un jeu, plusieurs réglages

| | Basse | Moyenne | Haute | Ultra |
|---|---|---|---|---|
| Plafond pixel ratio | 1 | 1,5 | 2 | 3 |
| Antialiasing | — | FXAA | MSAA | MSAA |
| Ombres | — | nettes 1024 | douces 2048 | douces 4096 |
| Distance de vue | 120 m | 250 m | 500 m | 900 m |
| Images/s visées | 30 | 60 | illimité | illimité |
| Résolution dynamique min. | 60 % | 60 % | 70 % | 85 % |

- **Détection automatique** au premier lancement, à partir du GPU (nom lu via
  WebGL), du type d'appareil et de la mémoire. Sur mobile, le maximum est
  « Moyenne ». « Ultra » n'est jamais choisi automatiquement.
- Le joueur peut changer de profil (choix mémorisé). Le jeu redémarre alors,
  car le MSAA est fixé à la création du contexte WebGL.
- **Résolution dynamique.** Si le jeu rame, la résolution baisse par paliers
  de 10 %. Elle remonte prudemment après une période stable. Si une remontée
  fait ramer, on revient en arrière et on attend deux fois plus longtemps
  avant de réessayer, parce qu'avec la synchro verticale la marge du GPU
  n'est pas mesurable directement. Le calcul se base sur la médiane de
  30 images, ce qui ignore les à-coups ponctuels.
- **Tone mapping** « Khronos PBR Neutral » : il respecte la vraie couleur des
  matériaux, comme une peinture de cyclo.
- **Brouillard** calé sur la distance de vue : il masquera le chargement
  progressif du monde.

## 7. Commandes, joueur et interaction (étape 1)

### Commandes : des actions, pas des touches

Le gameplay ne lit que des **actions** : `jump`, `sprint`, `crouch`, `grab`,
`throw`, `use`, plus un vecteur de déplacement et une rotation du regard.
Trois appareils les alimentent (`core/input/devices/`) :

| | Clavier / souris | Tactile | Manette |
|---|---|---|---|
| Déplacement | ZQSD/WASD selon la position physique des touches (`event.code`) | joystick qui apparaît sous le pouce gauche | stick gauche (zone morte radiale) |
| Regard | souris capturée (Pointer Lock), mouvement brut si possible | glisser sur la droite de l'écran | stick droit (courbe de réponse) |
| Courir | Maj | joystick poussé à fond | clic du stick |

- **Appuis jamais perdus.** Un appui est mémorisé jusqu'à ce que le gameplay
  le lise, pendant 200 ms au maximum. Un appui bref n'est donc pas manqué
  quand aucun pas de simulation ne tombe pendant l'image (écran 144 Hz), et
  un saut demandé juste avant d'atterrir part à l'atterrissage.
- **Mode actif détecté.** Le dernier appareil utilisé décide de l'interface :
  boutons tactiles, aides « Clic gauche » ou « X », carte « Cliquez pour
  jouer ». Une tablette avec clavier bascule toute seule.
- **Sans capture de souris** (certaines fenêtres intégrées la refusent) :
  repli sur « clic droit maintenu pour regarder », et F pour lancer.

### Joueur

- **Contrôleur de personnage Havok** fourni par Babylon (capsule de 1,8 m) :
  pentes jusqu'à 60°, poussée des objets, accroupissement réel (la capsule
  passe à 1,15 m ; on ne se relève que s'il y a la place).
- **Réglages corrigés** par rapport aux valeurs par défaut de Babylon, tous
  mesurés en jeu :
  - `keepContactTolerance` passe de 10 cm à 3 cm : sinon le joueur flottait
    9 cm au-dessus du sol ;
  - `keepDistance` passe de 5 cm à 1,5 cm, et une légère poussée vers le sol
    plaque le joueur sur un sol plat.
- **Aide à la montée de marche.** La montée de marche intégrée à Babylon
  échoue à vitesse de marche : la marge de 5 cm dépasse le trajet d'un pas de
  1/60 s, et la vitesse s'effondre contre l'arête. Si le joueur est bloqué, on
  sonde devant ses pieds avec trois rayons physiques : dessus plat, place
  pour la tête, pas de mur derrière. Si tout est bon, on le pose sur la
  marche (35 cm max) et la caméra lisse la montée. Un test navigateur
  vérifie l'entrée dans le garage par son seuil de 15 cm.
- Champ de vision vertical fixe en paysage, horizontal fixe en portrait.
- Replacement automatique au point de départ en cas de chute hors du monde.

### Interaction

- Chaque image, un **rayon physique** part des yeux vers le centre de l'écran
  (portée 2,2 m). Il ignore la capsule du joueur grâce aux couches de
  collision (`core/physics/layers.ts`).
- Les objets interactifs s'enregistrent dans un **registre** (corps physique
  → nom et actions possibles). Les pièces de moto utiliseront le même
  mécanisme.
- **Porter = un ressort, pas un collage.** À chaque pas, on donne à l'objet
  une vitesse vers un point devant les yeux. Il garde ses collisions : il bute
  sur les murs et tombe s'il se coince. Les objets de plus de 40 kg sont trop
  lourds. Un objet passé sous les pieds du joueur est lâché, sinon le joueur
  pourrait se soulever lui-même.
- Lancer : impulsion fixe, donc un objet léger part plus vite.
- Le réticule et l'aide ne sont redessinés que lorsque la cible change
  (événement `interaction:focus`).

## 8. Le cyclomoteur (étape 2)

C'est le risque technique n°1 du projet. Un vrai deux-roues tient debout
grâce au pilote et à la géométrie de sa direction, ce qui est très difficile
à simuler de façon stable à 60 Hz, et encore plus sur un téléphone. La
méthode retenue est celle des « véhicules à rayons » des jeux, adaptée au
deux-roues.

| Élément | Modèle |
|---|---|
| Châssis | Un corps Havok (moto + pilote : 145 kg), centre de gravité et inerties réalistes. Les formes changent quand le pilote monte (on ajoute son buste). |
| Suspensions | Un rayon par roue depuis l'ancrage, ressort + amortisseur + butée. La compression donne la **charge** sur le pneu. |
| Pneus | Impulsions qui annulent le glissement latéral et transmettent moteur et freins, dans la limite **μ × charge**. La priorité va au latéral : la moto ne part pas de travers sous les freins. Les deux roues sont résolues **ensemble en 4 itérations** (impulsions séquentielles, comme les moteurs physiques) ; sinon la roue arrière défait la rotation amorcée par l'avant. |
| Direction | Braquage de 34° à l'arrêt, réduit à 3° à pleine vitesse, tourné progressivement. |
| Équilibre | Un « pilote » virtuel applique un couple pour amener la moto à l'**inclinaison d'équilibre** du virage, tan φ = v·ω/g (29° à 39 km/h dans un virage à 30°/s, mesuré). Il compense exactement le couple des pneus. Pieds au sol sous 1,2 m/s ; légère inclinaison sur la béquille une fois garée. |
| Moteur | 2 temps 50 cc, courbe de couple, embrayage centrifuge (3 400 → 5 200 tr/min), variateur (régime visé 4 500 → 7 000 tr/min), rupteur à 9 000 tr/min. **Bridage** : le rapport long est limité, d'où 45 km/h ; le débridage sera une amélioration mécanique. |
| Résistances | Traînée aérodynamique (CdA 0,6), résistance au roulement, frein moteur. |
| Freins | Tambours : ≈ 6 m/s² avec les deux. Frein maintenu à l'arrêt = **recul aux pieds**. |

- **Rendu interpolé.** Le corps physique est invisible ; le modèle 3D et la
  caméra du pilote sont interpolés entre les deux derniers pas, avec le
  nouveau rythme `lateFixedUpdate`, appelé après chaque pas physique.
- **Caméra du pilote.** Elle est rattachée aux yeux du pilote, avec un regard
  libre limité. Elle n'annule que **50 % de l'inclinaison**, compromis
  entre sensation et mal des transports.
- **Monter / descendre.** E, le bouton « Monter », ou Y à la manette, à
  proximité, sans avoir à viser la moto. Pour descendre, il faut rouler à
  moins de 9 km/h, et trois rayons cherchent la place de se tenir debout : à
  gauche, à droite, derrière, puis devant.
- **Commandes de conduite.** Elles réutilisent celles de la marche. Au
  clavier, gaz et guidon sont indépendants : la diagonale n'est pas
  normalisée (`getMoveAxes`), sinon Z + D ne donnait que 70 % des gaz.
- **Mesuré en jeu par les tests** : 0 à 37 km/h en 6 s, 45 km/h maximum,
  zigzag à 33 km/h sans quitter le sol, freinage d'urgence sans tête-à-queue,
  saut de 2,7 m depuis la rampe reçu sans chute.

**Limites connues** (pour plus tard) :
- pas de chute ni de glissade spectaculaire : le pilote rattrape toujours ;
- pas de contrôle de wheelie / stoppie ;
- variateur sans usure ;
- modèle 3D provisoire (à remplacer par un modèle Blender) ;
- pas de son moteur.

## 9. Stockage gratuit : ce qui va où

Le principe : **Git ne contient que des fichiers légers.** Pas de Git LFS,
dont le quota gratuit (stockage et bande passante mensuelle) s'épuise vite,
car chaque version et chaque clone comptent.

| Type | Exemples | Emplacement |
|---|---|---|
| Code et données | `.ts`, `.json`, `.css` | Git |
| Assets optimisés du jeu | `.glb` compressés, `.ktx2`, `.ogg` | Git (`public/assets/`), dans le budget |
| Sources lourdes | `.blend`, textures 4K, `.wav`, `.psd` | **Hors Git** : `assets-src/` + sauvegarde cloud gratuite |
| Assets tiers CC0 | Poly Haven, ambientCG, Kenney… | Non stockés : manifeste (URL, licence, empreinte) + script de téléchargement |
| Build | `dist/` | Jamais commité, reconstruit par la CI |

### Budgets (vérifiés par `npm run check:sizes` et la CI)

| Budget | Limite | Raison |
|---|---|---|
| Un fichier dans Git | 10 Mio | L'historique Git est permanent |
| `public/assets/` au total | 300 Mio | Téléchargement sur mobile |
| Un fichier du build | 25 Mio | Limite par fichier de Cloudflare Pages |
| Build total | 500 Mio | Limite des jeux HTML5 sur itch.io |
| Démarrage transféré | < 8 Mio (objectif) | Temps de chargement sur 4G |

Au démarrage de l'étape 0, le build pèse **4,1 Mio, soit environ 1,1 Mio
transféré** (Havok WASM : 2 Mio bruts).

Un jeu léger est **la même contrainte** que la performance mobile. Pour rester
dans les budgets : génération procédurale (terrain, routes, placement de la
végétation), textures répétables et partagées, compression (meshopt, KTX2,
Opus) et instanciation.

### Garde-fous

1. `.gitignore` exclut les formats sources lourds et `assets-src/`.
2. `.githooks/pre-commit` refuse tout fichier de plus de 10 Mo. Il s'active
   une fois avec `npm run hooks:install`.
3. La CI échoue si un budget est dépassé.

## 10. Hébergement gratuit (à mettre en place plus tard)

| Hébergeur | Points clés |
|---|---|
| **Cloudflare Pages** (choix principal) | Gratuit, 20 000 fichiers, 25 Mio par fichier, en-têtes HTTP personnalisés possibles (utile pour la physique multithread) |
| GitHub Pages | Gratuit sur un dépôt public, site de 1 Go maximum, 100 Go par mois |
| itch.io | Visibilité auprès des joueurs ; 500 Mo et environ 1 000 fichiers : il faudra regrouper les morceaux du monde |

Distribution mobile : **PWA d'abord** (installation depuis le navigateur,
gratuite), puis **Capacitor** pour des applications Android/iOS. Les outils
sont gratuits ; seule la publication sur les stores est payante (Google Play :
25 $ une fois ; App Store : 99 $/an et un Mac).

## 11. Tests et intégration continue

- **Unitaires (Vitest)** : modules purs (bus d'événements, résolution
  dynamique, détection GPU, choix du profil…).
- **Navigateur (Playwright)** : sur le build de production, profils « PC » et
  « téléphone émulé ».
  - Démarrage : la physique avance, aucune erreur console.
  - Joueur au clavier : marcher, sauter, s'accroupir, entrer dans le garage
    par le seuil, réticule sur la caisse à outils.
  - Joueur au tactile : prendre puis lancer, bouton Accroupir.
  - Cyclomoteur au clavier : monter, accélérer, tourner (la moto penche),
    freiner, descendre ; refus de descendre en roulant vite.
  - Cyclomoteur au tactile : vrai glisser du pouce sur le joystick (protocole
    Chrome DevTools) pour marcher, accélérer et freiner, puis boutons Monter et
    Descendre.
  - Le déplacement est piloté par la position, pas par le temps, pour ne pas
    dépendre de la vitesse de la machine.
- **CI GitHub Actions** (`.github/workflows/50cc-life.yml`) : types, tests,
  build, budgets, démarrage. Elle ne se déclenche que si `50cc-life/` change.
- *Limite :* la CI fait le rendu sans vrai GPU (SwiftShader). Les mesures de
  performance se font **sur de vrais appareils** : PC, Android d'entrée ou de
  milieu de gamme, iPhone.

## 12. Journal des décisions

| # | Décision | Raison |
|---|---|---|
| D1 | Sous-dossier `50cc-life/` dans le dépôt `le-qg` | Ne rien toucher au projet Le QG ; migration possible vers un dépôt dédié en gardant l'historique (`git subtree split`) |
| D2 | WebGL2 d'abord, WebGPU plus tard en option PC | WebGL2 est disponible partout ; WebGPU n'est pas encore universel sur mobile |
| D3 | Imports Babylon ciblés (`@babylonjs/core/…/fichier`) | Seul le code utilisé est inclus (bundle plus léger sur mobile) |
| D4 | Pas de temps fixe via le *lockstep* de Babylon | Physique identique sur tous les appareils, sans réinventer la roue |
| D5 | Résolution gérée par le jeu (`adaptToDeviceRatio: false`) | Plafond par profil + résolution dynamique |
| D6 | Interface en HTML/CSS natif, sans framework | Léger, accessible, aucune dépendance |
| D7 | Code en anglais, textes du jeu en français via `ui/i18n` | Convention du code, traduction possible plus tard |
| D8 | Pas de Git LFS, sources lourdes hors Git | Rester gratuit sans quota à surveiller |
| D9 | TypeScript 7 (compilateur natif) | Vérification des types beaucoup plus rapide ; Vite et Vitest ne dépendent pas de son API |
| D10 | Commandes par actions + trois appareils | Le gameplay ignore le matériel ; ZQSD/WASD automatique ; mobile et manette gratuits |
| D11 | Contrôleur de personnage Havok de Babylon, réglé + aide aux marches | Pentes, poussée et accroupissement fournis ; les réglages corrigent le flottement et les marches refusées |
| D12 | Objets portés par un « ressort » de vitesse | Garde les collisions (comme My Summer Car), aucun objet ne traverse un mur |
| D13 | Boutons tactiles en bascule (prendre, s'accroupir) | Garder un doigt appuyé longtemps est pénible sur téléphone |
| D14 | Moto « à rayons » + pilote virtuel qui gère l'inclinaison | Stable à 60 Hz sur mobile, comportement crédible (inclinaison d'équilibre, adhérence limitée) |
| D15 | Pneus résolus ensemble en 4 itérations | Virages serrés corrects à basse vitesse, coût négligeable |
| D16 | Modèle 3D séparé du corps physique, interpolé | Fluide à 120/144 Hz ; le modèle Blender remplacera les formes simples sans toucher à la physique |
| D17 | Moteur et variateur en TypeScript pur | Testés en quelques ms (vitesse max, accélération) ; base de la future simulation mécanique |
| D18 | Accès de débogage complet (`window.__50CC_DEV__`) en développement seulement | Inspection et scripts de test, absent du build publié |

## 13. Feuille de route

0. ✅ **Fondations** : moteur, physique, boucle, profils de qualité, stats, tests, CI.
1. ✅ **Joueur** : déplacement à la première personne, commandes clavier/souris, tactile et manette, prendre, porter et lancer.
2. ✅ **Cyclomoteur conduisible** : physique à rayons, équilibre, moteur 2T bridé, monter/descendre, tableau de bord.
3. **Streaming** des morceaux du monde + origine flottante.
4. **Garage et pièces** : démontage et remontage, piloté par les données.
5. **Simulation moteur 2 temps** reliée à la conduite.
6. **Économie, inventaire, sauvegarde** (IndexedDB).
7. Ensuite : chaîne d'assets semi-réalistes, audio, PWA, Capacitor, contenu.
