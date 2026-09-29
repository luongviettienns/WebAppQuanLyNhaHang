import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { EmployeeSchedulesController } from './employee-schedules.controller';

export const employeeSchedulesRouter = Router();
employeeSchedulesRouter.use(authenticate, authorize('ADMIN'));
employeeSchedulesRouter.get('/week', EmployeeSchedulesController.getWeek);
employeeSchedulesRouter.get('/shifts', EmployeeSchedulesController.listShifts);
employeeSchedulesRouter.post('/', EmployeeSchedulesController.createBatch);
employeeSchedulesRouter.post('/shifts', EmployeeSchedulesController.createShift);
