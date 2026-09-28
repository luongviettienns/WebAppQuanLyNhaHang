import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { EmployeesController } from './employees.controller';

export const employeesRouter = Router();
const adminOnly = [authenticate, authorize('ADMIN')];

employeesRouter.post('/avatar', ...adminOnly, EmployeesController.uploadAvatar);
employeesRouter.get('/departments', ...adminOnly, EmployeesController.departments);
employeesRouter.post('/departments', ...adminOnly, EmployeesController.createDepartment);
employeesRouter.patch('/departments/:id', ...adminOnly, EmployeesController.updateDepartment);
employeesRouter.get('/job-titles', ...adminOnly, EmployeesController.jobTitles);
employeesRouter.post('/job-titles', ...adminOnly, EmployeesController.createJobTitle);
employeesRouter.patch('/job-titles/:id', ...adminOnly, EmployeesController.updateJobTitle);
employeesRouter.get('/linkable-users', ...adminOnly, EmployeesController.linkableUsers);
employeesRouter.get('/', ...adminOnly, EmployeesController.list);
employeesRouter.post('/', ...adminOnly, EmployeesController.create);
employeesRouter.get('/:id', ...adminOnly, EmployeesController.get);
employeesRouter.patch('/:id/status', ...adminOnly, EmployeesController.updateStatus);
employeesRouter.post('/:id/compensations', ...adminOnly, EmployeesController.appendCompensation);
employeesRouter.patch('/:id', ...adminOnly, EmployeesController.update);
