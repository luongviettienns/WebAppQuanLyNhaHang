-- Migration: 20260917203000_add_inventory_and_bom
-- Them he thong quan ly kho, dinh luong nguyen lieu (BOM) va so cai bien dong kho

-- 1. Tao bang Ingredient
CREATE TABLE `Ingredient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sku` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `currentStock` DOUBLE NOT NULL DEFAULT 0,
    `minThreshold` DOUBLE NOT NULL DEFAULT 0,
    `costPerUnit` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Ingredient_sku_key`(`sku`),
    INDEX `Ingredient_sku_idx`(`sku`),
    INDEX `Ingredient_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Tao bang MenuItemIngredient (BOM Cong thuc mon)
CREATE TABLE `MenuItemIngredient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `menuItemId` INTEGER NOT NULL,
    `ingredientId` INTEGER NOT NULL,
    `quantityRequired` DOUBLE NOT NULL,

    INDEX `MenuItemIngredient_menuItemId_idx`(`menuItemId`),
    INDEX `MenuItemIngredient_ingredientId_idx`(`ingredientId`),
    UNIQUE INDEX `MenuItemIngredient_menuItemId_ingredientId_key`(`menuItemId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Tao bang InventoryTransaction (So cai bien dong kho)
CREATE TABLE `InventoryTransaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ingredientId` INTEGER NOT NULL,
    `type` ENUM('STOCK_IN', 'AUTO_DEDUCT', 'KITCHEN_WASTE', 'MANUAL_ADJUST', 'VOID_RESTORE') NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `costAmount` INTEGER NOT NULL DEFAULT 0,
    `orderId` INTEGER NULL,
    `note` VARCHAR(191) NULL,
    `createdByUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryTransaction_ingredientId_idx`(`ingredientId`),
    INDEX `InventoryTransaction_type_idx`(`type`),
    INDEX `InventoryTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. Khoa ngoai lien ket
ALTER TABLE `MenuItemIngredient` ADD CONSTRAINT `MenuItemIngredient_menuItemId_fkey`
    FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MenuItemIngredient` ADD CONSTRAINT `MenuItemIngredient_ingredientId_fkey`
    FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_ingredientId_fkey`
    FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
