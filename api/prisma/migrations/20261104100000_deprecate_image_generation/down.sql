-- Retour arrière MANUEL de 20261104100000_deprecate_image_generation (Prisma n'exécute pas ce fichier).
-- Ré-affiche les créations d'images, republie leurs styles et réactive les produits d'image. Les produits qui
-- étaient déjà inactifs avant la migration (par exemple POSTER_IDEOGRAM) sont ré-activés aussi : à relire avant usage.
UPDATE "Generation" SET "hidden" = false
WHERE "productId" IN (SELECT "id" FROM "GenerationProduct" WHERE "billingUnit" = 'IMAGE');

UPDATE "Preset" SET "visible" = true, "updatedAt" = now()
WHERE "productId" IN (SELECT "id" FROM "GenerationProduct" WHERE "billingUnit" = 'IMAGE');

UPDATE "GenerationProduct" SET "active" = true, "updatedAt" = now()
WHERE "billingUnit" = 'IMAGE' AND "code" IN ('IMAGE_SOUL2', 'IMAGE_EDIT_GROK');
