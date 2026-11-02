-- Notifications de paiement vérifiées (SasPay) : déduplication et traçabilité. Table nouvelle, aucune donnée existante touchée.
CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "providerTxId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "paymentId" UUID,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentWebhookEvent_gateway_providerTxId_event_key" ON "PaymentWebhookEvent"("gateway", "providerTxId", "event");
CREATE INDEX "PaymentWebhookEvent_paymentId_idx" ON "PaymentWebhookEvent"("paymentId");
CREATE INDEX "PaymentWebhookEvent_receivedAt_idx" ON "PaymentWebhookEvent"("receivedAt");
