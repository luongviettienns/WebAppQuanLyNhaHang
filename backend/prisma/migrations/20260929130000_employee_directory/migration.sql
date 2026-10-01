CREATE TABLE `Department` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Department_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `JobTitle` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `JobTitle_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Employee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(32) NOT NULL,
    `attendanceCode` VARCHAR(32) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `status` ENUM('WORKING', 'RESIGNED') NOT NULL DEFAULT 'WORKING',
    `userId` INTEGER NULL,
    `avatarUrl` VARCHAR(500) NULL,
    `departmentId` INTEGER NULL,
    `jobTitleId` INTEGER NULL,
    `startDate` DATE NULL,
    `endDate` DATE NULL,
    `note` VARCHAR(500) NULL,
    `nationalId` VARCHAR(32) NULL,
    `birthDate` DATE NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NULL,
    `address` VARCHAR(255) NULL,
    `province` VARCHAR(120) NULL,
    `ward` VARCHAR(120) NULL,
    `email` VARCHAR(160) NULL,
    `facebook` VARCHAR(255) NULL,
    `bankName` VARCHAR(120) NULL,
    `bankAccountNumber` VARCHAR(80) NULL,
    `bankAccountName` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Employee_code_key`(`code`),
    UNIQUE INDEX `Employee_attendanceCode_key`(`attendanceCode`),
    UNIQUE INDEX `Employee_userId_key`(`userId`),
    UNIQUE INDEX `Employee_nationalId_key`(`nationalId`),
    INDEX `Employee_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Employee_name_idx`(`name`),
    INDEX `Employee_departmentId_status_idx`(`departmentId`, `status`),
    INDEX `Employee_jobTitleId_status_idx`(`jobTitleId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeeCompensation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `payBasis` ENUM('MONTHLY', 'HOURLY', 'PER_SHIFT') NOT NULL,
    `baseRate` INTEGER NOT NULL,
    `effectiveFrom` DATE NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdByUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmployeeCompensation_employeeId_effectiveFrom_key`(`employeeId`, `effectiveFrom`),
    INDEX `EmployeeCompensation_employeeId_effectiveFrom_idx`(`employeeId`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Employee`
    ADD CONSTRAINT `Employee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `Employee_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `Employee_jobTitleId_fkey` FOREIGN KEY (`jobTitleId`) REFERENCES `JobTitle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `EmployeeCompensation`
    ADD CONSTRAINT `EmployeeCompensation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `EmployeeCompensation_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
