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
├── assets-src/                sources lourdes : HORS GIT (voir § 12)
├── tools/check-sizes.mjs      budgets de taille
├── .githooks/pre-commit       refuse les fichiers de plus de 10 Mo
├── docs/ARCHITECTURE.md       ce document
├── CLAUDE.md                  consignes de travail (dont la règle de l'onglet DEV)
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
    │   ├── rendering/         post-traitements, meshKit (formes détaillées construites en code)
    │   ├── audio/             contexte Web Audio (déverrouillé au premier geste)
    │   └── save/              accès sûr au stockage local (préférences, sauvegarde)
    ├── player/                joueur à la 1re personne, interaction (prendre, lancer, démonter)
    ├── mechanics/             pièces, emplacements, règles de démontage, atelier 3D, tracé de l'échappement
    ├── economy/               porte-monnaie, boutique (règles pures + système), économie
    ├── save/                  format de sauvegarde (pur, validé) et sauvegarde automatique
    ├── vehicles/
    │   ├── bike/              physique de la moto, modèles 3D (supermotard détaillé, déco), fiches techniques
    │   ├── simulation/        boîte manuelle, embrayage auto, variateur (TS pur, testé)
    │   └── audio/             son moteur 2 temps synthétisé
    ├── world/                 environnement (ciel, reflets, lumière, ombres), scène de test
    ├── debug/                 panneau (Infos / DEV), registre des triches, API pour les tests
    └── ui/                    écrans et HUD HTML/CSS, commandes tactiles, textes (i18n)
```

Dossiers prévus aux étapes suivantes : `core/assets/`, `world/streaming/`,
`inventory/`, `data/` (catalogues en données).

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
| Reflets du ciel | — | oui | oui | oui |

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
- **Anti-clignotement.** Le changement de résolution est appliqué *au début*
  de l'image suivante, juste avant le rendu. Redimensionner le canvas juste
  après l'avoir dessiné l'efface, et le navigateur affichait une image vide.
  En plus, les 6 premières secondes (compilation des shaders) sont ignorées
  et les remontées sont rares (toutes les 4 s, puis 8, 16… jusqu'à 32 s).
  Avant ce correctif, l'image clignotait pendant environ 30 s au démarrage.
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

## 9. Supermotard à boîte, atelier et garage (étape 3)

### Le supermotard 50 à boîte

Fiche technique (`vehicles/bike/specs.ts`) inspirée des supermotards 50 cm³
des années 2020, sans marque réelle : 98 kg, roues de 17", 16 cm de
débattement, freins à disque, moteur 2T à boîte 6.

| Élément | Modèle (`vehicles/simulation/ManualDrivetrain.ts`, testé) |
|---|---|
| Moteur | Courbe de couple (pic de 4,5 N·m vers 9 000 tr/min), inertie du vilebrequin, frottements et pompage, vis de ralenti (≈ 1 600 tr/min) |
| Embrayage | À friction, avec trois états. **Débrayé** : le moteur tourne librement. **Patinage** : couple limité et morsure progressive, ce qui permet de démarrer en montant dans les tours. **Collé** : le moteur est lié à la roue. Au clavier, le levier se relâche en 0,8 s (on ne peut pas doser une touche). |
| Calage | Moteur entraîné sous 950 tr/min : il cale (lâcher l'embrayage d'un coup au ralenti, choc à l'arrêt en vitesse) |
| Boîte | Séquentielle N - 1 - 2 - … - 6 (point mort sous la 1re, plus fiable aux touches que le « demi-clic » réel), rapports d'un moteur 50 à boîte, embrayage obligatoire pour passer |
| Démarrage | Kick au point mort ou embrayage tiré, avec une chance de réussite qui dépend de la bougie. Démarrage à la poussette possible. |
| Bridage | Boîtier CDI coupant à 6 500 tr/min : **45 km/h en 6e**. Le CDI débridé (pièce) coupe à 11 500 tr/min : **70 à 85 km/h**. Vérifié par simulation dans les tests. |
| Inertie | Les pièces en rotation s'ajoutent à la masse quand l'embrayage est collé (≈ 35 kg équivalents en 1re, 4 kg en 6e) |
| Embrayage automatique | Aide optionnelle (`AutoClutch`) qui se comporte comme un embrayage centrifuge. Activée par défaut sur tactile. |

La moto ne connaît qu'une interface `Powertrain`. Le variateur du
cyclomoteur (étape 2) l'implémente aussi, pour de futurs scooters et
mobylettes.

### L'atelier : pièces démontables

- **Données** (`mechanics/parts.ts`, `slots.ts`). Chaque pièce a une fiche :
  nom, catégorie, masse, prix, effets, forme provisoire. Chaque emplacement
  indique sur quoi il se monte (`requires`), d'où découle l'ordre de
  démontage : bougie → culasse → (pot) → cylindre → piston. Le nombre de
  fixations donne la durée de dévissage.
- **Règles** (`EngineAssembly`, testé) : démonter, remonter, raisons de refus
  (« Retirez d'abord : Bougie », « Il faut d'abord : Culasse »), et effet sur
  le moteur (`EngineStats`). Une pièce indispensable manquante empêche de
  démarrer. Sans pot : bruit au maximum et −25 % de puissance. Un piston usé
  fait perdre de la compression. Une bougie usée démarre mal. Le pot course
  donne +15 %.
- **En 3D** (`MechanicsSystem`) :
  - viser une pièce montée et **maintenir Utiliser** la dévisse (anneau de
    progression) ; la pièce devient un objet physique que l'on porte ;
  - en approchant une pièce portée de son emplacement libre, un **fantôme**
    s'affiche, et maintenir Utiliser la revisse ;
  - il faut une moto à l'arrêt, sans pilote et moteur coupé.
- **Visée** :
  - les pièces montées sont visées par leur modèle 3D, car elles sont
    « dans » la forme physique de la moto, qui passe donc après ;
  - **aide à la visée** pour les petites pièces : la bougie compte comme
    visée si le rayon passe à moins de 3 cm.
- **Robustesse physique** : volume de collision et masse minimaux pour les
  petites pièces (sinon une bougie traverse le décor), et sol avec un volume
  de collision épais.

### Le garage

- Porte de 3,4 m et dalle surélevée de 15 cm.
- Établi avec les pièces de rechange : bougie neuve, CDI débridé, pot TURBINO RX et cartouche TURBINO Carbon.
- Étagère, et plafonnier commandé par un interrupteur. On l'éteint en
  mettant son intensité à 0, sans désactiver la lampe, pour éviter de
  recompiler les shaders.

### Son

Moteur 2 temps **synthétisé en temps réel** (`vehicles/audio/EngineSound.ts`),
sans fichier à télécharger :
- deux oscillateurs à la fréquence d'allumage (régime / 60) ;
- un bruit filtré pour le grésillement, puis une saturation ;
- un filtre qui s'ouvre avec les gaz.

Le volume dépend du pot. Le son démarre au premier geste du joueur (règle des
navigateurs), et le panneau 📊 permet de le couper.

## 10. Réalisme, échappement et onglet DEV (étape 4)

### Bridage d'usine réaliste

D'origine, la moto plafonne vers **50 km/h à plat** et monte à **55-60 km/h
en descente**, comme un vrai 50 bridé. Deux mécanismes, comme en vrai :

- **Étranglement à haut régime** (`Restriction` dans `Powertrain.ts`) : chaque
  pièce bridée réduit progressivement le couple entre deux régimes.

  | Pièce d'origine | Bridage |
  |---|---|
  | Pot passage haut VARONE (restricteur dans le coude) | 6 000 → 8 000 tr/min, garde 40 % |
  | Cartouche d'origine | 7 000 → 9 000 tr/min, garde 90 % |
  | Carburateur 12 mm | 9 000 → 12 000 tr/min, garde 80 % |

- **CDI bridé** : coupe l'allumage à 8 700 tr/min, soit 60 km/h en 6e. En
  descente, la pente aide le moteur à y monter, pas plus.

Résultats de la simulation (tests unitaires, 98 kg + 75 kg de pilote) :
49,7 km/h à plat, 56,6 km/h en descente à 4 %, 60,2 km/h à 6 %, environ
35 km/h en montée à 6 %. Débridée (CDI, pot et cartouche TURBINO) : environ
71 km/h, et un peu plus avec le carburateur 17,5 mm.

### Échappement en deux pièces

- Le **pot de détente** (passage haut) et la **cartouche** sont deux pièces :
  la cartouche se monte sur le pot, donc on la retire avant lui.
- Sans cartouche, le moteur perd un peu de puissance et hurle ; sans pot, il
  perd 40 % et fait le maximum de bruit.
- Le tracé du pot (`exhaustGeometry.ts`) est partagé par l'emplacement de la
  cartouche et le modèle 3D, pour que la cartouche tombe pile sur la queue
  du pot.
- Modèles : tube profilé (collecteur, cône divergent, ventre, cône
  convergent, queue), cordons de soudure, bride, pattes, colliers, carbone.

### Marques fictives

**VARONE** est le constructeur (la moto s'appelle VARONE SMX 50) et
**TURBINO** fabrique les échappements « course ». Les autocollants sont
dessinés en code dans des textures (aucune image, aucun logo réel). La
plaque d'immatriculation (GV-050 SM) est inventée.

### Modèle 3D détaillé, construit en code

`supermotardVisual.ts` assemble une moto crédible avec la boîte à outils
`core/rendering/meshKit.ts` :
- tubes courbes (cadre, cintre, durites) ;
- pièces tournées (pneus profilés, jantes, moyeux, disques, couronne) ;
- profilés balayés (selle, réservoir, garde-boue arrière) ;
- plaques découpées avec leur déco (écopes, caches) ;
- ressort hélicoïdal.

La fourche s'enfonce **le long de ses tubes** et le bras oscillant **pivote**
avec la suspension.

**Style** : celui des 50 supermotard récentes (repères publics du segment :
1 380 mm d'empattement, pneus 100/80-17 et 130/70-17, disque avant pétale de
300 mm, fourche inversée, cadre acier double berceau), sans copier de modèle
ni de déco réelle. Le modèle comprend :
- un cadre noir brillant ;
- un masque avant anguleux avec deux optiques LED en biais et un feu de jour ;
- des protège-mains ;
- des disques pétale flottants ;
- un sabot moteur en alu ;
- des écopes en pointe et des caches latéraux longs ;
- un garde-boue intérieur.

**Coût maîtrisé pour le mobile** : les surfaces de même nature (métal,
chrome, plastique brillant, plastique mat, feux) partagent un matériau, et
la couleur est portée par les sommets. On obtient environ 30 appels GPU pour
toute la moto au lieu d'une cinquantaine.

### Lumière

- **Ciel de reflets** généré en code (`skyReflection.ts`) : un cube de
  32 × 32 par face, avec des harmoniques sphériques calculées une fois. Il
  donne les reflets du chrome et de la peinture et l'ambiance du ciel. Coupé
  en qualité Basse : trop coûteux par pixel sur les petits mobiles.
- **La zone d'ombre suit le joueur** (± 24 m, calée sur la grille des
  texels) : les ombres restent nettes partout, sans scintiller.

### Onglet DEV (triches)

- Le panneau 📊 (F3) a deux onglets : **Infos** (statistiques, qualité,
  réglages) et **DEV** (triches).
- Les triches viennent d'un registre (`debug/CheatRegistry.ts`, dans
  `ctx.cheats`). Chaque système y ajoute les siennes dans son `init()`.
  L'onglet n'a donc pas à connaître les systèmes.
- **Règle permanente** (aussi écrite dans `CLAUDE.md`) : toute nouvelle
  fonctionnalité utile pour tester ou tricher ajoute sa triche.

| Groupe | Triches actuelles |
|---|---|
| Argent | +100 €, +1 000 €, +10 000 €, remettre à 0 € |
| Téléportation | Départ, garage, établi, route d'essai, pied et sommet de la colline. En moto, on est téléporté avec elle |
| Moto | Ramener au garage, moto devant moi, démarrage instantané, point mort, moteur DEV (×2,5, sans bridage) |
| Mécanique | Tout remettre à neuf, kit débridage complet, moteur d'origine, faire apparaître une pièce du catalogue, ranger les pièces |
| Joueur | Marche rapide ×3 |
| Monde | Lâcher une caisse (touche B) |

Le **porte-monnaie** (500 € au départ) s'affiche en haut à droite. La
boutique viendra avec l'économie.

### Colline d'essai

Elle se trouve en x = 30. On y vérifie en jeu les vitesses en pente :
- montée de 80 m à 6,25 % ;
- plateau de 20 m ;
- descente de 80 m.

## 11. Boutique et sauvegarde (étape 5)

### Boutique en ligne « Bécane Shop » (nom fictif)

- Un **ordinateur portable** sur un bureau du garage ouvre la boutique
  (viser + E, ou bouton « Ouvrir la boutique » au tactile).
- **Acheter** :
  - les pièces du catalogue sont rangées par rayon (échappement, allumage,
    admission, haut moteur) ;
  - chaque fiche résume ce que fait la pièce, calculé à partir de ses
    effets (« Bridé », « +15 % de puissance », « Coupure à 11 800 tr/min »…).
- **Livraison physique**, comme dans My Summer Car : le colis arrive après
  8 s sur la **palette** près de la porte. C'est une vraie pièce, qu'on porte
  jusqu'à la moto.
- **Vendre** : les pièces qui traînent dans le garage sont rachetées selon
  leur état, entre 15 % et 65 % du prix neuf. Une pièce montée doit d'abord
  être démontée ; la pièce tenue en main ne se vend pas.
- L'écran est en HTML/CSS (souris, doigt, Échap pour fermer). Pendant qu'il
  est ouvert, les **commandes du jeu sont coupées** et la souris est libérée
  (`InputManager.setUiCapture`).
- Règles pures et testées dans `economy/shop.ts` (prix de revente, fiches),
  orchestration dans `economy/ShopSystem.ts`.

### Sauvegarde automatique

- **Contenu** : argent, position du joueur, position de la moto, pièces
  montées et leur état, pièces posées dans le monde, colis en route (ils
  seront sur la palette au chargement).
- **Quand** : toutes les 20 s, quand l'onglet passe en arrière-plan, quand
  la page se ferme, et à la demande (onglet DEV).
- **Où** : `localStorage`, une seule clé de quelques Ko. L'écriture est
  synchrone, donc elle aboutit même pendant la fermeture de la page (ce
  n'est pas garanti avec IndexedDB). On passera à IndexedDB quand l'état du
  monde grossira.
- **Robuste** : `save/saveData.ts` valide tout. Une pièce inconnue, un
  nombre absurde ou une autre version sont ignorés, et une sauvegarde
  illisible équivaut à une nouvelle partie. Le format est versionné.
- La sauvegarde est appliquée **après** l'initialisation de tous les
  systèmes (`SaveSystem` est ajouté en dernier).

### Onglet DEV

- **Boutique** : livraison instantanée.
- **Sauvegarde** : sauvegarder maintenant ; nouvelle partie (efface la
  sauvegarde et recharge).
- **Téléportation** : « Ordinateur (boutique) ».

### Gagner de l'argent (prochaines étapes)

Choix du joueur : livraisons en 50, réparations pour des voisins et
revente de pièces. La revente est déjà là. Les livraisons et les
réparations demandent le monde ouvert et des personnages.

## 12. Stockage gratuit : ce qui va où

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

## 13. Hébergement gratuit (à mettre en place plus tard)

| Hébergeur | Points clés |
|---|---|
| **Cloudflare Pages** (choix principal) | Gratuit, 20 000 fichiers, 25 Mio par fichier, en-têtes HTTP personnalisés possibles (utile pour la physique multithread) |
| GitHub Pages | Gratuit sur un dépôt public, site de 1 Go maximum, 100 Go par mois |
| itch.io | Visibilité auprès des joueurs ; 500 Mo et environ 1 000 fichiers : il faudra regrouper les morceaux du monde |

Distribution mobile : **PWA d'abord** (installation depuis le navigateur,
gratuite), puis **Capacitor** pour des applications Android/iOS. Les outils
sont gratuits ; seule la publication sur les stores est payante (Google Play :
25 $ une fois ; App Store : 99 $/an et un Mac).

## 14. Tests et intégration continue

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
  - Supermotard au clavier :
    - kick, embrayage, 1re, démarrage, passage en 2e, freinage, descente ;
    - calage en lâchant l'embrayage sans gaz ;
    - passage refusé sans embrayer.
  - Supermotard au tactile : vrai glisser du pouce sur le joystick (protocole
    Chrome DevTools) jusqu'au garage, Monter, Démarrer, +, gaz, Descendre.
  - Atelier au clavier : démonter la bougie (maintenir E) empêche le
    démarrage ; la culasse refuse tant que la bougie est montée.
  - Atelier au tactile : remplacer la bougie usée par la neuve de l'établi.
    On démonte, on va à l'établi, on prend, on revient, on remonte.
  - Le déplacement est piloté par la position, pas par le temps, pour ne pas
    dépendre de la vitesse de la machine.
- **CI GitHub Actions** (`.github/workflows/50cc-life.yml`) : types, tests,
  build, budgets, démarrage. Elle ne se déclenche que si `50cc-life/` change.
- *Limite :* la CI fait le rendu sans vrai GPU (SwiftShader). Les mesures de
  performance se font **sur de vrais appareils** : PC, Android d'entrée ou de
  milieu de gamme, iPhone.

## 15. Journal des décisions

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
| D19 | Supermotard 50 à boîte « dans le style de », sans marque réelle | Réalisme voulu, sans risque de droit des marques |
| D20 | Embrayage modélisé (patinage, collage, calage), levier relâché en 0,8 s au clavier, embrayage auto en option | Conduite d'un vrai 50 à boîte, jouable au clavier comme au tactile |
| D21 | Point mort sous la 1re | Le « demi-clic » réel n'est pas reproductible de façon fiable avec des touches |
| D22 | Pièces en données + règles pures + atelier 3D séparé | Ajouter une pièce = une fiche ; règles testées en quelques ms |
| D23 | Démonter = viser et maintenir ; remonter = porter près de l'emplacement (fantôme) | Geste unique sur PC, tactile et manette, à la My Summer Car |
| D24 | Son moteur synthétisé (Web Audio) | Réagit au régime sans fichier audio (budget de taille), base pour un vrai mixage plus tard |
| D25 | Bridage par étranglement progressif du couple (pot, cartouche, carbu) + coupure CDI | Reproduit le vrai comportement d'un 50 bridé : 50 km/h à plat, 55-60 en descente |
| D26 | Cartouche séparée du pot, tracé partagé | Démontage réaliste (cartouche puis pot) ; la cartouche s'aligne toujours sur la queue du pot |
| D27 | Marques fictives VARONE / TURBINO, déco dessinée en code | Réalisme visuel sans droit des marques ni fichier image |
| D28 | Modèles détaillés construits en code, matériaux partagés + couleurs par sommet | Beaucoup de détails, peu d'appels GPU ; en attendant les modèles Blender |
| D29 | Ciel de reflets procédural, coupé en qualité Basse | Reflets PBR crédibles sans fichier HDR ; préserve les petits mobiles |
| D30 | Registre de triches alimenté par chaque système (onglet DEV) | L'onglet grandit avec le jeu sans dépendre des systèmes ; règle écrite dans CLAUDE.md |
| D31 | Résolution changée avant le rendu, période de chauffe de 6 s, remontées rares | Supprime le clignotement du démarrage (image vide après un redimensionnement, essais répétés) |
| D32 | Un appui reste valable pendant l'image qui suit, même longue | Aucun appui perdu sur un appareil qui rame (images de plus de 200 ms) |
| D33 | Sauvegarde dans localStorage (synchrone), format versionné et validé | Petite sauvegarde écrite même à la fermeture de la page ; une sauvegarde abîmée ne casse jamais le jeu |
| D34 | Achats livrés physiquement sur une palette au garage | Immersion façon My Summer Car : la pièce achetée se porte et se monte comme les autres |
| D35 | Écrans HTML qui coupent les commandes du jeu (`setUiCapture`) | Pas de déplacement ni de clic dans le monde pendant qu'on fait ses achats |

## 16. Feuille de route

0. ✅ **Fondations** : moteur, physique, boucle, profils de qualité, stats, tests, CI.
1. ✅ **Joueur** : déplacement à la première personne, commandes clavier/souris, tactile et manette, prendre, porter et lancer.
2. ✅ **Cyclomoteur conduisible** : physique à rayons, équilibre, moteur 2T bridé, monter/descendre, tableau de bord.
3. ✅ **Garage, pièces et boîte de vitesses** : supermotard 50 à boîte 6, embrayage, kick, atelier (démontage/remontage), son moteur.
4. ✅ **Réalisme et outils de test** : bridage réaliste, pot passage haut + cartouche, marques fictives, moto détaillée, reflets, onglet DEV, argent, colline d'essai.
5. ✅ **Boutique et sauvegarde** : ordinateur du garage, achat livré sur palette, revente selon l'état, sauvegarde automatique.
6. **Monde ouvert** (streaming des morceaux + origine flottante) : routes, village, station-service.
7. **Gagner sa vie** : livraisons en 50, réparations pour les voisins, achat d'épaves à démonter.
8. **Outils et usure** : essence et mélange 2T, usure des pièces en roulant, pannes, clés de différentes tailles.
9. Ensuite : vrais modèles 3D (proportions exactes), audio, PWA, Capacitor, contenu.
