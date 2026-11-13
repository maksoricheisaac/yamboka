-- CreateEnum
CREATE TYPE "CreditOrigin" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentCheckKind" AS ENUM ('PROVIDER', 'MANUAL');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "creditOrigin" "CreditOrigin",
ADD COLUMN     "creditedById" UUID,
ADD COLUMN     "lastReconcileAt" TIMESTAMP(3),
ADD COLUMN     "lastReconcileError" TEXT,
ADD COLUMN     "reconcileAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PaymentCheck" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "kind" "PaymentCheckKind" NOT NULL,
    "source" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "amount" INTEGER,
    "currency" TEXT,
    "proofReference" TEXT,
    "detail" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentCheck_paymentId_createdAt_idx" ON "PaymentCheck"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_creditedAt_idx" ON "Payment"("status", "creditedAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_creditedById_fkey" FOREIGN KEY ("creditedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCheck" ADD CONSTRAINT "PaymentCheck_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCheck" ADD CONSTRAINT "PaymentCheck_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reprise de l'existant : tout paiement déjà crédité l'a été par la vérification automatique du fournisseur.
UPDATE "Payment" SET "creditOrigin" = 'AUTO' WHERE "creditedAt" IS NOT NULL AND "creditOrigin" IS NULL;
