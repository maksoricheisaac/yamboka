# Médias du site public : inventaire, noms, prompts Higgsfield, mise en ligne

Ce fichier recense **tous les emplacements** du site public (`web/`) qui doivent recevoir une vidéo ou une image, avec pour chacun : le nom du fichier, le format, le modèle à utiliser, le prompt, et où le déposer.

**Comportement du site (déjà codé)** : il n'y a rien à renseigner dans le code. Chaque média est **détecté sur le disque** à la construction du site : si le fichier existe, il s'affiche ; sinon l'illustration actuelle (étiquetée « Démo ») reste en place. Règles :
- Une **vidéo exige son affiche** : `x.mp4` **et** `x.webp`. Si un seul des deux existe, la vidéo est ignorée et un avertissement `[media] … ignoré` apparaît dans les logs de construction.
- Une **paire avant/après** exige ses quatre fichiers ; sinon les deux côtés restent en illustration.
- Après avoir déposé des fichiers : redémarrer `pnpm dev:web` (développement) ou **reconstruire et redéployer** le service `web` (production). Les médias sont figés à la construction.
- Les textes (« Aperçu illustratif », légende de la galerie, pied de page) passent seuls à « Exemple généré avec Yamboka » quand le média réel est présent.

Principe d'économie : **7 vidéos + 4 images IA** suffisent pour la majorité des emplacements. Les autres cases réutilisent les affiches (`.webp`) de ces médias.

## 1. Règles de nommage (à respecter exactement)

- Minuscules, sans accent, sans espace, mots séparés par des tirets : `danse-apres.mp4`.
- Vidéos et images de démonstration : `<sujet>-<role>.<extension>`, avec rôle = `avant`, `apres`, `personnage`, `creation`.
- Une vidéo `x.mp4` a toujours son affiche `x.webp` (même nom).
- Fichiers de travail (bruts Higgsfield, images sources) : **ne pas les mettre dans `web/`**. Gardez-les dans un dossier hors dépôt, par exemple `C:\DEV\PERSONAL\YAMBOKA-medias\brut\`, avec le suffixe `-brut` : `danse-avant-brut.mp4`, `danse-personnage-brut.png`.

## 2. Formats et poids

| Type | Format | Dimensions | Poids max |
|---|---|---|---|
| Vidéo de démonstration | MP4 H.264, muet, 6 à 8 s, boucle | 720 × 900 (4:5) | 1,5 Mo |
| Affiche de vidéo | WebP | 720 × 900 | 90 Ko |
| Image 4:5 (personnage, galerie) | WebP | 720 × 900 | 80 Ko |
| Image de cas d'usage | WebP | 800 × 600 (4:3) | 60 Ko |
| Capture d'écran de l'application | WebP | 540 × 1170 | 60 Ko |
| Photo « À propos » | WebP | 1600 × 900 (16:9) | 150 Ko |
| Image de partage | JPG | 1200 × 630 | 300 Ko |

Durée des paires : si la vidéo « après » est plus courte que 7 s (le transfert de mouvement garde la durée de la source), la vidéo « avant » doit avoir la même durée. Le script `scripts/compress-media.ps1` coupe à 7 s maximum, sans rallonger.

Contraintes de paires : chaque paire avant/après a **la même durée, les mêmes dimensions et le même cadrage**, sinon le curseur de comparaison ne s'aligne pas. La fin de chaque vidéo doit rejoindre son début (mouvement qui revient à sa pose de départ), car elles tournent en boucle.

## 3. Inventaire complet des emplacements

Légende : le site est **déjà branché** pour tous ces emplacements. La colonne « État » dit seulement si le média est lu à partir de la liste du comparateur de l'accueil (**Accueil**) ou d'un autre composant (**Détecté**) ; dans tous les cas, le fichier est pris automatiquement s'il existe.

### A. Vidéos

| # | Emplacement | Page | Fichiers | État |
|---|---|---|---|---|
| 1 | Hero : la création terminée | Accueil | `hero-creation.mp4` + `.webp` | Détecté |
| 2 | Danse afro, **avant** | Accueil, comparateur | `danse-avant.mp4` + `.webp` | Accueil |
| 3 | Danse afro, **après** | Accueil, comparateur | `danse-apres.mp4` + `.webp` | Accueil |
| 4 | Pub de boutique, **avant** | Accueil, comparateur | `boutique-avant.mp4` + `.webp` | Accueil |
| 5 | Pub de boutique, **après** | Accueil, comparateur | `boutique-apres.mp4` + `.webp` | Accueil |
| 6 | Anniversaire, **avant** | Accueil, comparateur | `fete-avant.mp4` + `.webp` | Accueil |
| 7 | Anniversaire, **après** | Accueil, comparateur | `fete-apres.mp4` + `.webp` | Accueil |
| 8 | Galerie : 3 cartes vidéo (danse, boutique, anniversaire) et leur fenêtre de détail | Galerie | **Réutilisent les n° 2 à 7** | Détecté |

Pour la galerie, la vignette est en 16:10 : elle utilisera l'affiche 4:5 recadrée par CSS (`object-cover`), donc aucun fichier supplémentaire.

### B. Images à générer

| # | Emplacement | Fichier | Utilisé dans |
|---|---|---|---|
| 9 | Personnage de la danse | `danse-personnage.webp` | Hero (carte « Votre photo »), accueil étape 2, fonctionnalités |
| 10 | Galerie : portrait stylisé | `galerie-portrait.webp` | Galerie (vignette + détail), fonctionnalités « Des images aussi » |
| 11 | Galerie : mode et vitrine | `galerie-mode.webp` | Galerie (vignette + détail) |
| 12 | Galerie : invitation d'événement | `galerie-invitation.webp` | Galerie (vignette + détail) |

### C. Emplacements qui réutilisent des fichiers existants (détectés automatiquement)

| Emplacement | Page | Réutilise |
|---|---|---|
| Hero, petite carte « Votre vidéo » | Accueil | `danse-avant.webp` |
| Hero, petite carte « Votre photo » | Accueil | `danse-personnage.webp` |
| 3 miniatures du sélecteur (masquées sur mobile) | Accueil | `danse-apres.webp`, `boutique-apres.webp`, `fete-apres.webp` |
| « Trois étapes », étape 1 | Accueil | `danse-avant.webp` |
| « Trois étapes », étape 2 | Accueil | `danse-personnage.webp` |
| « Trois étapes », étape 3 | Accueil | `danse-apres.webp` |
| Carte flottante du bandeau final | Accueil | `danse-apres.webp` |
| Bandeau final (`CtaBand`) | Galerie, FAQ, tarifs, fonctionnalités, cas d'usage, comment ça marche, à propos | `danse-apres.webp` |
| « Transformez une vidéo » : 3 cartes (vidéo + photo → résultat) | Fonctionnalités | `danse-avant.webp`, `danse-personnage.webp`, `danse-apres.webp` |
| « Des images aussi » | Fonctionnalités | `galerie-portrait.webp` |

### D. Identité et partage

| # | Élément | Fichier / emplacement | État actuel |
|---|---|---|---|
| 13 | Logo définitif (monogramme carré, SVG) | `web/public/images/logo.svg` | Monogramme provisoire dans le code ; le fichier le remplace dès qu'il existe (en-tête et pied de page) |
| 14 | Icône du navigateur | `web/app/icon.svg` et `web/app/favicon.ico` | Provisoires, à refaire avec le logo définitif |
| 15 | Icône iOS | `web/app/apple-icon.png` (180 × 180) | Absente |
| 16 | Image de partage (WhatsApp, Facebook, X) | `web/public/images/partage.jpg` | Dégradé vert avec texte, généré par `opengraph-image.tsx` ; le fichier est servi tel quel dès qu'il existe |

Pour l'image de partage : rien à supprimer. `opengraph-image.tsx` sert `partage.jpg` s'il existe (WhatsApp, Facebook et X lisent la même adresse), sinon il génère l'image habituelle. Les icônes `icon.svg`, `favicon.ico` et `apple-icon.png` suivent la convention de fichiers de Next.js : il suffit de remplacer les fichiers de `web/app/`.

### E. Optionnel : pages sans visuel aujourd'hui

| # | Emplacement | Page | Fichiers | Nature |
|---|---|---|---|---|
| 17 | Créateurs de contenu | Cas d'usage | `usage-createur.webp` | Image IA |
| 18 | Commerçants, boutiques | Cas d'usage | `usage-commercant.webp` | Image IA |
| 19 | Événementiel, églises, associations | Cas d'usage | `usage-evenement.webp` | Image IA |
| 20 | Agences, community managers | Cas d'usage | `usage-agence.webp` | Image IA |
| 21 | Étape 1 : créer le compte | Comment ça marche | `comment-1-compte.webp` | **Capture réelle** de l'application |
| 22 | Étape 2 : acheter des crédits | Comment ça marche | `comment-2-credits.webp` | **Capture réelle** |
| 23 | Étape 3 : créer | Comment ça marche | `comment-3-creation.webp` | **Capture réelle, à faire à l'ouverture des créations** |
| 24 | Étape 4 : suivre et télécharger | Comment ça marche | `comment-4-suivi.webp` | **Capture réelle, à faire à l'ouverture des créations** |
| 25 | Photo « À propos » | À propos | `a-propos-brazzaville.webp` | **Vraie photo** (la vôtre ou sous licence) |
| 26 | Illustration 404 (facultatif, sans intérêt réel) | Page introuvable | — | À sauter |

Les étapes 3 et 4 de « Comment ça marche » ne sont pas capturables aujourd'hui : l'espace client indique que les créations « ouvrent bientôt ». Ne mettez pas de maquette inventée présentée comme une capture. Ces deux visuels se font à l'ouverture, ou on garde le texte seul.

Les pages tarifs, contact, FAQ et légales n'ont pas besoin de visuel.

### F. Textes à adapter quand les vrais médias arrivent

- « Aperçu illustratif » sous le hero (`hero-stage.tsx`)
- « Illustration de démonstration, pas une création réelle » (`gallery.tsx`)
- Le chapô de la page galerie
- Le texte du pied de page (« démonstrations illustratives »)
- L'étiquette « Démo » sur la carte résultat de la page fonctionnalités

Les médias étant générés par IA, remplacez ces mentions par « Exemple généré avec Yamboka » plutôt que de les supprimer sans rien dire.

## 4. Modèles à utiliser

Je ne peux pas voir quels modèles votre compte Higgsfield propose aujourd'hui : je n'invente donc pas de noms. Voici ce que le projet impose et ce qu'il faut choisir.

| Médias | Modèle | Pourquoi |
|---|---|---|
| Vidéos « après » (n° 3, 5, 7) | **`genjutsu/motion-transfer`** (le modèle déjà utilisé par le produit, voir `stockage-et-generation.md`) | Même pipeline que le client : la vidéo « avant » donne le mouvement, l'image du personnage donne l'apparence. Choisir **720p**. La vidéo source doit durer au moins 4 s. |
| Vidéos « avant » (n° 2, 4, 6) | Un modèle **texte vers vidéo** de votre compte, réaliste | Il doit rendre un rendu « téléphone » crédible, avec un cadrage stable. |
| Hero (n° 1) | Un modèle **image vers vidéo** de votre compte | Part de l'image `danse-personnage` pour garder le même personnage. |
| Images (n° 9 à 12, 17 à 20, 16) | Le générateur d'**images** de votre compte | Choisir celui qui rend le mieux les visages et les peaux foncées. |

Faites un essai à bas coût (480p ou une seule génération) avant de lancer les 7 vidéos.

## 5. Workflow

1. Générez les trois vidéos **« avant »** (prompts A).
2. Générez les images de **personnage** (prompts B). Le personnage de la danse sert aussi de point de départ au hero.
3. Lancez le **transfert de mouvement** (`genjutsu/motion-transfer`) : vidéo « avant » + image du personnage → vidéo **« après »** (prompts C si l'outil accepte un texte).
4. Générez le **hero** en image vers vidéo à partir de `danse-personnage` (ou réutilisez `danse-apres` si vous voulez économiser des crédits).
5. Générez les images de la galerie et, si vous incluez la section E, les 4 images de cas d'usage.
6. Compressez tout (section 8), contrôlez les poids, déposez les fichiers (section 9).

Les prompts sont en **anglais** (meilleurs résultats). Pour toutes les vidéos : vertical 4:5, caméra **fixe** (ni zoom ni mouvement de caméra), sans texte ni logo dans l'image.

Contexte visuel du site : couleurs chaudes (vert profond, terracotta, jaune ambre, bleu ciel), personnes d'Afrique centrale, décors du quotidien (cour, boutique, salon), ni luxe artificiel ni ton publicitaire américain.

## 6. Prompts : vidéos

### N° 1 : Hero (`hero-creation.mp4`) — image vers vidéo
Partez de l'image `danse-personnage` (prompt B de la danse).

```
The character from the image dances a smooth afro dance in a sunlit courtyard, soft golden hour light, warm green and terracotta palette, subtle sparkles of light around her moving hands, cinematic but natural, shallow depth of field. Fixed camera, vertical 4:5 framing, full body visible, one continuous looping movement that ends in her starting pose. No text, no logo.
```
À éviter : `camera zoom, camera shake, text, watermark, extra fingers, distorted face, cut`.

### N° 2 : Danse afro, avant (`danse-avant.mp4`) — texte vers vidéo
```
Handheld smartphone video look, a young Central African woman dances a simple afro dance in a plain courtyard, casual everyday clothes, natural daylight, slightly flat colors, no filters. Phone on a tripod, fixed vertical 4:5 framing, full body visible, 8 seconds, one repeating dance loop that ends in her starting pose. No text, no logo.
```

### N° 3 : Danse afro, après (`danse-apres.mp4`) — transfert de mouvement
Image du personnage : voir **n° 9** (section 7). Texte de transfert :
```
Keep the exact dance movement, timing and framing of the reference video. Replace the dancer with the character from the image, keep her outfit and style. Fixed camera, no zoom, smooth natural motion, looping.
```

### N° 4 : Pub de boutique, avant (`boutique-avant.mp4`) — texte vers vidéo
```
Handheld smartphone video look, a Central African woman shop owner in a small clothing boutique holds up a colorful dress to the camera, turns it slowly left and right, smiles, then lowers it back. Plain shop with shelves, natural light, casual and realistic. Phone on a tripod, fixed vertical 4:5 framing, waist up, 8 seconds, ends in her starting pose. No text, no logo.
```

### N° 5 : Pub de boutique, après (`boutique-apres.mp4`) — transfert de mouvement
Image du personnage (à générer d'abord, gardez-la hors dépôt : `boutique-personnage-brut.png`) :
```
Waist-up portrait of an elegant Central African fashion model in a bright modern boutique, same pose as the reference video's first frame, holding a colorful wax-print dress, warm studio lighting, clean polished advertising look, green and terracotta accents, vertical 4:5, no text, no logo.
```
Texte de transfert :
```
Keep the exact gestures, timing and framing of the reference video. Replace the shop owner with the model from the image, polished advertising look, soft light, fixed camera, smooth motion, looping.
```

### N° 6 : Anniversaire, avant (`fete-avant.mp4`) — texte vers vidéo
```
Handheld smartphone video look, a smiling Central African man in a living room waves at the camera with both hands, then points to a small birthday cake on a table, then waves again. Simple home setting, natural indoor light, casual and realistic. Phone on a tripod, fixed vertical 4:5 framing, waist up, 8 seconds, ends in his starting pose. No text, no logo.
```

### N° 7 : Anniversaire, après (`fete-apres.mp4`) — transfert de mouvement
Image du personnage (`fete-personnage-brut.png`) :
```
Waist-up portrait of a cheerful animated character, 3D stylized with Central African features and warm skin tones, same pose as the reference video's first frame, festive room with balloons and a birthday cake on the table, sky blue and warm yellow palette, soft lighting, vertical 4:5, no text, no logo.
```
Texte de transfert :
```
Keep the exact gestures, timing and framing of the reference video. Replace the man with the character from the image, keep the festive decor, add a few floating confetti. Fixed camera, smooth motion, looping.
```

## 7. Prompts : images

### N° 9 : Personnage de la danse (`danse-personnage.webp`)
Même image pour la carte « Votre photo », l'étape 2 et le départ du hero. Le pose doit correspondre à la première image de `danse-avant.mp4`.
```
Full body portrait of a stylized Central African dancer, same standing pose and position as the reference video's first frame, vibrant wax-print outfit in deep green and terracotta, glowing warm light, painterly semi-realistic style, sunlit courtyard background, vertical 4:5, sharp face, no text.
```

### N° 10 : Galerie, portrait stylisé (`galerie-portrait.webp`)
```
Stylized portrait of a young Central African woman, head and shoulders, colorful illustrated look with warm teal and amber tones, soft glow, elegant braids with gold accessories, painterly semi-realistic style, plain warm background, vertical 4:5, no text, no logo.
```

### N° 11 : Galerie, mode et vitrine (`galerie-mode.webp`)
```
Fashion visual for a boutique: a Central African model wearing a modern wax-print outfit, standing in a bright shop window, clean editorial look, warm light, green and terracotta accents, vertical 4:5, sharp details of the fabric, no text, no logo.
```

### N° 12 : Galerie, invitation d'événement (`galerie-invitation.webp`)
```
Festive event invitation background, no text: warm evening lights, decorated hall with colorful fabrics and string lights, a joyful Central African couple or group in the foreground seen from behind, sky blue and warm yellow palette, vertical 4:5, empty space at the top for text added later, no text, no logo.
```

### N° 16 : Image de partage (`opengraph-image.jpg`, 1200 × 630)
```
Wide horizontal composition 1200x630: on the left half, empty deep-green area left free for text added later; on the right half, a vibrant stylized Central African dancer in wax-print clothing with soft golden light and subtle sparkles. Warm green, terracotta and amber palette, clean and modern, no text, no logo.
```
Ajoutez ensuite le texte (« Yamboka », la phrase d'accroche) dans un éditeur d'image, pas par l'IA, qui orthographie mal.

### N° 17 à 20 : Cas d'usage (4:3)
Chaque image : `usage-<nom>.webp`, 800 × 600, personnes d'Afrique centrale, lumière naturelle, couleurs chaudes, pas de texte.
- **`usage-createur`**
  ```
  A young Central African content creator filming a dance with a smartphone on a small tripod in a bright courtyard, colorful clothes, natural light, warm tones, horizontal 4:3, no text, no logo.
  ```
- **`usage-commercant`**
  ```
  A Central African woman shop owner showing a product to her smartphone inside a small clothing boutique, colorful fabrics on shelves, warm natural light, horizontal 4:3, no text, no logo.
  ```
- **`usage-evenement`**
  ```
  Volunteers preparing a community event in a decorated hall, colorful banners without text, one person holding a phone to film the room, warm evening light, horizontal 4:3, no text, no logo.
  ```
- **`usage-agence`**
  ```
  Two Central African community managers working together at a table with a laptop and a phone showing a vertical video, bright simple office, warm light, horizontal 4:3, no text, no logo.
  ```

### N° 21 à 25 : Photos réelles (pas de prompt)
- **Captures d'écran** (`comment-1-compte`, `comment-2-credits`, puis `comment-3-creation` et `comment-4-suivi` à l'ouverture) : prenez-les sur un téléphone ou en mode mobile du navigateur, 540 × 1170, avec un compte de démonstration (pas de vraies données d'utilisateur, ni e-mail ni solde réels visibles).
- **`a-propos-brazzaville`** : une vraie photo dont vous avez les droits (ou sous licence), pas une image générée. Pas de visage reconnaissable sans accord de la personne.

## 8. Compression et affiches (ffmpeg et cwebp)

Vidéo (à adapter au nom du fichier) :
```bash
ffmpeg -i source.mp4 -t 7 -an \
  -vf "scale=720:900:force_original_aspect_ratio=increase,crop=720:900,fps=24" \
  -c:v libx264 -profile:v main -pix_fmt yuv420p -preset slow -crf 28 \
  -movflags +faststart danse-apres.mp4
```
Si la vidéo dépasse 1,5 Mo : `-crf 30` ou `scale=640:800`. Pour une paire avant/après, gardez le même `-t` et les mêmes dimensions.

Affiche d'une vidéo (image à 1 s) :
```bash
ffmpeg -i danse-apres.mp4 -ss 1 -frames:v 1 -vf scale=720:900 \
  -c:v libwebp -quality 70 danse-apres.webp
```
Si elle dépasse 90 Ko : `-quality 55`. Les affiches sont en 720 × 900 car elles s'affichent en grand dans la galerie : à 480 px elles apparaissaient floues.

Image en WebP (à partir d'un PNG ou JPG) :
```bash
ffmpeg -i source.png -vf "scale=720:900:force_original_aspect_ratio=increase,crop=720:900" \
  -c:v libwebp -quality 75 danse-personnage.webp
```
Image de partage :
```bash
ffmpeg -i partage-brut.png -vf scale=1200:630 -q:v 4 opengraph-image.jpg
```
Contrôlez les poids avec `ls -l`.

## 9. Où les mettre

### Recommandation : dans le dépôt, sans service externe

| Type | Dossier |
|---|---|
| Vidéos, affiches, `danse-personnage` | `web/public/demos/` (le dossier existe déjà) |
| Images de la galerie, cas d'usage, captures, photo « À propos » | `web/public/images/` (**pas** `demos/` : les `galerie-*.webp` rangées dans `demos/` ne sont pas détectées) |
| Logo, image de partage | `web/public/images/` (`logo.svg`, `partage.jpg`) |
| Icône iOS, icônes du navigateur | `web/app/` (convention Next.js : `apple-icon.png`, `icon.svg`, `favicon.ico`) |

Les URL publiques seront de la forme `/demos/danse-apres.mp4` et `/images/galerie-mode.webp`. Le service `web` (Dokploy) les sert directement : rien à configurer, aucun compte supplémentaire, aucun coût. Le total attendu est d'environ 12 Mo.

Une fois les fichiers déposés aux bons noms, il n'y a **rien à renseigner dans le code** : `web/lib/media.ts` les détecte à la construction. Les textes alternatifs (lecteurs d'écran) sont déjà écrits dans ce fichier ; modifiez-les là si besoin.

Un fichier manquant ne casse pas la page : l'illustration reste. Un fichier présent mais mal nommé est simplement ignoré (un `.mp4` sans `.webp` déclenche un avertissement à la construction).

Pour tester en local : déposer les fichiers, relancer `pnpm dev:web`, ouvrir `http://localhost:3000`.

### Quand passer à un service externe
- **Si le poids du site grossit** (plus de 50 Mo) ou si le conteneur `web` ralentit : mettre les fichiers sur un CDN. Attention : la détection actuelle lit le disque (`web/public/`), elle ne gère pas les URL distantes ; passer à un CDN demanderait une petite évolution de `web/lib/media.ts` (à faire à ce moment-là, pas avant).
- **Cloudinary** : le plan gratuit suffit pour ce volume ; il compresse et convertit automatiquement.
- **Cloudflare R2** (déjà utilisé par le projet) : **ne réutilisez pas le bucket actuel**, qui est privé et réservé aux créations des clients. Créez un second bucket **public** (domaine personnalisé) pour le contenu du site.
- Les **créations des clients** (futur espace de génération) restent dans le bucket R2 privé avec URL signées, comme prévu dans `stockage-et-generation.md`. C'est un autre sujet.

## 10. Liste de contrôle

- [ ] 7 vidéos produites, 6 à 8 s, muettes, 4:5, ≤ 1,5 Mo, avec leur affiche WebP ≤ 90 Ko
- [ ] Chaque paire avant/après : même durée, même cadrage, mouvement identique
- [ ] `danse-personnage` : la pose correspond à la première image de `danse-avant.mp4`
- [ ] 3 images de galerie + `danse-personnage` : 720 × 900, ≤ 80 Ko
- [ ] Image de partage 1200 × 630 ≤ 300 Ko, nommée `partage.jpg` dans `web/public/images/`
- [ ] Logo définitif, icône navigateur, `apple-icon.png`
- [ ] Section E (si retenue) : 4 images de cas d'usage ; captures sans données réelles ; photo « À propos » avec droits
- [ ] Aucun texte, logo ni visage reconnaissable d'une personne réelle dans les images IA
- [ ] Fichiers déposés dans `web/public/demos/`, `web/public/images/`, `web/app/`
- [ ] Pas d'avertissement `[media] … ignoré` dans les logs de `pnpm build` (chaque `.mp4` a son `.webp`)
- [ ] Site reconstruit après le dépôt des fichiers ; mentions « Démo » et « illustratif » passées à « Exemple généré avec Yamboka » là où le média est réel
- [ ] Contrôle sur téléphone : le curseur Avant/Après suit bien les deux vidéos
