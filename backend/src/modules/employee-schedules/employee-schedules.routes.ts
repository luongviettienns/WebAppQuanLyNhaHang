import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { EmployeeSchedulesController } from './employee-schedules.controller';

export const employeeSchedulesRouter = Router();
employeeSchedulesRouter.use(authenticate, authorize('ADMIN'));
employeeSchedulesRouter.get('/week', EmployeeSchedulesController.getWeek);
employeeSchedulesRouter.get('/export', EmployeeSchedulesController.exportWeek);
employeeSchedulesRouter.get('/import/template', EmployeeSchedulesController.importTemplate);
employeeSchedulesRouter.post('/import/preview', EmployeeSchedulesController.previewImport);
employeeSchedulesRouter.post('/import/commit', EmployeeSchedulesController.commitImport);
employeeSchedulesRouter.get('/shifts', EmployeeSchedulesController.listShifts);
employeeSchedulesRouter.post('/', EmployeeSchedulesController.createBatch);
employeeSchedulesRouter.post('/shifts', EmployeeSchedulesController.createShift);
employeeSchedulesRouter.patch('/:ruleId', EmployeeSchedulesController.mutateRule);
employeeSchedulesRouter.delete('/:ruleId', EmployeeSchedulesController.deleteRule);
