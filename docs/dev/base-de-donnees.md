# Base de données

PostgreSQL 16, Prisma 7 (client généré dans `api/src/generated/prisma`, ignoré par Git, régénéré par `pnpm install`
via `postinstall` ou `pnpm --filter api db:generate`).

## Développement local

`docker/docker-compose.dev.yml` démarre PostgreSQL (port **5433**, pour ne pas entrer en conflit avec une installation
locale sur 5432) et Redis (port 6380). Les données vivent dans le volume Docker `yamboka-dev_pgdata`.

## Migrations

Les migrations sont versionnées dans `api/prisma/migrations` et à committer.

| Migration | Contenu |
|---|---|
| `init` | Tables, énumérations, index, clés étrangères |
| `ledger_immutability` | Trigger interdisant `UPDATE`, `DELETE` et `TRUNCATE` sur `CreditLedger` ; contraintes `CHECK` (signe du montant selon le type, montants positifs) |

Ne jamais modifier une migration déjà appliquée : en créer une nouvelle. Avant une migration sur une base contenant des
données, faire une sauvegarde (voir plus bas).

## Registre de crédits

`CreditLedger` est en ajout seul (RG-02). Le solde est `SUM(amount)` par utilisateur ; il n'existe pas de colonne « solde ».
La contrainte d'unicité sur `reference` rend les opérations idempotentes. Une correction passe par un mouvement `ADJUSTMENT`.
Conséquence en test : on ne peut pas vider la table ; les tests d'intégration utilisent une base dédiée recréée à chaque exécution.

## Seed

`pnpm --filter api db:seed` est idempotent (upserts). Il crée : l'administrateur (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), la devise XAF
(1 crédit = 25 FCFA), les 6 produits (2 actifs en phase 1), les 6 packs, 3 presets (invisibles tant que leurs médias n'existent pas),
les paramètres par défaut et les textes légaux de base (**à faire relire par un juriste**).

Packs : `credits` est le nombre de crédits de base ; total = base × (1 + bonus %), soit 20, 40, 103, 210, 432 et 1 100.

## Sauvegarde et restauration

```bash
# Sauvegarde (format custom, compressé)
docker exec yamboka-dev-postgres-1 pg_dump -U yamboka -Fc yamboka_dev > yamboka_$(date +%F).dump

# Restauration dans une base vide
docker exec -i yamboka-dev-postgres-1 pg_restore -U yamboka -d yamboka_dev --clean --if-exists < yamboka_2026-10-22.dump
```

En production : `pg_dump` quotidien vers un stockage distinct du VPS, conservé 30 jours, avec un test de restauration régulier
(détaillé au lot 8).
