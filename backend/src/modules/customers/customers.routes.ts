import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { CustomersController } from './customers.controller';

export const customersRouter = Router();

customersRouter.get('/selectable', authenticate, authorize('CASHIER', 'ADMIN'), CustomersController.selectable);
customersRouter.get('/groups', authenticate, authorize('ADMIN'), CustomersController.groups);
customersRouter.get('/', authenticate, authorize('ADMIN'), CustomersController.list);
customersRouter.post('/', authenticate, authorize('ADMIN'), CustomersController.create);
customersRouter.post('/groups', authenticate, authorize('ADMIN'), CustomersController.createGroup);
