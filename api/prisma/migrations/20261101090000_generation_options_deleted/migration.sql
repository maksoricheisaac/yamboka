-- Parcours de génération : choix de l'utilisateur (texte, prix, téléphone, format) et suppression par le propriétaire.
-- Modification additive : deux colonnes facultatives, aucune donnée existante touchée.
ALTER TABLE "Generation" ADD COLUMN "options" JSONB;
ALTER TABLE "Generation" ADD COLUMN "deletedAt" TIMESTAMP(3);
