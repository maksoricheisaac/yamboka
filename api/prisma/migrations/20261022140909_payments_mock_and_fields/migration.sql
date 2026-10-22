-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bonusCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failureReason" TEXT,
ALTER COLUMN "externalReference" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MockPaymentTransaction" (
    "reference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockPaymentTransaction_pkey" PRIMARY KEY ("reference")
);
