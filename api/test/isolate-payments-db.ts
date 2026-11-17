import { TEST_ENV } from './test-env';

/**
 * À importer AVANT les helpers : cette suite modifie, le temps d'un test, le bonus de premier achat d'un
 * pack et le réglage global `firstPurchaseBonusEnabled`. Or ces deux valeurs entrent dans la VALEUR
 * PLANCHER d'un crédit, dont dérivent tous les prix affichés : pendant cette fenêtre, une autre suite
 * partageant la base lit des tarifs différents et échoue sans raison apparente (vu sur
 * `creations.e2e-spec.ts`, « le format ne change pas le prix », et possible sur les équivalences de packs
 * de `catalog.e2e-spec.ts`).
 *
 * Base dédiée, donc : la règle du projet est qu'une suite qui écrit un état GLOBAL a la sienne.
 */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_payments_test',
);
