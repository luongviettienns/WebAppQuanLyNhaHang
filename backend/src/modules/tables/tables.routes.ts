import { Router } from 'express';
import { TablesController } from './tables.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const tablesRouter = Router();

// Configuration routes must precede /:id to avoid static paths being parsed as IDs.
tablesRouter.get('/manage', authenticate, authorize('ADMIN'), TablesController.manage);
tablesRouter.get('/manage/export', authenticate, authorize('ADMIN'), TablesController.export);
tablesRouter.get('/manage/import/template', authenticate, authorize('ADMIN'), TablesController.importTemplate);
tablesRouter.post('/manage/import/preview', authenticate, authorize('ADMIN'), TablesController.previewImport);
tablesRouter.post('/manage/import/commit', authenticate, authorize('ADMIN'), TablesController.commitImport);
tablesRouter.get('/areas', authenticate, authorize('ADMIN'), TablesController.areas);
tablesRouter.post('/areas', authenticate, authorize('ADMIN'), TablesController.saveArea);
tablesRouter.patch('/areas/:id', authenticate, authorize('ADMIN'), TablesController.saveArea);
tablesRouter.post('/', authenticate, authorize('ADMIN'), TablesController.create);
tablesRouter.patch('/:id', authenticate, authorize('ADMIN'), TablesController.update);

// GET /api/tables/public (Public: Danh sach ban kem QR token de render/in ma QR)
tablesRouter.get('/public', TablesController.getPublicTables);

// GET /api/tables/by-number/:tableNumber (Public: Context cho khach vao theo so ban)
tablesRouter.get('/by-number/:tableNumber', TablesController.getTableByNumber);

// GET /api/tables/qr/:token (Public context cho khach quet QR cua mot ban)
tablesRouter.get('/qr/:token', TablesController.getTableByQrToken);

// GET /api/tables (Chi nhan vien xem so do toan bo ban)
tablesRouter.get('/', authenticate, authorize('CASHIER', 'KITCHEN', 'ADMIN'), TablesController.getTables);

// GET /api/tables/:id (Chi nhan vien xem chi tiet ban)
tablesRouter.get('/:id', authenticate, authorize('CASHIER', 'KITCHEN', 'ADMIN'), TablesController.getTableById);

// PATCH /api/tables/:id/status (Chuyen trang thai don dep ban: CASHIER va ADMIN)
tablesRouter.patch('/:id/status', authenticate, authorize('CASHIER', 'ADMIN'), TablesController.updateTableStatus);

