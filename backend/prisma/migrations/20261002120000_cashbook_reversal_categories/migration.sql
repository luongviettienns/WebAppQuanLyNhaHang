INSERT INTO `CashFlowCategory` (`code`, `name`, `direction`, `affectsBusinessResultDefault`, `isSystem`, `isActive`, `updatedAt`)
VALUES
  ('REVERSAL_RECEIPT', 'Đảo phiếu chi', 'RECEIPT', false, true, true, CURRENT_TIMESTAMP(3)),
  ('REVERSAL_PAYMENT', 'Đảo phiếu thu', 'PAYMENT', false, true, true, CURRENT_TIMESTAMP(3));
