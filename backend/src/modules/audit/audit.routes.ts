import { Router } from 'express';
import { AuditController } from './audit.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const auditRouter = Router();

// GET /api/audit (Chi ADMIN duoc phep xem nhat ky he thong)
auditRouter.get('/', authenticate, authorize('ADMIN'), AuditController.getLogs);
