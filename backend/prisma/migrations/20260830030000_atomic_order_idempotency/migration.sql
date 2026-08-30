ALTER TABLE `Order` ADD COLUMN `idempotencyScope` VARCHAR(191) NULL;

UPDATE `Order`
SET `idempotencyScope` = CASE
  WHEN `createdByUserId` IS NULL THEN 'guest'
  ELSE CONCAT('user:', `createdByUserId`)
END;

-- Keep every legacy row and move later duplicates out of the canonical scope.
CREATE TEMPORARY TABLE `DuplicateOrderIdempotencyRows` AS
  SELECT later.`id`
  FROM `Order` AS later
  INNER JOIN `Order` AS earlier
    ON earlier.`id` < later.`id`
    AND earlier.`idempotencyKey` = later.`idempotencyKey`
    AND earlier.`idempotencyScope` = later.`idempotencyScope`
  WHERE later.`idempotencyKey` IS NOT NULL
  GROUP BY later.`id`;

UPDATE `Order` AS target
INNER JOIN `DuplicateOrderIdempotencyRows` AS duplicate_rows ON duplicate_rows.`id` = target.`id`
SET target.`idempotencyScope` = CONCAT('legacy-duplicate:', target.`id`);

DROP TEMPORARY TABLE `DuplicateOrderIdempotencyRows`;

ALTER TABLE `Order` MODIFY `idempotencyScope` VARCHAR(191) NOT NULL DEFAULT 'guest';
DROP INDEX `Order_createdByUserId_idempotencyKey_key` ON `Order`;
CREATE UNIQUE INDEX `Order_idempotencyScope_idempotencyKey_key`
  ON `Order`(`idempotencyScope`, `idempotencyKey`);
