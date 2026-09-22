import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../lib/api-error';
import { PriceListService } from './price-list.service';
import {
  menuItemPriceParamsSchema,
  priceListIdParamSchema,
  updateGeneralPriceSchema,
  bulkUpdateGeneralPricesSchema,
  priceImportFileSchema
} from './price-list.schemas';

export class PriceListController {
  static async getGeneral(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await PriceListService.getGeneralPriceListData();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { priceListId, menuItemId } = menuItemPriceParamsSchema.parse(req.params);
      const input = updateGeneralPriceSchema.parse(req.body);
      const data = await PriceListService.updateGeneralPrice(
        priceListId,
        menuItemId,
        input.salePrice,
        input.expectedVersion,
        req.user?.id,
        req.user?.name
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async exportGeneral(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { priceListId } = priceListIdParamSchema.parse(req.params);
      if (priceListId <= 0) throw ApiError.badRequest('priceListId không hợp lệ');
      const buffer = await PriceListService.exportPriceList(priceListId, 'csv');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="price_list_${Date.now()}.csv"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  static async bulkUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { priceListId } = priceListIdParamSchema.parse(req.params);
      const input = bulkUpdateGeneralPricesSchema.parse(req.body);
      const data = await PriceListService.bulkUpdateGeneralPrices(
        priceListId,
        input.menuItemIds,
        input.operation,
        req.user?.id,
        req.user?.name
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async previewImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { priceListId } = priceListIdParamSchema.parse(req.params);
      const input = priceImportFileSchema.parse(req.body);
      const data = await PriceListService.previewPriceImport(priceListId, Buffer.from(input.fileBase64, 'base64'), input.fileName);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async commitImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { priceListId } = priceListIdParamSchema.parse(req.params);
      const input = priceImportFileSchema.parse(req.body);
      const data = await PriceListService.commitPriceImport(
        priceListId,
        Buffer.from(input.fileBase64, 'base64'),
        input.fileName,
        req.user?.id,
        req.user?.name
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
