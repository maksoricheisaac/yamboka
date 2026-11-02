-- Génération d'images : Soul v2 est un modèle texte -> image qui IGNORE la photo envoyée (constaté par essai réel,
-- documentation officielle Higgsfield). Les affiches faites à partir d'une photo passent par Grok Image 2.0 (édition
-- d'image), seul modèle testé qui utilise la photo sans ajouter de texte non demandé.
-- Prix : 0,07 $ par image (estimation officielle POST /estimate, qualité par défaut) = 40 FCFA ; avec la règle du projet
-- (crédits = coût FCFA / 2,5 arrondi au supérieur) : 17 crédits. À ajuster dans l'administration (Offre > Produits).
-- Modification additive : une colonne facultative, un produit, et les styles d'image déjà publiés suivent le nouveau produit.
ALTER TABLE "Generation" ADD COLUMN "failureCode" TEXT;

INSERT INTO "GenerationProduct"
  ("id", "code", "name", "providerModel", "resolution", "billingUnit", "creditsPerUnit", "providerCostUsdPerUnit",
   "billableMultiplier", "minSeconds", "maxSeconds", "phase", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'IMAGE_EDIT_GROK', 'Image à partir d''une photo (Grok Image 2.0)', 'xai/grok-imagine-image-2.0',
       NULL, 'IMAGE'::"BillingUnit", 17, 0.07, 1, NULL, NULL, 'MVP'::"ProductPhase", true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "GenerationProduct" WHERE "code" = 'IMAGE_EDIT_GROK');

UPDATE "Preset"
SET "productId" = (SELECT "id" FROM "GenerationProduct" WHERE "code" = 'IMAGE_EDIT_GROK')
WHERE "productId" = (SELECT "id" FROM "GenerationProduct" WHERE "code" = 'IMAGE_SOUL2');
