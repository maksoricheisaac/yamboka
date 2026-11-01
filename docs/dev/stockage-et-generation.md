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
| `mock` (défaut) | simulée, aucun appel réseau, aucun coût |
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
- **Non vérifié avec le fournisseur réel** : seuls les paramètres du transfert de mouvement sont documentés ; ceux des
  styles affiche et pub (`prompt`, `aspect_ratio`) sont à confirmer avant `GENERATION_PROVIDER=higgsfield`.
- Pas encore faits : « Affiche à partir d'une description », « Animer cette affiche », purge automatique des fichiers expirés.
