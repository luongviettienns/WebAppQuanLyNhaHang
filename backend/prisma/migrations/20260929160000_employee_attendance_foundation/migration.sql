CREATE TABLE `Branch` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Branch_code_key`(`code`),
  INDEX `Branch_isActive_isDefault_idx`(`isActive`, `isDefault`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Branch` (`id`, `code`, `name`, `isActive`, `isDefault`, `createdAt`, `updatedAt`)
VALUES (1, 'MAIN', 'Chi nhánh chính', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

ALTER TABLE `EmployeeScheduleRule`
  ADD COLUMN `branchId` INTEGER NULL AFTER `employeeId`;

UPDATE `EmployeeScheduleRule`
SET `branchId` = (SELECT `id` FROM `Branch` WHERE `code` = 'MAIN')
WHERE `branchId` IS NULL;

ALTER TABLE `EmployeeScheduleRule`
  MODIFY `branchId` INTEGER NOT NULL DEFAULT 1,
  DROP INDEX `EmployeeScheduleRule_duplicate_key`,
  ADD UNIQUE INDEX `EmployeeScheduleRule_duplicate_key`(`branchId`, `employeeId`, `shiftId`, `recurrenceType`, `startDate`, `dayOfWeek`),
  ADD INDEX `EmployeeScheduleRule_branchId_employeeId_startDate_idx`(`branchId`, `employeeId`, `startDate`),
  ADD CONSTRAINT `EmployeeScheduleRule_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `AttendanceKioskSession` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branchId` INTEGER NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `createdByUserId` INTEGER NOT NULL,
  `deviceName` VARCHAR(120) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `lastUsedAt` DATETIME(3) NULL,
  UNIQUE INDEX `AttendanceKioskSession_tokenHash_key`(`tokenHash`),
  INDEX `AttendanceKioskSession_branchId_revokedAt_expiresAt_idx`(`branchId`, `revokedAt`, `expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AttendanceKioskSession_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AttendanceKioskSession_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeeAttendanceSession` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employeeId` INTEGER NOT NULL,
  `branchId` INTEGER NOT NULL,
  `scheduleRuleId` INTEGER NULL,
  `scheduleDate` DATE NULL,
  `checkInAt` DATETIME(3) NOT NULL,
  `checkOutAt` DATETIME(3) NULL,
  `checkInSource` ENUM('KIOSK', 'ADMIN_MANUAL') NOT NULL,
  `checkOutSource` ENUM('KIOSK', 'ADMIN_MANUAL') NULL,
  `checkInKioskSessionId` INTEGER NULL,
  `checkOutKioskSessionId` INTEGER NULL,
  `scheduleLinkStatus` ENUM('SCHEDULED', 'UNSCHEDULED', 'NEEDS_REVIEW') NOT NULL DEFAULT 'UNSCHEDULED',
  `plannedBranchId` INTEGER NULL,
  `plannedWorkDate` DATE NULL,
  `plannedShiftName` VARCHAR(120) NULL,
  `plannedStartMinute` INTEGER NULL,
  `plannedEndMinute` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `EmployeeAttendanceSession_employeeId_branchId_checkInAt_idx`(`employeeId`, `branchId`, `checkInAt`),
  INDEX `EmployeeAttendanceSession_branchId_checkInAt_checkOutAt_idx`(`branchId`, `checkInAt`, `checkOutAt`),
  INDEX `AttendanceSession_schedule_occurrence_idx`(`branchId`, `scheduleRuleId`, `scheduleDate`),
  INDEX `EmployeeAttendanceSession_checkOutAt_idx`(`checkOutAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeeAttendanceSession_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceSession_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceSession_scheduleRuleId_fkey`
    FOREIGN KEY (`scheduleRuleId`) REFERENCES `EmployeeScheduleRule`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceSession_checkInKioskSessionId_fkey`
    FOREIGN KEY (`checkInKioskSessionId`) REFERENCES `AttendanceKioskSession`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceSession_checkOutKioskSessionId_fkey`
    FOREIGN KEY (`checkOutKioskSessionId`) REFERENCES `AttendanceKioskSession`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceSession_plannedBranchId_fkey`
    FOREIGN KEY (`plannedBranchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AttendanceKioskIdempotency` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `kioskSessionId` INTEGER NOT NULL,
  `idempotencyKey` VARCHAR(128) NOT NULL,
  `requestDigest` CHAR(64) NOT NULL,
  `attendanceSessionId` INTEGER NULL,
  `response` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AttendanceKioskIdempotency_session_key`(`kioskSessionId`, `idempotencyKey`),
  INDEX `AttendanceKioskIdempotency_attendanceSessionId_idx`(`attendanceSessionId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AttendanceKioskIdempotency_kioskSessionId_fkey`
    FOREIGN KEY (`kioskSessionId`) REFERENCES `AttendanceKioskSession`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AttendanceKioskIdempotency_attendanceSessionId_fkey`
    FOREIGN KEY (`attendanceSessionId`) REFERENCES `EmployeeAttendanceSession`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeeAttendanceDisposition` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branchId` INTEGER NOT NULL,
  `employeeId` INTEGER NOT NULL,
  `scheduleRuleId` INTEGER NOT NULL,
  `workDate` DATE NOT NULL,
  `type` ENUM('ABSENT') NOT NULL DEFAULT 'ABSENT',
  `reason` VARCHAR(500) NOT NULL,
  `actorId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `revokedAt` DATETIME(3) NULL,
  `revokedByUserId` INTEGER NULL,
  UNIQUE INDEX `AttendanceDisposition_occurrence_key`(`branchId`, `scheduleRuleId`, `workDate`),
  INDEX `EmployeeAttendanceDisposition_employeeId_workDate_idx`(`employeeId`, `workDate`),
  INDEX `EmployeeAttendanceDisposition_branchId_workDate_revokedAt_idx`(`branchId`, `workDate`, `revokedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EmployeeAttendanceDisposition_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceDisposition_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceDisposition_scheduleRuleId_fkey`
    FOREIGN KEY (`scheduleRuleId`) REFERENCES `EmployeeScheduleRule`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceDisposition_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAttendanceDisposition_revokedByUserId_fkey`
    FOREIGN KEY (`revokedByUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AttendanceKioskRateLimitBucket` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `bucketHash` CHAR(64) NOT NULL,
  `bucketType` ENUM('KIOSK_SESSION', 'ATTENDANCE_CODE', 'IP_ADDRESS') NOT NULL,
  `requestCount` INTEGER NOT NULL DEFAULT 0,
  `windowStartedAt` DATETIME(3) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AttendanceKioskRateLimitBucket_bucketHash_key`(`bucketHash`),
  INDEX `AttendanceKioskRateLimitBucket_expiresAt_idx`(`expiresAt`),
  INDEX `AttendanceKioskRateLimitBucket_bucketType_windowStartedAt_idx`(`bucketType`, `windowStartedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
