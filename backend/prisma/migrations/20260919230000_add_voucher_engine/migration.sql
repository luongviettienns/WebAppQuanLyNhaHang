-- Migration: 20260919230000_add_voucher_engine
-- Bo sung module Khuyen mai Voucher va giam gia don hang

-- 1. Tao bang Voucher
CREATE TABLE `Voucher` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `discountType` ENUM('PERCENTAGE', 'FIXED_AMOUNT') NOT NULL,
    `discountValue` INTEGER NOT NULL,
    `minOrderValue` INTEGER NOT NULL DEFAULT 0,
    `maxDiscount` INTEGER NULL,
    `usageLimit` INTEGER NOT NULL DEFAULT 100,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Voucher_code_key`(`code`),
    INDEX `Voucher_code_isActive_idx`(`code`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Them cac cot voucher va discountAmount vao bang Order
ALTER TABLE `Order`
    ADD COLUMN `discountAmount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `voucherId` INTEGER NULL,
    ADD COLUMN `voucherCode` VARCHAR(191) NULL;

-- 3. Tao khoa ngoai va index cho Order.voucherId
ALTER TABLE `Order` ADD CONSTRAINT `Order_voucherId_fkey`
    FOREIGN KEY (`voucherId`) REFERENCES `Voucher`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `Order_voucherId_idx` ON `Order`(`voucherId`);
