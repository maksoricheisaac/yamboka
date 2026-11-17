-- Devis affiche au client, garde cote serveur pour un temps reglable (10 minutes par defaut).
-- Appliquer une nouvelle configuration prend effet immediatement sur les NOUVEAUX devis ; un devis deja
-- affiche reste honore pendant sa validite, a la condition absolue qu'il couvre encore le cout fournisseur.
-- Le devis porte le slug du modele et les parametres EXACTS : il ne vaut que pour eux.
CREATE TABLE "CreationQuote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "modelSlug" TEXT NOT NULL,
    "resolution" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "options" JSONB NOT NULL,
    "credits" INTEGER NOT NULL,
    "costMicroUsd" BIGINT NOT NULL,
    "pricingConfigId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreationQuote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreationQuote_userId_createdAt_idx" ON "CreationQuote"("userId", "createdAt");
CREATE INDEX "CreationQuote_expiresAt_idx" ON "CreationQuote"("expiresAt");

ALTER TABLE "CreationQuote" ADD CONSTRAINT "CreationQuote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreationQuote" ADD CONSTRAINT creation_quote_values CHECK (
  "credits" > 0 AND "durationSeconds" > 0 AND "costMicroUsd" >= 0
);
