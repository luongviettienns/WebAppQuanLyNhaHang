import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { PriceListController } from './price-list.controller';

export const priceListRouter = Router();

priceListRouter.use(authenticate, authorize('ADMIN'));
priceListRouter.get('/general', PriceListController.getGeneral);
priceListRouter.patch('/:priceListId/items/bulk', PriceListController.bulkUpdate);
priceListRouter.patch('/:priceListId/items/:menuItemId', PriceListController.updateItem);
priceListRouter.post('/:priceListId/import/preview', PriceListController.previewImport);
priceListRouter.post('/:priceListId/import/commit', PriceListController.commitImport);
priceListRouter.get('/:priceListId/export', PriceListController.exportGeneral);
