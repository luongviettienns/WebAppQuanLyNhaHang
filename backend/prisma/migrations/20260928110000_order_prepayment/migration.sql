ALTER TABLE `Order`
  MODIFY `paymentStatus` ENUM('UNPAID', 'WAITING_CONFIRMATION', 'PAID', 'VOIDED') NOT NULL DEFAULT 'UNPAID';

CREATE TABLE `OrderPaymentTransaction` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `orderId` INTEGER NOT NULL,
  `status` ENUM('PENDING', 'SUCCESS', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `amount` INTEGER NOT NULL,
  `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD') NOT NULL DEFAULT 'BANK_TRANSFER',
  `externalReference` VARCHAR(120) NULL,
  `reason` VARCHAR(500) NULL,
  `confirmedByUserId` INTEGER NULL,
  `confirmedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `OrderPaymentTransaction_externalReference_key`(`externalReference`),
  INDEX `OrderPaymentTransaction_orderId_status_createdAt_idx`(`orderId`, `status`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `OrderPaymentTransaction_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `OrderPaymentTransaction_confirmedByUserId_fkey` FOREIGN KEY (`confirmedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);
