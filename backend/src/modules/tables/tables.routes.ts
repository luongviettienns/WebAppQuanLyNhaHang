import { Router } from 'express';
import { TablesController } from './tables.controller';

export const tablesRouter = Router();

// GET /api/tables (Public hoac Authenticated)
tablesRouter.get('/', TablesController.getTables);

// GET /api/tables/:id
tablesRouter.get('/:id', TablesController.getTableById);
