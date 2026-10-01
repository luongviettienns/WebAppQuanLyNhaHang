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
employeePayrollRouter.post('/:id/finalize', EmployeePayrollController.finalize);
employeePayrollRouter.post('/:id/cancel', EmployeePayrollController.cancel);
employeePayrollRouter.post('/:id/lines/:lineId/adjustments', EmployeePayrollController.addAdjustment);
employeePayrollRouter.post('/:id/lines/:lineId/adjustments/:adjustmentId/reverse', EmployeePayrollController.reverseAdjustment);
employeePayrollRouter.post('/:id/lines/:lineId/payments', EmployeePayrollController.recordPayment);
employeePayrollRouter.post('/:id/lines/:lineId/payments/:paymentId/reverse', EmployeePayrollController.reversePayment);
