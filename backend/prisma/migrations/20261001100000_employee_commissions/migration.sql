-- Employee commission persistence is additive. Historical orders and payroll rows remain unchanged.

ALTER TABLE `OrderItem`
  ADD COLUMN `commissionEmployeeId` INTEGER NULL,
  ADD INDEX `OrderItem_commissionEmployeeId_orderId_idx`(`commissionEmployeeId`, `orderId`),
  ADD CONSTRAINT `OrderItem_commissionEmployeeId_fkey`
    FOREIGN KEY (`commissionEmployeeId`) REFERENCES `Employee`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `EmployeePayrollBatch`
  ADD COLUMN `totalCommissionAmount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `totalCommissionDeferredDebitAmount` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `EmployeePayrollLine`
  ADD COLUMN `commissionAmount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `commissionDeferredDebitAmount` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `CommissionPlan` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `branchId` INTEGER NOT NULL DEFAULT 1,
  `status` ENUM('DRAFT', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `createdByUserId` INTEGER NULL,
  `activatedByUserId` INTEGER NULL,
  `activatedAt` DATETIME(3) NULL,
  `archivedByUserId` INTEGER NULL,
  `archivedAt` DATETIME(3) NULL,
  `archiveReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CommissionPlan_branchId_code_key`(`branchId`, `code`),
  INDEX `CommissionPlan_branchId_status_effective_idx`(`branchId`, `status`, `effectiveFrom`, `effectiveTo`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CommissionPlan_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionPlanEmployee` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `planId` INTEGER NOT NULL,
  `employeeId` INTEGER NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `autoAssignOwnPos` BOOLEAN NOT NULL DEFAULT false,
  `createdByUserId` INTEGER NULL,
  `endedByUserId` INTEGER NULL,
  `endedAt` DATETIME(3) NULL,
  `endReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CommissionPlanEmployee_plan_employee_effective_key`(`planId`, `employeeId`, `effectiveFrom`),
  INDEX `CommissionPlanEmployee_employee_effective_idx`(`employeeId`, `effectiveFrom`, `effectiveTo`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CommissionPlanEmployee_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `CommissionPlan`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionPlanEmployee_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionRule` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `planId` INTEGER NOT NULL,
  `menuItemId` INTEGER NOT NULL,
  `revision` INTEGER NOT NULL,
  `type` ENUM('FIXED_PER_UNIT', 'PERCENT_NET_REVENUE', 'PERCENT_GROSS_PROFIT') NOT NULL,
  `fixedAmount` INTEGER NULL,
  `rateBps` INTEGER NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `createdByUserId` INTEGER NULL,
  `endedByUserId` INTEGER NULL,
  `endedAt` DATETIME(3) NULL,
  `endReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CommissionRule_plan_item_effective_revision_key`(`planId`, `menuItemId`, `effectiveFrom`, `revision`),
  INDEX `CommissionRule_plan_item_effective_idx`(`planId`, `menuItemId`, `effectiveFrom`, `effectiveTo`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CommissionRule_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `CommissionPlan`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionRule_menuItemId_fkey`
    FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionSaleBasis` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventKey` VARCHAR(191) NOT NULL,
  `orderId` INTEGER NOT NULL,
  `orderItemId` INTEGER NOT NULL,
  `menuItemId` INTEGER NOT NULL,
  `commissionEmployeeIdAtPayment` INTEGER NULL,
  `employeeCodeAtPayment` VARCHAR(32) NULL,
  `employeeNameAtPayment` VARCHAR(160) NULL,
  `soldQuantity` INTEGER NOT NULL,
  `saleBusinessDate` DATE NOT NULL,
  `paidAt` DATETIME(3) NOT NULL,
  `itemSku` VARCHAR(80) NOT NULL,
  `itemName` VARCHAR(200) NOT NULL,
  `unitPrice` INTEGER NOT NULL,
  `modifierSnapshot` JSON NULL,
  `grossRevenue` INTEGER NOT NULL,
  `allocatedDiscount` INTEGER NOT NULL,
  `netRevenue` INTEGER NOT NULL,
  `costStatus` ENUM('CAPTURED', 'MISSING') NOT NULL,
  `unitCost` INTEGER NULL,
  `totalCost` INTEGER NULL,
  `bomSnapshot` JSON NULL,
  `ruleCandidatesSnapshot` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CommissionSaleBasis_eventKey_key`(`eventKey`),
  UNIQUE INDEX `CommissionSaleBasis_orderItemId_key`(`orderItemId`),
  INDEX `CommissionSaleBasis_orderId_saleBusinessDate_idx`(`orderId`, `saleBusinessDate`),
  INDEX `CommissionSaleBasis_employee_saleBusinessDate_idx`(`commissionEmployeeIdAtPayment`, `saleBusinessDate`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CommissionSaleBasis_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionSaleBasis_orderItemId_fkey`
    FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionSaleBasis_menuItemId_fkey`
    FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionSaleBasis_employeeAtPayment_fkey`
    FOREIGN KEY (`commissionEmployeeIdAtPayment`) REFERENCES `Employee`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionBasisResolution` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventKey` VARCHAR(191) NOT NULL,
  `saleBasisId` INTEGER NOT NULL,
  `type` ENUM('COST_OVERRIDE', 'RULE_OVERRIDE') NOT NULL,
  `resolution` JSON NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `createdByUserId` INTEGER NOT NULL,
  `createdByName` VARCHAR(160) NOT NULL,
  `requestDigest` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CommissionBasisResolution_eventKey_key`(`eventKey`),
  INDEX `CommissionBasisResolution_saleBasisId_createdAt_idx`(`saleBasisId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CommissionBasisResolution_saleBasisId_fkey`
    FOREIGN KEY (`saleBasisId`) REFERENCES `CommissionSaleBasis`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionRecognitionIssue` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `orderItemId` INTEGER NOT NULL,
  `saleBasisId` INTEGER NOT NULL,
  `type` ENUM('UNASSIGNED_EMPLOYEE', 'PLAN_MISSING', 'PLAN_CONFLICT', 'RULE_MISSING', 'RULE_CONFLICT', 'COST_MISSING', 'LEDGER_CONFLICT') NOT NULL,
  `status` ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  `resolutionCode` VARCHAR(80) NULL,
  `diagnostic` JSON NULL,
  `firstDetectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastDetectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  `resolvedByUserId` INTEGER NULL,
  UNIQUE INDEX `CommissionRecognitionIssue_orderItemId_key`(`orderItemId`),
  UNIQUE INDEX `CommissionRecognitionIssue_saleBasisId_key`(`saleBasisId`),
  INDEX `CommissionRecognitionIssue_status_type_detected_idx`(`status`, `type`, `lastDetectedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CommissionRecognitionIssue_orderItemId_fkey`
    FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionRecognitionIssue_saleBasisId_fkey`
    FOREIGN KEY (`saleBasisId`) REFERENCES `CommissionSaleBasis`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionEntry` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventKey` VARCHAR(191) NOT NULL,
  `type` ENUM('EARNING', 'RETURN_REVERSAL', 'REASSIGNMENT_REVERSAL', 'REASSIGNMENT_EARNING') NOT NULL,
  `correlationKey` VARCHAR(191) NULL,
  `originalEntryId` INTEGER NULL,
  `sourceEntryId` INTEGER NULL,
  `saleBasisId` INTEGER NOT NULL,
  `orderId` INTEGER NOT NULL,
  `orderItemId` INTEGER NOT NULL,
  `orderReturnId` INTEGER NULL,
  `orderReturnLineId` INTEGER NULL,
  `employeeId` INTEGER NOT NULL,
  `commissionPlanId` INTEGER NULL,
  `commissionRuleId` INTEGER NULL,
  `saleBusinessDate` DATE NOT NULL,
  `accountingDate` DATE NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `quantityDelta` INTEGER NOT NULL,
  `grossRevenueDelta` INTEGER NOT NULL,
  `allocatedDiscountDelta` INTEGER NOT NULL,
  `netRevenueDelta` INTEGER NOT NULL,
  `costAmountDelta` INTEGER NOT NULL,
  `grossProfitDelta` INTEGER NOT NULL,
  `commissionAmountDelta` INTEGER NOT NULL,
  `employeeSnapshot` JSON NOT NULL,
  `itemSnapshot` JSON NOT NULL,
  `ruleSnapshot` JSON NOT NULL,
  `reason` VARCHAR(500) NULL,
  `createdByUserId` INTEGER NULL,
  `createdByName` VARCHAR(160) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CommissionEntry_eventKey_key`(`eventKey`),
  UNIQUE INDEX `CommissionEntry_orderReturnLineId_type_key`(`orderReturnLineId`, `type`),
  INDEX `CommissionEntry_originalEntryId_occurredAt_idx`(`originalEntryId`, `occurredAt`),
  INDEX `CommissionEntry_sourceEntryId_occurredAt_idx`(`sourceEntryId`, `occurredAt`),
  INDEX `CommissionEntry_employee_accounting_id_idx`(`employeeId`, `accountingDate`, `id`),
  INDEX `CommissionEntry_orderItemId_occurredAt_idx`(`orderItemId`, `occurredAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CommissionEntry_originalEntryId_fkey`
    FOREIGN KEY (`originalEntryId`) REFERENCES `CommissionEntry`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_sourceEntryId_fkey`
    FOREIGN KEY (`sourceEntryId`) REFERENCES `CommissionEntry`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_saleBasisId_fkey`
    FOREIGN KEY (`saleBasisId`) REFERENCES `CommissionSaleBasis`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_orderItemId_fkey`
    FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_orderReturnId_fkey`
    FOREIGN KEY (`orderReturnId`) REFERENCES `OrderReturn`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_orderReturnLineId_fkey`
    FOREIGN KEY (`orderReturnLineId`) REFERENCES `OrderReturnLine`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_commissionPlanId_fkey`
    FOREIGN KEY (`commissionPlanId`) REFERENCES `CommissionPlan`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionEntry_commissionRuleId_fkey`
    FOREIGN KEY (`commissionRuleId`) REFERENCES `CommissionRule`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionPayrollAllocation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `allocationKey` VARCHAR(191) NOT NULL,
  `type` ENUM('RESERVED', 'FINALIZED', 'RELEASED') NOT NULL,
  `priorEventId` INTEGER NULL,
  `commissionEntryId` INTEGER NOT NULL,
  `payrollBatchId` INTEGER NOT NULL,
  `payrollLineId` INTEGER NOT NULL,
  `allocatedAmount` INTEGER NOT NULL,
  `reason` VARCHAR(500) NULL,
  `createdByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CommissionPayrollAllocation_priorEventId_key`(`priorEventId`),
  INDEX `CommissionPayrollAllocation_allocationKey_createdAt_idx`(`allocationKey`, `createdAt`),
  INDEX `CommissionPayrollAllocation_entry_type_idx`(`commissionEntryId`, `type`),
  INDEX `CommissionPayrollAllocation_batch_line_idx`(`payrollBatchId`, `payrollLineId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CommissionPayrollAllocation_priorEventId_fkey`
    FOREIGN KEY (`priorEventId`) REFERENCES `CommissionPayrollAllocation`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionPayrollAllocation_commissionEntryId_fkey`
    FOREIGN KEY (`commissionEntryId`) REFERENCES `CommissionEntry`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionPayrollAllocation_payrollBatchId_fkey`
    FOREIGN KEY (`payrollBatchId`) REFERENCES `EmployeePayrollBatch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CommissionPayrollAllocation_payrollLineId_fkey`
    FOREIGN KEY (`payrollLineId`) REFERENCES `EmployeePayrollLine`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
