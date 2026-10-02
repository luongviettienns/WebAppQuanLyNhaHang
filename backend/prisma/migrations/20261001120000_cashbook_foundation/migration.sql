-- Cashbook foundation for the current pKhanh schema.
-- This migration is additive and intentionally does not activate the ledger.

ALTER TABLE `Order`
  MODIFY `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET') NULL;

ALTER TABLE `OrderPaymentTransaction`
  MODIFY `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET') NOT NULL DEFAULT 'BANK_TRANSFER';

ALTER TABLE `ReservationDepositTransaction`
  MODIFY `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET') NULL;

ALTER TABLE `OrderReturn`
  MODIFY `refundMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET') NOT NULL DEFAULT 'CASH';

CREATE TABLE `FinancialAccount` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `type` ENUM('CASH', 'BANK', 'E_WALLET') NOT NULL,
  `openingBalance` INTEGER NOT NULL DEFAULT 0,
  `openingAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `bankName` VARCHAR(120) NULL,
  `accountNumber` VARCHAR(100) NULL,
  `walletProvider` VARCHAR(120) NULL,
  `walletIdentifier` VARCHAR(100) NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `FinancialAccount_code_key`(`code`),
  INDEX `FinancialAccount_type_isActive_isDefault_idx`(`type`, `isActive`, `isDefault`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CashFlowCategory` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `direction` ENUM('RECEIPT', 'PAYMENT') NOT NULL,
  `affectsBusinessResultDefault` BOOLEAN NOT NULL DEFAULT false,
  `isSystem` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CashFlowCategory_code_key`(`code`),
  INDEX `CashFlowCategory_direction_isActive_idx`(`direction`, `isActive`),
  INDEX `CashFlowCategory_isSystem_isActive_idx`(`isSystem`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FinancialParty` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(160) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `note` VARCHAR(500) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `FinancialParty_name_idx`(`name`),
  INDEX `FinancialParty_isActive_name_idx`(`isActive`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CashbookSetting` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `activatedAt` DATETIME(3) NULL,
  `activatedByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CashVoucher` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `direction` ENUM('RECEIPT', 'PAYMENT') NOT NULL,
  `status` ENUM('POSTED', 'CANCELLED') NOT NULL DEFAULT 'POSTED',
  `occurredAt` DATETIME(3) NOT NULL,
  `amount` INTEGER NOT NULL,
  `accountId` INTEGER NOT NULL,
  `categoryId` INTEGER NOT NULL,
  `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET') NULL,
  `handlerUserId` INTEGER NULL,
  `handlerName` VARCHAR(120) NULL,
  `counterpartyType` VARCHAR(50) NULL,
  `counterpartyId` INTEGER NULL,
  `counterpartyName` VARCHAR(160) NULL,
  `note` VARCHAR(1000) NULL,
  `affectsBusinessResult` BOOLEAN NOT NULL DEFAULT false,
  `sourceType` ENUM('MANUAL', 'RESERVATION_DEPOSIT', 'RESERVATION_REFUND', 'ORDER_PAYMENT', 'SALES_RETURN_REFUND', 'PURCHASE_RECEIPT_PAYMENT', 'SUPPLIER_PAYMENT', 'PURCHASE_RETURN_REFUND', 'PAYROLL_PAYMENT', 'REVERSAL') NOT NULL,
  `sourceTransactionId` INTEGER NULL,
  `sourceCode` VARCHAR(100) NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `clientRequestId` VARCHAR(128) NULL,
  `linkedPurchaseReceiptId` INTEGER NULL,
  `sourceInvoiceNumber` VARCHAR(100) NULL,
  `sourceInvoiceDate` DATETIME(3) NULL,
  `reversalOfId` INTEGER NULL,
  `cancelledAt` DATETIME(3) NULL,
  `cancelledByUserId` INTEGER NULL,
  `cancelReason` VARCHAR(500) NULL,
  `createdByUserId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CashVoucher_code_key`(`code`),
  UNIQUE INDEX `CashVoucher_sourceKey_key`(`sourceKey`),
  UNIQUE INDEX `CashVoucher_reversalOfId_key`(`reversalOfId`),
  UNIQUE INDEX `CashVoucher_createdByUserId_clientRequestId_key`(`createdByUserId`, `clientRequestId`),
  INDEX `CashVoucher_accountId_occurredAt_id_idx`(`accountId`, `occurredAt`, `id`),
  INDEX `CashVoucher_categoryId_occurredAt_idx`(`categoryId`, `occurredAt`),
  INDEX `CashVoucher_sourceType_sourceTransactionId_idx`(`sourceType`, `sourceTransactionId`),
  INDEX `CashVoucher_createdByUserId_createdAt_idx`(`createdByUserId`, `createdAt`),
  INDEX `CashVoucher_linkedPurchaseReceiptId_idx`(`linkedPurchaseReceiptId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CashVoucher_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `FinancialAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CashVoucher_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `CashFlowCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CashVoucher_handlerUserId_fkey` FOREIGN KEY (`handlerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `CashVoucher_cancelledByUserId_fkey` FOREIGN KEY (`cancelledByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `CashVoucher_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CashVoucher_linkedPurchaseReceiptId_fkey` FOREIGN KEY (`linkedPurchaseReceiptId`) REFERENCES `PurchaseReceipt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `CashVoucher_reversalOfId_fkey` FOREIGN KEY (`reversalOfId`) REFERENCES `CashVoucher`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CashbookSetting`
  ADD CONSTRAINT `CashbookSetting_activatedByUserId_fkey` FOREIGN KEY (`activatedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `FinancialAccount` (`code`, `name`, `type`, `openingBalance`, `openingAt`, `isDefault`, `isActive`, `updatedAt`)
VALUES ('CASH', 'Tiền mặt', 'CASH', 0, CURRENT_TIMESTAMP(3), true, true, CURRENT_TIMESTAMP(3));

INSERT INTO `CashFlowCategory` (`code`, `name`, `direction`, `affectsBusinessResultDefault`, `isSystem`, `isActive`, `updatedAt`) VALUES
  ('CUSTOMER_PAYMENT', 'Khách thanh toán', 'RECEIPT', false, true, true, CURRENT_TIMESTAMP(3)),
  ('SUPPLIER_REFUND', 'Nhà cung cấp hoàn tiền', 'RECEIPT', false, true, true, CURRENT_TIMESTAMP(3)),
  ('OTHER_INCOME', 'Thu khác', 'RECEIPT', true, true, true, CURRENT_TIMESTAMP(3)),
  ('SUPPLIER_PAYMENT', 'Trả nhà cung cấp', 'PAYMENT', false, true, true, CURRENT_TIMESTAMP(3)),
  ('CUSTOMER_REFUND', 'Hoàn tiền khách', 'PAYMENT', false, true, true, CURRENT_TIMESTAMP(3)),
  ('OPERATING_EXPENSE', 'Chi phí vận hành', 'PAYMENT', true, true, true, CURRENT_TIMESTAMP(3)),
  ('OTHER_EXPENSE', 'Chi khác', 'PAYMENT', true, true, true, CURRENT_TIMESTAMP(3));

INSERT INTO `CashbookSetting` (`id`, `activatedAt`, `activatedByUserId`, `updatedAt`)
VALUES (1, NULL, NULL, CURRENT_TIMESTAMP(3));
