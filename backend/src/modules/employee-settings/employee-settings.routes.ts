import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { EmployeeSettingsController } from './employee-settings.controller';

export const employeeSettingsRouter = Router();
employeeSettingsRouter.use(authenticate, authorize('ADMIN'));
employeeSettingsRouter.get('/', EmployeeSettingsController.workspace);
employeeSettingsRouter.get('/holidays', EmployeeSettingsController.holidays);
employeeSettingsRouter.post('/attendance-policies', EmployeeSettingsController.createAttendancePolicy);
employeeSettingsRouter.post('/payroll-policies', EmployeeSettingsController.createPayrollPolicy);
employeeSettingsRouter.post('/workweek-policies', EmployeeSettingsController.createWorkweekPolicy);
employeeSettingsRouter.post('/holidays', EmployeeSettingsController.createHoliday);
employeeSettingsRouter.patch('/holidays/:id', EmployeeSettingsController.updateHoliday);
employeeSettingsRouter.post('/holidays/:id/archive', EmployeeSettingsController.archiveHoliday);
