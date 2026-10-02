-- Preserve the destination account for the single refund represented by each completed sales return.
ALTER TABLE `OrderReturn` ADD COLUMN `financialAccountId` INTEGER NULL,
  ADD INDEX `OrderReturn_financialAccountId_completedAt_idx` (`financialAccountId`, `completedAt`),
  ADD CONSTRAINT `OrderReturn_financialAccountId_fkey`
    FOREIGN KEY (`financialAccountId`) REFERENCES `FinancialAccount` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
