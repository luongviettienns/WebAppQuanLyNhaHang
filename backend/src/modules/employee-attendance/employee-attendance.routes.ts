import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { EmployeeAttendanceController } from './employee-attendance.controller';

export const employeeAttendanceRouter = Router();
employeeAttendanceRouter.use(authenticate, authorize('ADMIN'));
employeeAttendanceRouter.get('/week', EmployeeAttendanceController.getWeek);
employeeAttendanceRouter.get('/exceptions', EmployeeAttendanceController.getExceptions);
employeeAttendanceRouter.post('/sessions/manual', EmployeeAttendanceController.createManualSession);
employeeAttendanceRouter.patch('/sessions/:id', EmployeeAttendanceController.updateSession);
employeeAttendanceRouter.post('/occurrences/:scheduleRuleId/:workDate/absent', EmployeeAttendanceController.markAbsent);
employeeAttendanceRouter.post('/dispositions/:id/resolve-conflict', EmployeeAttendanceController.resolveAbsenceConflict);
employeeAttendanceRouter.get('/kiosk-sessions', EmployeeAttendanceController.listKioskSessions);
employeeAttendanceRouter.post('/kiosk-sessions', EmployeeAttendanceController.createKioskSession);
employeeAttendanceRouter.post('/kiosk-sessions/:id/revoke', EmployeeAttendanceController.revokeKioskSession);
