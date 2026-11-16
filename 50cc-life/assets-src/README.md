# assets-src/ — sources lourdes (hors Git)

Ce dossier contient les **fichiers de travail** : scènes Blender (`.blend`),
textures haute définition, sons bruts (`.wav`), fichiers Photoshop/Krita…

**Rien ici n'est envoyé sur GitHub** (voir `../.gitignore`) : seul ce README l'est.

## Pourquoi ?

Git conserve chaque version de chaque fichier pour toujours. Un `.blend` de
200 Mo sauvegardé 20 fois = 4 Go d'historique impossible à alléger. Git LFS
est limité (quota gratuit de stockage et de bande passante mensuelle).

## Comment travailler

1. Travaillez ici, dans Blender & co.
2. Exportez en glTF (`.glb`) / PNG.
3. Lancez le script d'optimisation (à venir : `npm run assets`) : il compresse
   (meshopt, textures KTX2, sons Opus/OGG) vers `../public/assets/`.
4. Commitez **uniquement** le résultat optimisé (`public/assets/`).

## Sauvegarde (gratuite)

Ce dossier n'étant pas sur GitHub, sauvegardez-le vous-même :

- dossier synchronisé Google Drive (15 Go gratuits) ou MEGA (20 Go gratuits),
- et/ou un disque externe.

Astuce : versionnez à la main les étapes importantes (`garage_v03.blend`).

## Assets gratuits de tiers (CC0)

Les assets téléchargés depuis Poly Haven, ambientCG, Kenney, Quaternius… ne
sont pas stockés : on notera leur adresse, leur licence et leur empreinte dans
un fichier manifeste, et un script les retéléchargera (étape ultérieure).
Toujours vérifier la licence avant d'utiliser un asset.
