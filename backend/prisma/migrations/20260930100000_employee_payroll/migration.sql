CREATE TABLE `EmployeePayrollBatch` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `branchId` INTEGER NOT NULL DEFAULT 1,
  `frequency` ENUM('MONTHLY') NOT NULL DEFAULT 'MONTHLY',
  `periodStart` DATE NOT NULL,
  `periodEnd` DATE NOT NULL,
  `status` ENUM('DRAFT', 'CALCULATED', 'FINALIZED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `totalGrossAmount` INTEGER NOT NULL DEFAULT 0,
  `totalAdjustmentAmount` INTEGER NOT NULL DEFAULT 0,
  `totalNetAmount` INTEGER NOT NULL DEFAULT 0,
  `totalPaidAmount` INTEGER NOT NULL DEFAULT 0,
  `totalRemainingAmount` INTEGER NOT NULL DEFAULT 0,
  `createdByUserId` INTEGER NOT NULL,
  `calculatedByUserId` INTEGER NULL,
  `calculatedAt` DATETIME(3) NULL,
  `finalizedByUserId` INTEGER NULL,
  `finalizedAt` DATETIME(3) NULL,
  `cancelledByUserId` INTEGER NULL,
  `cancelledAt` DATETIME(3) NULL,
  `cancelReason` VARCHAR(500) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `EmployeePayrollBatch_code_key`(`code`),
  INDEX `EmployeePayrollBatch_branchId_periodStart_periodEnd_status_idx`(`branchId`, `periodStart`, `periodEnd`, `status`),
  INDEX `EmployeePayrollBatch_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeePayrollBatch_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollBatch_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollBatch_calculatedByUserId_fkey`
    FOREIGN KEY (`calculatedByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollBatch_finalizedByUserId_fkey`
    FOREIGN KEY (`finalizedByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollBatch_cancelledByUserId_fkey`
    FOREIGN KEY (`cancelledByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeePayrollLine` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payrollBatchId` INTEGER NOT NULL,
  `employeeId` INTEGER NOT NULL,
  `employeeCode` VARCHAR(32) NOT NULL,
  `employeeName` VARCHAR(160) NOT NULL,
  `departmentName` VARCHAR(120) NULL,
  `jobTitleName` VARCHAR(120) NULL,
  `bankName` VARCHAR(120) NULL,
  `bankAccountNumber` VARCHAR(80) NULL,
  `bankAccountName` VARCHAR(120) NULL,
  `employmentStartDate` DATE NULL,
  `employmentEndDate` DATE NULL,
  `activeCalendarDays` INTEGER NOT NULL DEFAULT 0,
  `periodCalendarDays` INTEGER NOT NULL DEFAULT 0,
  `scheduledShifts` INTEGER NOT NULL DEFAULT 0,
  `completedSessions` INTEGER NOT NULL DEFAULT 0,
  `actualMinutes` INTEGER NOT NULL DEFAULT 0,
  `confirmedAbsences` INTEGER NOT NULL DEFAULT 0,
  `missingCheckouts` INTEGER NOT NULL DEFAULT 0,
  `reviewRequiredCount` INTEGER NOT NULL DEFAULT 0,
  `grossAmount` INTEGER NOT NULL DEFAULT 0,
  `bonusAmount` INTEGER NOT NULL DEFAULT 0,
  `deductionAmount` INTEGER NOT NULL DEFAULT 0,
  `netAmount` INTEGER NOT NULL DEFAULT 0,
  `paidAmount` INTEGER NOT NULL DEFAULT 0,
  `remainingAmount` INTEGER NOT NULL DEFAULT 0,
  `calculationStatus` ENUM('READY', 'REVIEW_REQUIRED') NOT NULL DEFAULT 'READY',
  `warningCodes` JSON NOT NULL,
  `sourceSnapshot` JSON NOT NULL,
  `calculatedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `EmployeePayrollLine_batch_employee_key`(`payrollBatchId`, `employeeId`),
  INDEX `EmployeePayrollLine_employeeId_calculatedAt_idx`(`employeeId`, `calculatedAt`),
  INDEX `EmployeePayrollLine_payrollBatchId_calculationStatus_idx`(`payrollBatchId`, `calculationStatus`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeePayrollLine_payrollBatchId_fkey`
    FOREIGN KEY (`payrollBatchId`) REFERENCES `EmployeePayrollBatch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollLine_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeePayrollAdjustment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payrollLineId` INTEGER NOT NULL,
  `type` ENUM('BONUS', 'DEDUCTION') NOT NULL,
  `amount` INTEGER NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `createdByUserId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reversedAt` DATETIME(3) NULL,
  `reversedByUserId` INTEGER NULL,
  `reverseReason` VARCHAR(500) NULL,
  INDEX `EmployeePayrollAdjustment_payrollLineId_reversedAt_createdAt_idx`(`payrollLineId`, `reversedAt`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeePayrollAdjustment_payrollLineId_fkey`
    FOREIGN KEY (`payrollLineId`) REFERENCES `EmployeePayrollLine`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollAdjustment_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollAdjustment_reversedByUserId_fkey`
    FOREIGN KEY (`reversedByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeePayrollPayment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payrollBatchId` INTEGER NOT NULL,
  `payrollLineId` INTEGER NOT NULL,
  `employeeId` INTEGER NOT NULL,
  `amount` INTEGER NOT NULL,
  `method` ENUM('CASH', 'BANK_TRANSFER', 'OTHER') NOT NULL,
  `externalReference` VARCHAR(120) NULL,
  `note` VARCHAR(500) NULL,
  `status` ENUM('SUCCESS', 'REVERSED') NOT NULL DEFAULT 'SUCCESS',
  `paidAt` DATETIME(3) NOT NULL,
  `createdByUserId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reversedAt` DATETIME(3) NULL,
  `reversedByUserId` INTEGER NULL,
  `reverseReason` VARCHAR(500) NULL,
  INDEX `EmployeePayrollPayment_payrollLineId_status_paidAt_idx`(`payrollLineId`, `status`, `paidAt`),
  INDEX `EmployeePayrollPayment_payrollBatchId_status_paidAt_idx`(`payrollBatchId`, `status`, `paidAt`),
  INDEX `EmployeePayrollPayment_employeeId_paidAt_idx`(`employeeId`, `paidAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeePayrollPayment_payrollBatchId_fkey`
    FOREIGN KEY (`payrollBatchId`) REFERENCES `EmployeePayrollBatch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollPayment_payrollLineId_fkey`
    FOREIGN KEY (`payrollLineId`) REFERENCES `EmployeePayrollLine`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollPayment_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollPayment_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollPayment_reversedByUserId_fkey`
    FOREIGN KEY (`reversedByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeePayrollIdempotency` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `actorId` INTEGER NOT NULL,
  `operation` VARCHAR(80) NOT NULL,
  `idempotencyKey` VARCHAR(128) NOT NULL,
  `requestDigest` CHAR(64) NOT NULL,
  `response` JSON NOT NULL,
  `payrollBatchId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EmployeePayrollIdempotency_actor_operation_key`(`actorId`, `operation`, `idempotencyKey`),
  INDEX `EmployeePayrollIdempotency_payrollBatchId_idx`(`payrollBatchId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeePayrollIdempotency_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeePayrollIdempotency_payrollBatchId_fkey`
    FOREIGN KEY (`payrollBatchId`) REFERENCES `EmployeePayrollBatch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
