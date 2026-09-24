CREATE TABLE OrderReturn (
  id INTEGER NOT NULL AUTO_INCREMENT,
  returnCode VARCHAR(191) NOT NULL,
  orderId INTEGER NOT NULL,
  status ENUM('COMPLETED','CANCELLED') NOT NULL DEFAULT 'COMPLETED',
  returnedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  totalRefundDue INTEGER NOT NULL DEFAULT 0,
  refundedAmount INTEGER NOT NULL DEFAULT 0,
  refundMethod ENUM('CASH','BANK_TRANSFER','CREDIT_CARD') NOT NULL DEFAULT 'CASH',
  note VARCHAR(1000) NULL,
  createdByUserId INTEGER NULL,
  createdByName VARCHAR(120) NULL,
  completedAt DATETIME(3) NULL,
  cancelledByUserId INTEGER NULL,
  cancelledAt DATETIME(3) NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY(id),
  UNIQUE INDEX OrderReturn_returnCode_key(returnCode),
  INDEX OrderReturn_status_returnedAt_idx(status, returnedAt),
  INDEX OrderReturn_orderId_returnedAt_idx(orderId, returnedAt),
  CONSTRAINT OrderReturn_orderId_fkey FOREIGN KEY(orderId) REFERENCES `Order`(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE OrderReturnLine (
  id INTEGER NOT NULL AUTO_INCREMENT,
  orderReturnId INTEGER NOT NULL,
  orderItemId INTEGER NOT NULL,
  menuItemId INTEGER NOT NULL,
  menuItemSku VARCHAR(191) NOT NULL,
  menuItemName VARCHAR(191) NOT NULL,
  quantity INTEGER NOT NULL,
  unitPrice INTEGER NOT NULL,
  lineAmount INTEGER NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(id),
  UNIQUE INDEX OrderReturnLine_orderReturnId_orderItemId_key(orderReturnId, orderItemId),
  INDEX OrderReturnLine_orderItemId_idx(orderItemId),
  INDEX OrderReturnLine_menuItemId_idx(menuItemId),
  CONSTRAINT OrderReturnLine_orderReturnId_fkey FOREIGN KEY(orderReturnId) REFERENCES OrderReturn(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT OrderReturnLine_orderItemId_fkey FOREIGN KEY(orderItemId) REFERENCES OrderItem(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE InventoryTransaction
  MODIFY type ENUM('STOCK_IN','PURCHASE_RETURN','AUTO_DEDUCT','KITCHEN_WASTE','MANUAL_ADJUST','VOID_RESTORE','SALES_RETURN') NOT NULL,
  ADD COLUMN orderReturnId INTEGER NULL,
  ADD UNIQUE INDEX InventoryTransaction_orderReturnId_ingredientId_key(orderReturnId, ingredientId),
  ADD INDEX InventoryTransaction_orderReturnId_idx(orderReturnId),
  ADD CONSTRAINT InventoryTransaction_orderReturnId_fkey FOREIGN KEY(orderReturnId) REFERENCES OrderReturn(id) ON DELETE RESTRICT ON UPDATE CASCADE;
