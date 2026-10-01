import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { EmployeeCommissionController } from './employee-commission.controller';

export const employeeCommissionRouter = Router();
employeeCommissionRouter.use(authenticate);

employeeCommissionRouter.get('/assignees', authorize('CASHIER', 'ADMIN'), EmployeeCommissionController.assignees);
employeeCommissionRouter.patch('/order-items/:id/assignment', authorize('CASHIER', 'ADMIN'), EmployeeCommissionController.assignOrderItem);

employeeCommissionRouter.get('/workspace', authorize('ADMIN'), EmployeeCommissionController.workspace);
employeeCommissionRouter.get('/issues', authorize('ADMIN'), EmployeeCommissionController.issues);
employeeCommissionRouter.get('/ledger', authorize('ADMIN'), EmployeeCommissionController.ledger);
employeeCommissionRouter.post('/plans', authorize('ADMIN'), EmployeeCommissionController.createPlan);
employeeCommissionRouter.patch('/plans/:id', authorize('ADMIN'), EmployeeCommissionController.updatePlan);
employeeCommissionRouter.post('/plans/:id/activate', authorize('ADMIN'), EmployeeCommissionController.activatePlan);
employeeCommissionRouter.post('/plans/:id/archive', authorize('ADMIN'), EmployeeCommissionController.archivePlan);
employeeCommissionRouter.post('/plans/:id/rules', authorize('ADMIN'), EmployeeCommissionController.createRule);
employeeCommissionRouter.post('/plans/:id/employees', authorize('ADMIN'), EmployeeCommissionController.createAssignment);
employeeCommissionRouter.post('/issues/:id/retry', authorize('ADMIN'), EmployeeCommissionController.retryIssue);
employeeCommissionRouter.post('/sale-bases/:id/resolutions', authorize('ADMIN'), EmployeeCommissionController.createResolution);
employeeCommissionRouter.post('/order-items/:id/reassign', authorize('ADMIN'), EmployeeCommissionController.reassignOrderItem);

