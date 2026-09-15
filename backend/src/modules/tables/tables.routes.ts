import { Router } from 'express';
import { TablesController } from './tables.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const tablesRouter = Router();

// GET /api/tables/qr/:token (Public context cho khach quet QR cua mot ban)
tablesRouter.get('/qr/:token', TablesController.getTableByQrToken);

// GET /api/tables (Chi nhan vien xem so do toan bo ban)
tablesRouter.get('/', authenticate, authorize('CASHIER', 'ADMIN'), TablesController.getTables);

// GET /api/tables/:id (Chi nhan vien xem chi tiet ban)
tablesRouter.get('/:id', authenticate, authorize('CASHIER', 'ADMIN'), TablesController.getTableById);

// PATCH /api/tables/:id/status (Chuyen trang thai don dep ban: CASHIER va ADMIN)
tablesRouter.patch('/:id/status', authenticate, authorize('CASHIER', 'ADMIN'), TablesController.updateTableStatus);

