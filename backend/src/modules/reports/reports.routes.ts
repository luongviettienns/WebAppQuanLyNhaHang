import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const reportsRouter = Router();

// GET /api/reports/daily (Chi ADMIN duoc phep xem bao cao)
reportsRouter.get('/daily', authenticate, authorize('ADMIN'), ReportsController.getDailyReport);
reportsRouter.get('/end-of-day', authenticate, authorize('ADMIN'), ReportsController.getEndOfDayReport);
reportsRouter.get('/end-of-day/export', authenticate, authorize('ADMIN'), ReportsController.exportEndOfDayReport);
