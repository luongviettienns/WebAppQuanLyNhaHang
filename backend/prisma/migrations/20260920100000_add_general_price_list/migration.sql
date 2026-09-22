-- Migration: 20260920100000_add_general_price_list
-- Them bang gia chung va luu bang gia da ap dung cho don hang

CREATE TABLE `PriceList` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('GENERAL', 'CUSTOM') NOT NULL DEFAULT 'GENERAL',
    `scopeType` ENUM('GLOBAL', 'BRANCH', 'CHANNEL', 'CUSTOMER_GROUP') NOT NULL DEFAULT 'GLOBAL',
    `scopeKey` VARCHAR(191) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `effectiveFrom` DATETIME(3) NULL,
    `effectiveTo` DATETIME(3) NULL,
    `createdByUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PriceList_code_key`(`code`),
    INDEX `PriceList_scopeType_scopeKey_idx`(`scopeType`, `scopeKey`),
    INDEX `PriceList_isDefault_isActive_idx`(`isDefault`, `isActive`),
    INDEX `PriceList_effectiveFrom_effectiveTo_idx`(`effectiveFrom`, `effectiveTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PriceListItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `priceListId` INTEGER NOT NULL,
    `menuItemId` INTEGER NOT NULL,
    `salePrice` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PriceListItem_priceListId_menuItemId_key`(`priceListId`, `menuItemId`),
    INDEX `PriceListItem_menuItemId_idx`(`menuItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Order` ADD COLUMN `priceListId` INTEGER NULL;
CREATE INDEX `Order_priceListId_idx` ON `Order`(`priceListId`);

ALTER TABLE `PriceListItem` ADD CONSTRAINT `PriceListItem_priceListId_fkey`
    FOREIGN KEY (`priceListId`) REFERENCES `PriceList`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PriceListItem` ADD CONSTRAINT `PriceListItem_menuItemId_fkey`
    FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Order` ADD CONSTRAINT `Order_priceListId_fkey`
    FOREIGN KEY (`priceListId`) REFERENCES `PriceList`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
