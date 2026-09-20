-- AlterTable
ALTER TABLE `InventoryTransaction` ADD COLUMN `purchaseReceiptId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` VARCHAR(255) NULL,
    `taxCode` VARCHAR(191) NULL,
    `note` VARCHAR(1000) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Supplier_code_key`(`code`),
    INDEX `Supplier_name_idx`(`name`),
    INDEX `Supplier_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseReceipt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receiptCode` VARCHAR(191) NOT NULL,
    `supplierId` INTEGER NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `invoiceNumber` VARCHAR(191) NULL,
    `invoiceDate` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'POSTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `subtotalAmount` INTEGER NOT NULL DEFAULT 0,
    `discountAmount` INTEGER NOT NULL DEFAULT 0,
    `paidAmount` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(1000) NULL,
    `createdByUserId` INTEGER NULL,
    `postedByUserId` INTEGER NULL,
    `postedAt` DATETIME(3) NULL,
    `cancelledByUserId` INTEGER NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PurchaseReceipt_receiptCode_key`(`receiptCode`),
    INDEX `PurchaseReceipt_supplierId_receivedAt_idx`(`supplierId`, `receivedAt`),
    INDEX `PurchaseReceipt_status_receivedAt_idx`(`status`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseReceiptLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchaseReceiptId` INTEGER NOT NULL,
    `ingredientId` INTEGER NOT NULL,
    `ingredientSku` VARCHAR(191) NOT NULL,
    `ingredientName` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unitCost` INTEGER NOT NULL,
    `discountAmount` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchaseReceiptLine_ingredientId_idx`(`ingredientId`),
    UNIQUE INDEX `PurchaseReceiptLine_purchaseReceiptId_ingredientId_key`(`purchaseReceiptId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `InventoryTransaction_purchaseReceiptId_idx` ON `InventoryTransaction`(`purchaseReceiptId`);

-- AddForeignKey
ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_purchaseReceiptId_fkey` FOREIGN KEY (`purchaseReceiptId`) REFERENCES `PurchaseReceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseReceipt` ADD CONSTRAINT `PurchaseReceipt_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseReceiptLine` ADD CONSTRAINT `PurchaseReceiptLine_purchaseReceiptId_fkey` FOREIGN KEY (`purchaseReceiptId`) REFERENCES `PurchaseReceipt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseReceiptLine` ADD CONSTRAINT `PurchaseReceiptLine_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
