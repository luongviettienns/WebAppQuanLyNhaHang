import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import { createDeliveryPartnerSchema, deliveryPartnerGroupSchema, deliveryPartnerImportFileSchema, deliveryPartnerImportRowsSchema, deliveryPartnerListQuerySchema, updateDeliveryPartnerSchema } from './delivery-partner.schemas';
import { DeliveryPartnerService } from './delivery-partner.service';
import { DeliveryPartnerTransferService } from './delivery-partner-transfer.service';

function parseId(value: string) { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw ApiError.badRequest('ID đối tác giao hàng không hợp lệ'); return id; }
function csvCell(value: unknown) { const text = String(value ?? ''); return /^[=+\-@]/.test(text) ? `'${text.replace(/"/g, '""')}` : `"${text.replace(/"/g, '""')}"`; }

export class DeliveryPartnerController {
  static async list(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await DeliveryPartnerService.list(deliveryPartnerListQuerySchema.parse(req.query)) }); } catch (error) { next(error); } }
  static async selectable(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await DeliveryPartnerService.selectable(typeof req.query.search === 'string' ? req.query.search : undefined) }); } catch (error) { next(error); } }
  static async detail(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await DeliveryPartnerService.detail(parseId(req.params.id)) }); } catch (error) { next(error); } }
  static async create(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await DeliveryPartnerService.create(createDeliveryPartnerSchema.parse(req.body), req.user?.id, req.user?.name) }); } catch (error) { next(error); } }
  static async update(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await DeliveryPartnerService.update(parseId(req.params.id), updateDeliveryPartnerSchema.parse(req.body), req.user?.id, req.user?.name) }); } catch (error) { next(error); } }
  static async groups(_req: Request, res: Response, next: NextFunction) { try { res.json({ data: await DeliveryPartnerService.groups() }); } catch (error) { next(error); } }
  static async saveGroup(req: Request, res: Response, next: NextFunction) { try { const id = req.params.id ? parseId(req.params.id) : null; res.status(id === null ? 201 : 200).json({ data: await DeliveryPartnerService.saveGroup(id, deliveryPartnerGroupSchema.parse(req.body).name, req.user?.id, req.user?.name) }); } catch (error) { next(error); } }
  static async export(req: Request, res: Response, next: NextFunction) {
    try {
      const format = req.query.format || 'csv'; if (format !== 'csv' && format !== 'xlsx') throw ApiError.badRequest('Định dạng không hợp lệ');
      const buffer = await DeliveryPartnerTransferService.export(deliveryPartnerListQuerySchema.parse(req.query), format);
      res.type(format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('Doi_tac_giao_hang.' + format).send(buffer);
    } catch (error) { next(error); }
  }
  static async template(_req: Request, res: Response, next: NextFunction) { try { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('Mau_doi_tac_giao_hang.xlsx').send(DeliveryPartnerTransferService.template()); } catch (error) { next(error); } }
  static async preview(req: Request, res: Response, next: NextFunction) { try { const input = deliveryPartnerImportFileSchema.parse(req.body); res.json({ data: await DeliveryPartnerTransferService.preview(input.fileName, input.fileBase64) }); } catch (error) { next(error); } }
  static async commit(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await DeliveryPartnerTransferService.commit(deliveryPartnerImportRowsSchema.parse(req.body).rows, req.user?.id, req.user?.name) }); } catch (error) { next(error); } }
}
