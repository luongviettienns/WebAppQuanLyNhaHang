import { Router } from 'express';
import { TablesController } from './tables.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const tablesRouter = Router();

// GET /api/tables (Public hoac Authenticated)
tablesRouter.get('/', TablesController.getTables);

// GET /api/tables/:id
tablesRouter.get('/:id', TablesController.getTableById);

// PATCH /api/tables/:id/status (Chuyen trang thai don dep ban: CASHIER va ADMIN)
tablesRouter.patch('/:id/status', authenticate, authorize('CASHIER', 'ADMIN'), TablesController.updateTableStatus);

