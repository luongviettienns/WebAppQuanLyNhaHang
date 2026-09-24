import { NextFunction, Request, Response } from 'express';
import { serializeOrderInvoicesCsv, serializeOrderInvoicesWorkbook } from './order-invoice.export';
import { OrderInvoiceService } from './order-invoice.service';
import { orderInvoiceExportSchema, orderInvoiceIdSchema, orderInvoiceQuerySchema } from './order-invoice.schemas';

export class OrderInvoiceController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ data: await OrderInvoiceService.list(orderInvoiceQuerySchema.parse(req.query)) }); } catch (error) { next(error); }
  }

  static async detail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = orderInvoiceIdSchema.parse(req.params);
      res.json({ data: { invoice: await OrderInvoiceService.detail(id) } });
    } catch (error) { next(error); }
  }

  static async export(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = orderInvoiceExportSchema.parse(req.query);
      const rows = await OrderInvoiceService.exportRows(query);
      const buffer = query.format === 'xlsx' ? serializeOrderInvoicesWorkbook(rows) : serializeOrderInvoicesCsv(rows);
      res.setHeader('Content-Type', query.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="hoa_don_${Date.now()}.${query.format}"`);
      res.send(buffer);
    } catch (error) { next(error); }
  }
}
