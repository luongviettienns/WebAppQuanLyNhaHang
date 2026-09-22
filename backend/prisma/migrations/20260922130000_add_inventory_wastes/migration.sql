-- AlterTable
ALTER TABLE InventoryTransaction ADD COLUMN inventoryWasteId INTEGER NULL;

-- CreateTable
CREATE TABLE InventoryWaste (
    id INTEGER NOT NULL AUTO_INCREMENT,
    wasteCode VARCHAR(191) NOT NULL,
    status ENUM('DRAFT', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    wastedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    completedAt DATETIME(3) NULL,
    note VARCHAR(1000) NULL,
    totalValue INTEGER NOT NULL DEFAULT 0,
    createdByUserId INTEGER NULL,
    completedByUserId INTEGER NULL,
    cancelledByUserId INTEGER NULL,
    cancelledAt DATETIME(3) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL,

    UNIQUE INDEX InventoryWaste_wasteCode_key(wasteCode),
    INDEX InventoryWaste_status_wastedAt_idx(status, wastedAt),
    INDEX InventoryWaste_wastedAt_idx(wastedAt),
    PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE InventoryWasteLine (
    id INTEGER NOT NULL AUTO_INCREMENT,
    inventoryWasteId INTEGER NOT NULL,
    ingredientId INTEGER NOT NULL,
    ingredientSku VARCHAR(191) NOT NULL,
    ingredientName VARCHAR(191) NOT NULL,
    unit VARCHAR(191) NOT NULL,
    systemQuantity DOUBLE NOT NULL,
    quantity DOUBLE NOT NULL,
    costPerUnit INTEGER NOT NULL,
    lineValue INTEGER NOT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL,

    INDEX InventoryWasteLine_ingredientId_idx(ingredientId),
    UNIQUE INDEX InventoryWasteLine_inventoryWasteId_ingredientId_key(inventoryWasteId, ingredientId),
    PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX InventoryTransaction_inventoryWasteId_idx ON InventoryTransaction(inventoryWasteId);

-- AddForeignKey
ALTER TABLE InventoryTransaction ADD CONSTRAINT InventoryTransaction_inventoryWasteId_fkey FOREIGN KEY (inventoryWasteId) REFERENCES InventoryWaste(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE InventoryWasteLine ADD CONSTRAINT InventoryWasteLine_inventoryWasteId_fkey FOREIGN KEY (inventoryWasteId) REFERENCES InventoryWaste(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE InventoryWasteLine ADD CONSTRAINT InventoryWasteLine_ingredientId_fkey FOREIGN KEY (ingredientId) REFERENCES Ingredient(id) ON DELETE RESTRICT ON UPDATE CASCADE;
