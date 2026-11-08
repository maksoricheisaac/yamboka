# Développement : contrôles Git locaux

Le dépôt n'a pas de GitHub Actions. La qualité est donc contrôlée **sur votre poste**, par des hooks Git
(Husky) qui bloquent un commit ou un push contenant une erreur détectable.

## Installation

```bash
pnpm install      # active aussi les hooks (script « prepare » → Husky)
```

Aucune autre étape. Après un clone neuf, `pnpm install` suffit. Vérification : `git config core.hooksPath`
doit afficher `.husky/_`. Dans une installation sans dossier `.git` (image Docker, archive), les hooks sont
simplement ignorés.

Prérequis : Node ≥ 24 et pnpm (voir `packageManager` dans `package.json`). Les hooks fonctionnent sous Windows
(Git Bash, installé avec Git for Windows) et sous Linux/macOS.

## Ce qui s'exécute, et quand

| Hook | Déclencheur | Contrôles | Durée typique |
|---|---|---|---|
| `pre-commit` | `git commit` | `lint-staged` : ESLint `--fix` sur les fichiers indexés, puis TypeScript des projets touchés | quelques secondes à ~30 s |
| `commit-msg` | `git commit` | Commitlint (Conventional Commits) | < 1 s |
| `pre-push` | `git push` | `pnpm check` : lint, format, TypeScript, tests unitaires, build de production | plusieurs minutes |

Détails du `pre-commit` (`lint-staged.config.mjs`) :

- **ESLint** sur les `.ts`/`.tsx` indexés de `api`, `app`, `web`, `packages/shared`, avec `--fix` et sans tolérance
  pour les avertissements. Dans l'API, **Prettier est intégré à ESLint** : un fichier mal formaté est reformaté
  automatiquement et remis dans l'index ; une erreur non corrigeable automatiquement bloque le commit.
- **Construction du paquet partagé** s'il est modifié (api, app et web lisent son code compilé).
- **TypeScript** (`typecheck`) des projets touchés (tous, si `packages/shared` change). Il porte sur le projet
  entier, y compris vos modifications non indexées.
- Les **tests ne sont pas lancés** à chaque commit (trop lent) : ils le sont avant le push.

Prettier : seul `api` a une configuration Prettier (`api/.prettierrc`) ; `app` et `web` ne sont pas formatés par
Prettier (introduire Prettier y reformaterait tout le code existant : décision à prendre à part).

## Commandes de vérification manuelle

| Commande | Rôle |
|---|---|
| `pnpm lint` | ESLint de tous les projets (le paquet partagé est vérifié par `tsc`) |
| `pnpm format:check` | Prettier en lecture seule sur l'API (`pnpm --filter api format` pour corriger) |
| `pnpm typecheck` | `tsc` sur tous les projets (`next typegen` d'abord pour `app` et `web`) |
| `pnpm test` | Tests unitaires (Jest, API) |
| `pnpm build:check` | Build de production de tous les projets, dans `.next-check` (ne touche pas à `.next`) |
| `pnpm check` | **Tout ce qui précède, dans l'ordre**. C'est exactement ce que lance le `pre-push` |
| `pnpm test:e2e` | Tests de navigateur Playwright (longs, hors hooks) |
| `pnpm --filter api test:e2e` | Tests d'intégration API (base PostgreSQL de test requise, hors hooks) |

Lancez `pnpm check` avant un push important : vous voyez les erreurs sans attendre le hook.

## Convention de commit

[Conventional Commits](https://www.conventionalcommits.org/fr/) : `type(portée facultative): description`.

| Type | Usage |
|---|---|
| `feat` | nouvelle fonctionnalité |
| `fix` | correction de bug |
| `docs` | documentation |
| `style` | formatage, sans effet sur le code |
| `refactor` | restructuration sans changement de comportement |
| `test` | ajout ou correction de tests |
| `chore` | maintenance |
| `perf` | performances |
| `build` | système de build, dépendances |
| `ci` | intégration continue |
| `revert` | annulation d'un commit |

Exemples : `feat(app): ajout du filtre d'historique`, `fix(api): arrondi du montant sur mesure`.
La première ligne fait 100 caractères au plus. Les messages de fusion (`Merge …`) sont acceptés tels quels.

## Quand un hook bloque

1. **Lisez le message** : il indique le fichier, la ligne et la règle.
2. **ESLint / formatage** : `pnpm --filter <projet> exec eslint --fix <fichier>` corrige l'essentiel ; corrigez le
   reste à la main. Ne désactivez pas la règle pour passer.
3. **TypeScript** : corrigez l'erreur de type (`pnpm typecheck` pour la revoir).
4. **Commitlint** : reformulez avec `git commit --amend` (commit non poussé) ou refaites `git commit` avec un type valide.
5. **Push bloqué** : lancez `pnpm check`, corrigez l'étape en échec (`pnpm test`, `pnpm build:check`…), recommitez,
   poussez de nouveau.

Il ne faut **pas** contourner les hooks (`--no-verify`, `HUSKY=0`) : ils sont la seule barrière avant GitHub.

## Fichiers de configuration

`.husky/` (scripts des hooks), `lint-staged.config.mjs`, `commitlint.config.mjs`, `scripts/install-hooks.mjs`
(activation), `scripts/build-check.mjs` (build de vérification), scripts racine dans `package.json`.
