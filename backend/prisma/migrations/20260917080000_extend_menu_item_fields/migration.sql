-- Extend MenuItem with admin-facing catalog fields.
-- SKU starts nullable so existing rows can be backfilled safely before the unique constraint.
ALTER TABLE `MenuItem`
  ADD COLUMN `sku` VARCHAR(191) NULL,
  ADD COLUMN `menuType` ENUM('FOOD', 'DRINK', 'SERVICE', 'OTHER') NOT NULL DEFAULT 'FOOD',
  ADD COLUMN `itemType` ENUM('REGULAR', 'TOPPING', 'COMBO', 'SERVICE') NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN `trackStock` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `stockQuantity` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `position` VARCHAR(191) NULL;

UPDATE `MenuItem`
SET `sku` = CONCAT('SP', LPAD(`id`, 6, '0'))
WHERE `sku` IS NULL OR `sku` = '';

ALTER TABLE `MenuItem`
  MODIFY `sku` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `MenuItem_sku_key` ON `MenuItem`(`sku`);
