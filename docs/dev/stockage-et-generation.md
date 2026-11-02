# Stockage et génération

Deux fournisseurs interchangeables, choisis par le `.env` de l'API. Aucun code métier n'en dépend directement :
il utilise les classes abstraites `StorageDriver` (`api/src/storage`) et `GenerationProvider` (`api/src/generation`).

## Stockage

| `STORAGE_DRIVER` | Usage | Variables |
|---|---|---|
| `local` (défaut) | développement et tests ; fichiers dans `LOCAL_STORAGE_DIR` (`./storage`, ignoré par Git) | — |
| `r2` | Cloudflare R2, bucket **privé** ; lecture par URL signée à durée limitée | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` |

Le jeton R2 doit avoir le droit **Object Read & Write** sur le bucket. Si une variable R2 manque, l'API refuse de démarrer.

```bash
pnpm --filter api storage:test
```

Écrit, relit puis supprime un fichier de contrôle ; avec R2, vérifie aussi qu'une URL signée est lisible depuis Internet.
Pour tester R2 sans modifier le `.env` : `STORAGE_DRIVER=r2 pnpm --filter api storage:test`.

## Génération

| `GENERATION_PROVIDER` | Effet |
|---|---|
| `mock` (défaut) | simulée, aucun appel réseau, aucun coût. **Aucune IA n'est utilisée** : l'image rendue est une image de substitution marquée « SIMULATION », jamais la photo de l'utilisateur ; l'interface l'affiche clairement. **À ne jamais laisser actif en production** : sans `GENERATION_PROVIDER=higgsfield` dans le `.env`, aucune vraie création n'est produite |
| `higgsfield` | appels **réels et payants** à l'API Higgsfield ; exige `HF_API_KEY_ID` et `HF_API_KEY_SECRET` |

Authentification : `Authorization: Key <identifiant>:<secret>`, uniquement depuis le serveur. La console Higgsfield
affiche parfois la clé sous la forme `identifiant:secret` : les deux écritures sont acceptées dans `HF_API_KEY_SECRET`.
La clé n'est envoyée qu'à `HF_API_URL` (jamais à l'URL de dépôt des fichiers ni à une URL de suivi d'un autre domaine).

```bash
# 1. Vérifier les identifiants — gratuit, ne génère rien
pnpm --filter api generation:test

# 2. Essai de bout en bout — PAYANT (une génération). --yes est obligatoire.
pnpm --filter api generation:test -- --video clip.mp4 --image ref.jpg --resolution 480p --yes
```

L'essai dépose les fichiers chez Higgsfield, soumet un transfert de mouvement (`--model` pour changer de modèle),
attend le résultat (15 min max) et l'enregistre dans le stockage configuré. Les résultats Higgsfield ne restent
disponibles que 7 jours au moins : ils doivent être copiés dans notre stockage.

Contraintes du modèle `genjutsu/motion-transfer` : vidéo MP4 de 4 s minimum (tronquée au-delà de 30 s),
1 à 8 images (JPEG, PNG, WebP, GIF), résolutions `480p`, `720p`, `1080p`.

## Parcours de création (API `creations`)

| Route | Rôle |
|---|---|
| `GET /v1/creations/styles` | styles visibles (presets) avec coût en crédits calculé côté serveur |
| `POST /v1/creations` | multipart : `photo` + `styleId`, `format`, `text`, `price`, `phone`, `consent`. Réserve les crédits, stocke la photo, envoie au fournisseur |
| `GET /v1/creations`, `GET /v1/creations/:id` | liste paginée (filtre `status`) et détail ; consulter une création en cours la fait avancer |
| `GET /v1/creations/:id/file` | résultat ou aperçu, propriétaire seulement, lecture par morceaux (Range) |
| `DELETE /v1/creations/:id`, `POST /v1/creations/:id/report` | suppression (refusée si en cours ou signalée), signalement (gèle la conservation) |

Types de création déduits du catalogue : `fun` = preset `MOTION` ; `affiche` = produit facturé à l'image ; `pub` = autre preset vidéo.
Suivi : tâche BullMQ `advance-generations` toutes les 10 s (sans Redis : à chaque consultation). Succès → capture des crédits ;
échec, refus ou délai d'une heure → restitution (une seule fois). Le détail des choix de l'utilisateur est dans `Generation.options`.

- Mock : `MOCK_GENERATION_SECONDS` règle la durée ; un texte contenant `__echec__` fait échouer la création simulée.
- Styles de démonstration (développement seulement) : `pnpm --filter api seed:demo-presets`.
- Styles de démonstration : ils pointent vers le produit `IMAGE_EDIT_GROK` (voir ci-dessous).
- Pas encore faits : « Affiche à partir d'une description », « Animer cette affiche », purge automatique des fichiers expirés.

## Modèles, paramètres et formats (vérifiés le 1er novembre 2026)

Registre : `api/src/generation/models.ts`. **Higgsfield accepte sans erreur les champs qu'un modèle ne connaît pas** :
Soul v2 a accepté `image_urls` puis ignoré la photo. Une requête « acceptée » ne prouve donc rien ; le registre dit quoi envoyer
à chaque modèle, et un modèle absent du registre n'est jamais appelé (la création est refusée avant tout débit).

| Produit | Modèle | Photo | Paramètres envoyés | Coût fournisseur |
|---|---|---|---|---|
| `IMAGE_EDIT_GROK` (affiches) | `xai/grok-imagine-image-2.0` | utilisée | `prompt`, `image_urls`, `aspect_ratio` | 0,07 $ / image (estimation officielle) → 17 crédits |
| `IMAGE_SOUL2` | `higgsfield-ai/soul/v2/standard` | **ignorée** (texte → image) | `prompt`, `aspect_ratio` | 0,004 $ / image — non utilisable pour une affiche à partir d'une photo |
| `VIDEO_LIGHT_480` (tendances) | `higgsfield/genjutsu-light/motion-transfer/v1.0` | utilisée | `video_url`, `image_urls`, `resolution` | 0,05 $ par seconde **facturée** = sortie + vidéos de référence |

Pourquoi Grok pour les affiches : essais réels avec la même photo et le même texte. Soul ignore la photo ; Qwen Image 3 Edit et
Marketing Studio l'utilisent mais **inventent du texte non demandé** (« Collection Wax », « Affirmez votre style »…) ; Grok n'écrit que
le texte demandé. Qualité et résolution : valeurs par défaut du fournisseur.

**Formats proposés** : `1:1`, `4:3`, `3:2`, `3:4`, `2:3`, `16:9`, `9:16` — tous acceptés nativement par Grok et Soul (vérifié par
l'estimation gratuite `POST /estimate/{modèle}`, qui valide aussi les paramètres). `4:5` et `21:9` sont refusés par ces modèles et ne sont
pas proposés. Le format est demandé au modèle, jamais obtenu en recadrant. Chaque résultat est contrôlé : des proportions qui s'écartent de
plus de 3 % du format demandé font échouer la création (crédits restitués). Écart constaté : Marketing Studio rend 880 × 1168 pour du 3:4.

**Contrôle des résultats** (`api/src/creations/output-check.ts`) : le type est lu dans les octets, pas dans l'en-tête HTTP ; une image doit
avoir des dimensions lisibles et le bon format ; une vidéo doit être un vrai MP4 (`ftyp` + `moov`). Sinon : échec, crédits restitués, message
explicite (`MODERATION`, `TIMEOUT`, `NO_RESULT`, `BAD_RESULT`, `FORMAT`, `UNSUPPORTED`, `PROVIDER`, `CANCELED`). Le détail technique du
fournisseur n'est jamais montré à l'utilisateur.

**Sans style choisi**, aucun style n'est attaché (avant : le premier style publié du type, dont le nom devenait le titre et le texte par défaut
était ajouté à la description). Un style rattaché à un modèle qui ne sait pas le réaliser n'est ni proposé ni accepté.

**Facturation** : réservation à la création, capture au succès, restitution à l'échec — exclusives, jamais deux fois. Un délai dépassé après
une capture déjà faite ne rembourse pas et ne bloque pas la création.

### Outils d'essai (payants, `--yes` obligatoire)

```bash
# Prix annoncé par le fournisseur, SANS générer (gratuit) : voir api/src/generation/higgsfield-generation.provider.ts (estimate)
# Essai réel d'un modèle avec une photo (et une vidéo) :
GENERATION_PROVIDER=higgsfield pnpm --filter api exec tsx scripts/generation-probe.ts --yes   --model xai/grok-imagine-image-2.0 --image photo.webp --out resultat   --input '{"prompt":"…","image_urls":["@IMAGE@"],"aspect_ratio":"3:4"}'
```
