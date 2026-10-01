CREATE TABLE `CustomerGroup` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CustomerGroup_code_key`(`code`),
  UNIQUE INDEX `CustomerGroup_name_key`(`name`),
  PRIMARY KEY (`id`)
);

CREATE TABLE `Customer` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `email` VARCHAR(160) NULL,
  `type` ENUM('INDIVIDUAL', 'COMPANY') NOT NULL DEFAULT 'INDIVIDUAL',
  `gender` ENUM('MALE', 'FEMALE', 'OTHER') NULL,
  `province` VARCHAR(120) NULL,
  `address` VARCHAR(255) NULL,
  `groupId` INTEGER NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Customer_code_key`(`code`),
  UNIQUE INDEX `Customer_phone_key`(`phone`),
  INDEX `Customer_groupId_isActive_idx`(`groupId`, `isActive`),
  INDEX `Customer_name_idx`(`name`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Customer_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `CustomerGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `ReservationPolicy` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `depositAmount` INTEGER NOT NULL DEFAULT 300000,
  `freeCancelBeforeMinutes` INTEGER NOT NULL DEFAULT 120,
  `lateCancelRefundPercent` INTEGER NOT NULL DEFAULT 0,
  `noShowRefundPercent` INTEGER NOT NULL DEFAULT 0,
  `gracePeriodMinutes` INTEGER NOT NULL DEFAULT 30,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ReservationPolicy_name_key`(`name`),
  INDEX `ReservationPolicy_isActive_idx`(`isActive`),
  PRIMARY KEY (`id`)
);

CREATE TABLE `Reservation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `accessToken` VARCHAR(96) NOT NULL,
  `customerId` INTEGER NOT NULL,
  `tableId` INTEGER NULL,
  `policyId` INTEGER NULL,
  `scheduledAt` DATETIME(3) NOT NULL,
  `partySize` INTEGER NOT NULL,
  `contactName` VARCHAR(160) NOT NULL,
  `contactPhone` VARCHAR(30) NOT NULL,
  `note` VARCHAR(1000) NULL,
  `status` ENUM('PENDING_DEPOSIT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING_DEPOSIT',
  `depositStatus` ENUM('UNPAID', 'WAITING_CONFIRMATION', 'PAID', 'REFUND_PENDING', 'REFUNDED', 'FORFEITED', 'APPLIED_TO_BILL') NOT NULL DEFAULT 'UNPAID',
  `depositAmount` INTEGER NOT NULL DEFAULT 0,
  `freeCancelBeforeMinutesSnapshot` INTEGER NOT NULL DEFAULT 120,
  `lateCancelRefundPercentSnapshot` INTEGER NOT NULL DEFAULT 0,
  `noShowRefundPercentSnapshot` INTEGER NOT NULL DEFAULT 0,
  `gracePeriodMinutesSnapshot` INTEGER NOT NULL DEFAULT 30,
  `paymentDeclaredAt` DATETIME(3) NULL,
  `checkedInAt` DATETIME(3) NULL,
  `checkedInByUserId` INTEGER NULL,
  `cancelledAt` DATETIME(3) NULL,
  `cancelReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Reservation_code_key`(`code`),
  UNIQUE INDEX `Reservation_accessToken_key`(`accessToken`),
  INDEX `Reservation_status_scheduledAt_idx`(`status`, `scheduledAt`),
  INDEX `Reservation_tableId_scheduledAt_idx`(`tableId`, `scheduledAt`),
  INDEX `Reservation_customerId_scheduledAt_idx`(`customerId`, `scheduledAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Reservation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Reservation_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `DiningTable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Reservation_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `ReservationPolicy`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `ReservationDepositTransaction` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `reservationId` INTEGER NOT NULL,
  `orderId` INTEGER NULL,
  `type` ENUM('DEPOSIT', 'REFUND', 'PARTIAL_REFUND', 'FORFEIT', 'APPLY_TO_BILL') NOT NULL,
  `status` ENUM('PENDING', 'SUCCESS', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `amount` INTEGER NOT NULL,
  `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD') NULL,
  `externalReference` VARCHAR(120) NULL,
  `reason` VARCHAR(500) NULL,
  `confirmedByUserId` INTEGER NULL,
  `confirmedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ReservationDepositTransaction_externalReference_key`(`externalReference`),
  UNIQUE INDEX `ReservationDepositTransaction_reservationId_orderId_key`(`reservationId`, `orderId`),
  INDEX `ReservationDepositTransaction_reservationId_createdAt_idx`(`reservationId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ReservationDepositTransaction_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `ReservationChange` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `reservationId` INTEGER NOT NULL,
  `oldScheduledAt` DATETIME(3) NOT NULL,
  `newScheduledAt` DATETIME(3) NOT NULL,
  `reason` VARCHAR(500) NULL,
  `changedByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ReservationChange_reservationId_createdAt_idx`(`reservationId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ReservationChange_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE `Order`
  ADD COLUMN `customerId` INTEGER NULL,
  ADD COLUMN `reservationId` INTEGER NULL,
  ADD INDEX `Order_customerId_createdAt_idx`(`customerId`, `createdAt`),
  ADD INDEX `Order_reservationId_idx`(`reservationId`),
  ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Order_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
