-- Keep client retries for a partial return bound to the original source transaction.
ALTER TABLE `OrderReturn`
  ADD COLUMN `idempotencyKey` VARCHAR(128) NULL,
  ADD COLUMN `requestDigest` CHAR(64) NULL,
  ADD UNIQUE INDEX `OrderReturn_actor_idempotency_key` (`createdByUserId`, `idempotencyKey`);
