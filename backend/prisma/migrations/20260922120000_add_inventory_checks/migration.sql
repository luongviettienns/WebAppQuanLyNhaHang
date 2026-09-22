-- AlterTable
ALTER TABLE `InventoryTransaction` ADD COLUMN `inventoryCheckId` INTEGER NULL;

-- CreateTable
CREATE TABLE `InventoryCheck` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `checkCode` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'BALANCED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `countedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `balancedAt` DATETIME(3) NULL,
    `note` VARCHAR(1000) NULL,
    `createdByUserId` INTEGER NULL,
    `balancedByUserId` INTEGER NULL,
    `cancelledByUserId` INTEGER NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InventoryCheck_checkCode_key`(`checkCode`),
    INDEX `InventoryCheck_status_countedAt_idx`(`status`, `countedAt`),
    INDEX `InventoryCheck_countedAt_idx`(`countedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryCheckLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inventoryCheckId` INTEGER NOT NULL,
    `ingredientId` INTEGER NOT NULL,
    `ingredientSku` VARCHAR(191) NOT NULL,
    `ingredientName` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `systemQuantity` DOUBLE NOT NULL,
    `actualQuantity` DOUBLE NULL,
    `varianceQuantity` DOUBLE NULL,
    `costPerUnit` INTEGER NOT NULL,
    `varianceValue` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InventoryCheckLine_ingredientId_idx`(`ingredientId`),
    UNIQUE INDEX `InventoryCheckLine_inventoryCheckId_ingredientId_key`(`inventoryCheckId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `InventoryTransaction_inventoryCheckId_idx` ON `InventoryTransaction`(`inventoryCheckId`);

-- AddForeignKey
ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_inventoryCheckId_fkey` FOREIGN KEY (`inventoryCheckId`) REFERENCES `InventoryCheck`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryCheckLine` ADD CONSTRAINT `InventoryCheckLine_inventoryCheckId_fkey` FOREIGN KEY (`inventoryCheckId`) REFERENCES `InventoryCheck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryCheckLine` ADD CONSTRAINT `InventoryCheckLine_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
