-- Add only a nullable receiver; existing orders intentionally remain NULL.
ALTER TABLE `Order` ADD COLUMN `receivedByEmployeeId` INTEGER NULL;

CREATE INDEX `Order_status_completedAt_idx` ON `Order`(`status`, `completedAt`);
CREATE INDEX `Order_receivedByEmployeeId_completedAt_idx` ON `Order`(`receivedByEmployeeId`, `completedAt`);

-- Cancellation snapshots are append-only at the application boundary.
-- ORDER_VOID source keys are exactly ORDER_VOID:<orderId>:<orderItemId>.
CREATE TABLE `OrderItemCancellation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `orderItemId` INTEGER NOT NULL,
    `menuItemId` INTEGER NOT NULL,
    `menuItemSku` VARCHAR(191) NOT NULL,
    `menuItemName` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` INTEGER NOT NULL,
    `lineAmount` INTEGER NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `cancelledAt` DATETIME(3) NOT NULL,
    `cancelledByUserId` INTEGER NULL,
    `orderStatusSnapshot` ENUM('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED') NOT NULL,
    `preparationStateSnapshot` ENUM('NOT_STARTED', 'PREPARING', 'READY', 'UNKNOWN') NOT NULL,
    `inventoryEffect` ENUM('NONE', 'RESTORED', 'WASTE_RECORDED') NOT NULL,
    `inventoryWasteId` INTEGER NULL,
    `source` ENUM('ORDER_VOID', 'ITEM_CANCEL') NOT NULL,
    `sourceKey` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OrderItemCancellation_sourceKey_key`(`sourceKey`),
    INDEX `OrderItemCancellation_cancelledAt_orderId_idx`(`cancelledAt`, `orderId`),
    INDEX `OrderItemCancellation_cancelledByUserId_cancelledAt_idx`(`cancelledByUserId`, `cancelledAt`),
    INDEX `OrderItemCancellation_source_orderId_idx`(`source`, `orderId`),
    INDEX `OrderItemCancellation_orderId_idx`(`orderId`),
    INDEX `OrderItemCancellation_orderItemId_idx`(`orderItemId`),
    INDEX `OrderItemCancellation_menuItemId_idx`(`menuItemId`),
    INDEX `OrderItemCancellation_inventoryWasteId_idx`(`inventoryWasteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Order` ADD CONSTRAINT `Order_receivedByEmployeeId_fkey` FOREIGN KEY (`receivedByEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OrderItemCancellation` ADD CONSTRAINT `OrderItemCancellation_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OrderItemCancellation` ADD CONSTRAINT `OrderItemCancellation_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OrderItemCancellation` ADD CONSTRAINT `OrderItemCancellation_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OrderItemCancellation` ADD CONSTRAINT `OrderItemCancellation_cancelledByUserId_fkey` FOREIGN KEY (`cancelledByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OrderItemCancellation` ADD CONSTRAINT `OrderItemCancellation_inventoryWasteId_fkey` FOREIGN KEY (`inventoryWasteId`) REFERENCES `InventoryWaste`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
