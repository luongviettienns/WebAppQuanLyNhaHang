-- Successful reservation/order payment transactions must identify the account that received the money.
ALTER TABLE `ReservationDepositTransaction` ADD COLUMN `financialAccountId` INTEGER NULL,
  ADD INDEX `ReservationDepositTransaction_financialAccountId_confirmedAt_idx` (`financialAccountId`, `confirmedAt`),
  ADD CONSTRAINT `ReservationDepositTransaction_financialAccountId_fkey`
    FOREIGN KEY (`financialAccountId`) REFERENCES `FinancialAccount` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrderPaymentTransaction` ADD COLUMN `financialAccountId` INTEGER NULL,
  ADD INDEX `OrderPaymentTransaction_financialAccountId_confirmedAt_idx` (`financialAccountId`, `confirmedAt`),
  ADD CONSTRAINT `OrderPaymentTransaction_financialAccountId_fkey`
    FOREIGN KEY (`financialAccountId`) REFERENCES `FinancialAccount` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
