CREATE TABLE TableArea (
  id INTEGER NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  displayOrder INTEGER NOT NULL DEFAULT 0,
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX TableArea_name_key(name),
  INDEX TableArea_isActive_displayOrder_idx(isActive, displayOrder)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE DiningTable
  ADD COLUMN displayName VARCHAR(100) NULL,
  ADD COLUMN areaId INTEGER NULL,
  ADD COLUMN displayOrder INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN note VARCHAR(500) NULL,
  ADD COLUMN isActive BOOLEAN NOT NULL DEFAULT true,
  ADD INDEX DiningTable_areaId_idx(areaId),
  ADD INDEX DiningTable_isActive_idx(isActive),
  ADD CONSTRAINT DiningTable_areaId_fkey FOREIGN KEY(areaId) REFERENCES TableArea(id) ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE DiningTable SET displayName = CONCAT('Bàn ', tableNumber), displayOrder = tableNumber WHERE displayName IS NULL;
