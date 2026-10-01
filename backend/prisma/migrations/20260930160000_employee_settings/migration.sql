-- Employee settings are branch-scoped and versioned by business date.
-- The 1970-01-01 rows below are migration-only compatibility baselines.

CREATE TABLE `BranchEmployeeSettingsRevision` (
  `branchId` INTEGER NOT NULL,
  `attendanceRevision` INTEGER NOT NULL DEFAULT 1,
  `payrollRevision` INTEGER NOT NULL DEFAULT 1,
  `workweekRevision` INTEGER NOT NULL DEFAULT 1,
  `holidayRevision` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`branchId`),
  CONSTRAINT `BranchEmployeeSettingsRevision_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BranchAttendancePolicyVersion` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branchId` INTEGER NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `revision` INTEGER NOT NULL,
  `attendanceMode` ENUM('SHIFT') NOT NULL DEFAULT 'SHIFT',
  `standardDayMinutes` INTEGER NOT NULL DEFAULT 480,
  `lateThresholdMinutes` INTEGER NOT NULL DEFAULT 0,
  `earlyLeaveThresholdMinutes` INTEGER NOT NULL DEFAULT 0,
  `allowUnscheduledAttendance` BOOLEAN NOT NULL DEFAULT true,
  `createdByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AttendancePolicy_branch_effective_key`(`branchId`, `effectiveFrom`),
  UNIQUE INDEX `AttendancePolicy_branch_revision_key`(`branchId`, `revision`),
  INDEX `BranchAttendancePolicyVersion_branchId_effectiveFrom_idx`(`branchId`, `effectiveFrom`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BranchAttendancePolicyVersion_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BranchAttendancePolicyVersion_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BranchPayrollPolicyVersion` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branchId` INTEGER NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `revision` INTEGER NOT NULL,
  `frequency` ENUM('MONTHLY') NOT NULL DEFAULT 'MONTHLY',
  `periodStartDay` INTEGER NOT NULL DEFAULT 1,
  `hourlyCalculationSource` ENUM('ACTUAL_ATTENDANCE') NOT NULL DEFAULT 'ACTUAL_ATTENDANCE',
  `createdByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PayrollPolicy_branch_effective_key`(`branchId`, `effectiveFrom`),
  UNIQUE INDEX `PayrollPolicy_branch_revision_key`(`branchId`, `revision`),
  INDEX `BranchPayrollPolicyVersion_branchId_effectiveFrom_idx`(`branchId`, `effectiveFrom`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BranchPayrollPolicyVersion_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BranchPayrollPolicyVersion_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BranchWorkweekPolicyVersion` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branchId` INTEGER NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `revision` INTEGER NOT NULL,
  `monday` BOOLEAN NOT NULL DEFAULT true,
  `tuesday` BOOLEAN NOT NULL DEFAULT true,
  `wednesday` BOOLEAN NOT NULL DEFAULT true,
  `thursday` BOOLEAN NOT NULL DEFAULT true,
  `friday` BOOLEAN NOT NULL DEFAULT true,
  `saturday` BOOLEAN NOT NULL DEFAULT true,
  `sunday` BOOLEAN NOT NULL DEFAULT true,
  `createdByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `WorkweekPolicy_branch_effective_key`(`branchId`, `effectiveFrom`),
  UNIQUE INDEX `WorkweekPolicy_branch_revision_key`(`branchId`, `revision`),
  INDEX `BranchWorkweekPolicyVersion_branchId_effectiveFrom_idx`(`branchId`, `effectiveFrom`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BranchWorkweekPolicyVersion_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BranchWorkweekPolicyVersion_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BranchHolidayPeriod` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branchId` INTEGER NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `note` VARCHAR(500) NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `archivedAt` DATETIME(3) NULL,
  `archivedByUserId` INTEGER NULL,
  `createdByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `BranchHolidayPeriod_branchId_startDate_endDate_archivedAt_idx`(`branchId`, `startDate`, `endDate`, `archivedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BranchHolidayPeriod_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BranchHolidayPeriod_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `BranchHolidayPeriod_archivedByUserId_fkey`
    FOREIGN KEY (`archivedByUserId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeeScheduleIdempotency` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `actorId` INTEGER NOT NULL,
  `operation` VARCHAR(80) NOT NULL,
  `idempotencyKey` VARCHAR(128) NOT NULL,
  `requestDigest` CHAR(64) NOT NULL,
  `response` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EmployeeScheduleIdempotency_actor_operation_key`(`actorId`, `operation`, `idempotencyKey`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeeScheduleIdempotency_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmployeeScheduleRule`
  ADD COLUMN `calendarWarningSnapshot` JSON NULL;

ALTER TABLE `EmployeeAttendanceSession`
  ADD COLUMN `attendancePolicyVersionId` INTEGER NULL,
  ADD COLUMN `standardDayMinutesSnapshot` INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN `lateThresholdMinutesSnapshot` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `earlyLeaveThresholdMinutesSnapshot` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `allowUnscheduledAttendanceSnapshot` BOOLEAN NOT NULL DEFAULT true;

INSERT INTO `BranchEmployeeSettingsRevision`
  (`branchId`, `attendanceRevision`, `payrollRevision`, `workweekRevision`, `holidayRevision`, `updatedAt`)
SELECT `id`, 1, 1, 1, 0, CURRENT_TIMESTAMP(3)
FROM `Branch`;

INSERT INTO `BranchAttendancePolicyVersion`
  (`branchId`, `effectiveFrom`, `revision`, `attendanceMode`, `standardDayMinutes`, `lateThresholdMinutes`, `earlyLeaveThresholdMinutes`, `allowUnscheduledAttendance`, `createdByUserId`, `createdAt`)
SELECT `id`, '1970-01-01', 1, 'SHIFT', 480, 0, 0, true, NULL, CURRENT_TIMESTAMP(3)
FROM `Branch`;

INSERT INTO `BranchPayrollPolicyVersion`
  (`branchId`, `effectiveFrom`, `revision`, `frequency`, `periodStartDay`, `hourlyCalculationSource`, `createdByUserId`, `createdAt`)
SELECT `id`, '1970-01-01', 1, 'MONTHLY', 1, 'ACTUAL_ATTENDANCE', NULL, CURRENT_TIMESTAMP(3)
FROM `Branch`;

INSERT INTO `BranchWorkweekPolicyVersion`
  (`branchId`, `effectiveFrom`, `revision`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`, `createdByUserId`, `createdAt`)
SELECT `id`, '1970-01-01', 1, true, true, true, true, true, true, true, NULL, CURRENT_TIMESTAMP(3)
FROM `Branch`;

UPDATE `EmployeeAttendanceSession` AS `attendance`
INNER JOIN `BranchAttendancePolicyVersion` AS `policy`
  ON `policy`.`branchId` = `attendance`.`branchId`
  AND `policy`.`effectiveFrom` = '1970-01-01'
SET `attendance`.`attendancePolicyVersionId` = `policy`.`id`
WHERE `attendance`.`attendancePolicyVersionId` IS NULL;

ALTER TABLE `EmployeeAttendanceSession`
  ADD INDEX `EmployeeAttendanceSession_attendancePolicyVersionId_idx`(`attendancePolicyVersionId`),
  ADD CONSTRAINT `EmployeeAttendanceSession_attendancePolicyVersionId_fkey`
    FOREIGN KEY (`attendancePolicyVersionId`) REFERENCES `BranchAttendancePolicyVersion`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
