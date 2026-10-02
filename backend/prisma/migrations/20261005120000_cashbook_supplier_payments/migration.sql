-- Add account/payment snapshots to draft receipts and return vouchers.
ALTER TABLE `PurchaseReceipt`
  ADD COLUMN `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET') NOT NULL DEFAULT 'CASH',
  ADD COLUMN `financialAccountId` INTEGER NULL,
  ADD COLUMN `paymentExternalReference` VARCHAR(120) NULL,
  ADD INDEX `PurchaseReceipt_financialAccountId_receivedAt_idx` (`financialAccountId`, `receivedAt`),
  ADD UNIQUE INDEX `PurchaseReceipt_paymentExternalReference_key` (`paymentExternalReference`),
  ADD CONSTRAINT `PurchaseReceipt_financialAccountId_fkey`
    FOREIGN KEY (`financialAccountId`) REFERENCES `FinancialAccount` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PurchaseReturn`
  ADD COLUMN `financialAccountId` INTEGER NULL,
  ADD COLUMN `refundExternalReference` VARCHAR(120) NULL,
  ADD INDEX `PurchaseReturn_financialAccountId_completedAt_idx` (`financialAccountId`, `completedAt`),
  ADD UNIQUE INDEX `PurchaseReturn_refundExternalReference_key` (`refundExternalReference`),
  ADD CONSTRAINT `PurchaseReturn_financialAccountId_fkey`
    FOREIGN KEY (`financialAccountId`) REFERENCES `FinancialAccount` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `SupplierPayment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `supplierId` INTEGER NOT NULL,
  `purchaseReceiptId` INTEGER NULL,
  `financialAccountId` INTEGER NULL,
  `amount` INTEGER NOT NULL,
  `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET') NOT NULL,
  `status` ENUM('SUCCESS', 'REVERSED') NOT NULL DEFAULT 'SUCCESS',
  `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `externalReference` VARCHAR(120) NULL,
  `idempotencyKey` VARCHAR(128) NULL,
  `requestDigest` CHAR(64) NULL,
  `reversalIdempotencyKey` VARCHAR(128) NULL,
  `reversalRequestDigest` CHAR(64) NULL,
  `note` VARCHAR(500) NULL,
  `createdByUserId` INTEGER NULL,
  `createdByName` VARCHAR(120) NULL,
  `reversedAt` DATETIME(3) NULL,
  `reversedByUserId` INTEGER NULL,
  `reverseReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SupplierPayment_purchaseReceiptId_key` (`purchaseReceiptId`),
  UNIQUE INDEX `SupplierPayment_externalReference_key` (`externalReference`),
  UNIQUE INDEX `SupplierPayment_idempotencyKey_key` (`idempotencyKey`),
  UNIQUE INDEX `SupplierPayment_reversalIdempotencyKey_key` (`reversalIdempotencyKey`),
  INDEX `SupplierPayment_supplierId_status_paidAt_idx` (`supplierId`, `status`, `paidAt`),
  INDEX `SupplierPayment_financialAccountId_paidAt_idx` (`financialAccountId`, `paidAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SupplierPayment_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `SupplierPayment_purchaseReceiptId_fkey` FOREIGN KEY (`purchaseReceiptId`) REFERENCES `PurchaseReceipt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `SupplierPayment_financialAccountId_fkey` FOREIGN KEY (`financialAccountId`) REFERENCES `FinancialAccount` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve the paidAmount cash movement on already-posted receipts as a source row.
INSERT INTO `SupplierPayment` (`supplierId`, `purchaseReceiptId`, `amount`, `paymentMethod`, `status`, `paidAt`, `createdByUserId`, `createdAt`)
SELECT `supplierId`, `id`, `paidAmount`, `paymentMethod`, 'SUCCESS', COALESCE(`postedAt`, `receivedAt`), `postedByUserId`, COALESCE(`postedAt`, `receivedAt`)
FROM `PurchaseReceipt`
WHERE `status` = 'POSTED' AND `supplierId` IS NOT NULL AND `paidAmount` > 0;
