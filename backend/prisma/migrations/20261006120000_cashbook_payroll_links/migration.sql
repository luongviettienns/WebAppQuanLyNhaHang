ALTER TABLE `EmployeePayrollPayment`
  ADD COLUMN `financialAccountId` INTEGER NULL,
  ADD INDEX `EmployeePayrollPayment_financialAccountId_paidAt_idx` (`financialAccountId`, `paidAt`),
  ADD CONSTRAINT `EmployeePayrollPayment_financialAccountId_fkey`
    FOREIGN KEY (`financialAccountId`) REFERENCES `FinancialAccount` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `CashFlowCategory` (`code`, `name`, `direction`, `affectsBusinessResultDefault`, `isSystem`, `isActive`, `updatedAt`)
VALUES ('PAYROLL_PAYMENT', 'Chi trả lương', 'PAYMENT', false, true, true, CURRENT_TIMESTAMP(3));
