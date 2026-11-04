-- Yamboka ne produit plus que des vidéos : la génération d'images est dépréciée, rien n'est supprimé.
--  * les produits d'image sont désactivés (aucune nouvelle création ; les lignes et leurs prix restent lisibles) ;
--  * les styles (presets) qui reposent sur un produit d'image sont masqués ;
--  * les créations d'images déjà faites sont masquées de l'espace client (hidden = true), leurs fichiers suivent la
--    rétention normale. Elles restent visibles dans l'administration, qui peut les ré-afficher.
-- Les valeurs d'enum (BillingUnit.IMAGE, MediaRole.OUTPUT_IMAGE) sont conservées : les retirer demande l'accord du
-- propriétaire, après vérification des données de production. Retour arrière : voir down.sql (même dossier).
UPDATE "GenerationProduct" SET "active" = false, "updatedAt" = now()
WHERE "billingUnit" = 'IMAGE' AND "active" = true;

UPDATE "Preset" SET "visible" = false, "featured" = false, "updatedAt" = now()
WHERE "productId" IN (SELECT "id" FROM "GenerationProduct" WHERE "billingUnit" = 'IMAGE')
  AND ("visible" = true OR "featured" = true);

UPDATE "Generation" SET "hidden" = true
WHERE "productId" IN (SELECT "id" FROM "GenerationProduct" WHERE "billingUnit" = 'IMAGE')
  AND "hidden" = false;
