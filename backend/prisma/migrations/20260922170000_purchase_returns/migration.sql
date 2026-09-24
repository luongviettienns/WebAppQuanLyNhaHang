CREATE TABLE PurchaseReturn (
  id INTEGER NOT NULL AUTO_INCREMENT, returnCode VARCHAR(191) NOT NULL,
  supplierId INTEGER NULL, sourceReceiptId INTEGER NULL,
  returnedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status ENUM('DRAFT','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT', version INTEGER NOT NULL DEFAULT 1,
  subtotalAmount INTEGER NOT NULL DEFAULT 0, discountAmount INTEGER NOT NULL DEFAULT 0,
  vatAmount INTEGER NOT NULL DEFAULT 0, refundAmount INTEGER NOT NULL DEFAULT 0,
  refundMethod VARCHAR(20) NOT NULL DEFAULT 'CASH', note VARCHAR(1000) NULL,
  createdByUserId INTEGER NULL, createdByName VARCHAR(120) NULL,
  completedByUserId INTEGER NULL, completedAt DATETIME(3) NULL,
  cancelledByUserId INTEGER NULL, cancelledAt DATETIME(3) NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY(id), UNIQUE INDEX PurchaseReturn_returnCode_key(returnCode),
  INDEX PurchaseReturn_status_returnedAt_idx(status,returnedAt), INDEX PurchaseReturn_supplierId_returnedAt_idx(supplierId,returnedAt),
  INDEX PurchaseReturn_sourceReceiptId_idx(sourceReceiptId),
  CONSTRAINT PurchaseReturn_supplierId_fkey FOREIGN KEY(supplierId) REFERENCES Supplier(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT PurchaseReturn_sourceReceiptId_fkey FOREIGN KEY(sourceReceiptId) REFERENCES PurchaseReceipt(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE PurchaseReturnLine (
  id INTEGER NOT NULL AUTO_INCREMENT, purchaseReturnId INTEGER NOT NULL, ingredientId INTEGER NOT NULL, sourceReceiptLineId INTEGER NULL,
  ingredientSku VARCHAR(191) NOT NULL, ingredientName VARCHAR(191) NOT NULL, unit VARCHAR(191) NOT NULL,
  quantity DOUBLE NOT NULL, purchaseUnitCost INTEGER NOT NULL, returnUnitPrice INTEGER NOT NULL,
  lineAmount INTEGER NOT NULL, stockCostPerUnit INTEGER NOT NULL DEFAULT 0, stockCostAmount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(id), UNIQUE INDEX PurchaseReturnLine_purchaseReturnId_ingredientId_key(purchaseReturnId,ingredientId),
  INDEX PurchaseReturnLine_ingredientId_idx(ingredientId), INDEX PurchaseReturnLine_sourceReceiptLineId_idx(sourceReceiptLineId),
  CONSTRAINT PurchaseReturnLine_purchaseReturnId_fkey FOREIGN KEY(purchaseReturnId) REFERENCES PurchaseReturn(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT PurchaseReturnLine_ingredientId_fkey FOREIGN KEY(ingredientId) REFERENCES Ingredient(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT PurchaseReturnLine_sourceReceiptLineId_fkey FOREIGN KEY(sourceReceiptLineId) REFERENCES PurchaseReceiptLine(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE InventoryTransaction
  MODIFY type ENUM('STOCK_IN','PURCHASE_RETURN','AUTO_DEDUCT','KITCHEN_WASTE','MANUAL_ADJUST','VOID_RESTORE') NOT NULL,
  ADD COLUMN purchaseReturnId INTEGER NULL,
  ADD UNIQUE INDEX InventoryTransaction_purchaseReturnId_ingredientId_key(purchaseReturnId,ingredientId),
  ADD CONSTRAINT InventoryTransaction_purchaseReturnId_fkey FOREIGN KEY(purchaseReturnId) REFERENCES PurchaseReturn(id) ON DELETE RESTRICT ON UPDATE CASCADE;
