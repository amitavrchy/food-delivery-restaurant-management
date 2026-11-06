ALTER TABLE "Payment" ADD COLUMN "checkoutUrl" TEXT, ADD COLUMN "paymentIntentId" TEXT;
CREATE TABLE "PaymentRefund" (
  "id" TEXT PRIMARY KEY, "paymentId" TEXT NOT NULL, "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" > 0),
  "status" TEXT NOT NULL DEFAULT 'REQUESTED', "providerReference" TEXT UNIQUE, "idempotencyKey" TEXT NOT NULL UNIQUE,
  "reason" TEXT NOT NULL, "requestedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PaymentEvent" ("id" TEXT PRIMARY KEY, "provider" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
