CREATE TABLE WorkShift (
  id INTEGER NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  startMinute INTEGER NOT NULL,
  endMinute INTEGER NOT NULL,
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdByUserId INTEGER NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  UNIQUE INDEX WorkShift_code_key(code),
  UNIQUE INDEX WorkShift_name_key(name),
  INDEX WorkShift_isActive_name_idx(isActive, name),
  PRIMARY KEY (id),
  CONSTRAINT WorkShift_createdByUserId_fkey
    FOREIGN KEY (createdByUserId) REFERENCES User(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE EmployeeScheduleRule (
  id INTEGER NOT NULL AUTO_INCREMENT,
  employeeId INTEGER NOT NULL,
  shiftId INTEGER NOT NULL,
  recurrenceType ENUM('ONCE', 'WEEKLY') NOT NULL,
  startDate DATE NOT NULL,
  endDate DATE NULL,
  dayOfWeek INTEGER NULL,
  cancelledAt DATETIME(3) NULL,
  cancelledByUserId INTEGER NULL,
  createdByUserId INTEGER NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  UNIQUE INDEX EmployeeScheduleRule_duplicate_key(employeeId, shiftId, recurrenceType, startDate, dayOfWeek),
  INDEX EmployeeScheduleRule_employeeId_startDate_endDate_idx(employeeId, startDate, endDate),
  INDEX EmployeeScheduleRule_shiftId_startDate_idx(shiftId, startDate),
  INDEX EmployeeScheduleRule_cancelledAt_startDate_idx(cancelledAt, startDate),
  PRIMARY KEY (id),
  CONSTRAINT EmployeeScheduleRule_employeeId_fkey
    FOREIGN KEY (employeeId) REFERENCES Employee(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT EmployeeScheduleRule_shiftId_fkey
    FOREIGN KEY (shiftId) REFERENCES WorkShift(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT EmployeeScheduleRule_createdByUserId_fkey
    FOREIGN KEY (createdByUserId) REFERENCES User(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT EmployeeScheduleRule_cancelledByUserId_fkey
    FOREIGN KEY (cancelledByUserId) REFERENCES User(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE EmployeeScheduleException (
  id INTEGER NOT NULL AUTO_INCREMENT,
  scheduleRuleId INTEGER NOT NULL,
  workDate DATE NOT NULL,
  type ENUM('CANCELLED') NOT NULL DEFAULT 'CANCELLED',
  reason VARCHAR(255) NULL,
  createdByUserId INTEGER NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX EmployeeScheduleException_scheduleRuleId_workDate_key(scheduleRuleId, workDate),
  INDEX EmployeeScheduleException_workDate_type_idx(workDate, type),
  PRIMARY KEY (id),
  CONSTRAINT EmployeeScheduleException_scheduleRuleId_fkey
    FOREIGN KEY (scheduleRuleId) REFERENCES EmployeeScheduleRule(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT EmployeeScheduleException_createdByUserId_fkey
    FOREIGN KEY (createdByUserId) REFERENCES User(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO WorkShift (code, name, startMinute, endMinute, isActive, createdByUserId, createdAt, updatedAt)
VALUES
  ('MORNING', 'Ca sáng', 480, 720, true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('AFTERNOON', 'Ca chiều', 780, 1020, true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('EVENING', 'Ca tối', 1080, 1320, true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE code = VALUES(code);
