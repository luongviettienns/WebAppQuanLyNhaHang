import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { EmployeePayrollController } from './employee-payroll.controller';

export const employeePayrollRouter = Router();
employeePayrollRouter.use(authenticate, authorize('ADMIN'));
employeePayrollRouter.get('/', EmployeePayrollController.list);
employeePayrollRouter.post('/', EmployeePayrollController.create);
employeePayrollRouter.get('/:id/export', EmployeePayrollController.export);
employeePayrollRouter.get('/:id', EmployeePayrollController.detail);
employeePayrollRouter.post('/:id/recalculate', EmployeePayrollController.recalculate);
