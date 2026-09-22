import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import { createSupplierSchema, supplierListQuerySchema, updateSupplierSchema } from './supplier.schemas';
import { SupplierService } from './supplier.service';
import { supplierGroupSchema, supplierImportFileSchema, supplierImportRowsSchema } from './supplier.schemas';
import { SupplierReportService } from './supplier-report.service';
import { SupplierTransferService } from './supplier-transfer.service';

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw ApiError.badRequest('ID không hợp lệ');
  return id;
}

export class SupplierController {
  static async groups(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await SupplierService.groups() }); } catch (error) { next(error); }
  }
  static async saveGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id ? parseId(req.params.id) : null;
      const data = await SupplierService.saveGroup(id, supplierGroupSchema.parse(req.body).name, req.user?.id, req.user?.name);
      res.status(id === null ? 201 : 200).json({ data });
    } catch (error) { next(error); }
  }
  static async detail(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await SupplierReportService.detail(parseId(req.params.id)) }); } catch (error) { next(error); }
  }
  static async receipts(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, pageSize } = supplierListQuerySchema.parse(req.query);
      res.json({ data: await SupplierReportService.receipts(parseId(req.params.id), page, pageSize) });
    } catch (error) { next(error); }
  }
  static async template(_req: Request, res: Response, next: NextFunction) {
    try {
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('Mau_nha_cung_cap.xlsx').send(SupplierTransferService.template());
    } catch (error) { next(error); }
  }
  static async export(req: Request, res: Response, next: NextFunction) {
    try {
      const format = req.query.format || 'xlsx';
      if (format !== 'csv' && format !== 'xlsx') throw ApiError.badRequest('Định dạng không hợp lệ');
      const buffer = await SupplierTransferService.export(supplierListQuerySchema.parse(req.query), format);
      res.type(format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('Nha_cung_cap.' + format).send(buffer);
    } catch (error) { next(error); }
  }
  static async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const input = supplierImportFileSchema.parse(req.body);
      res.json({ data: await SupplierTransferService.preview(input.fileName, input.fileBase64) });
    } catch (error) { next(error); }
  }
  static async commit(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: await SupplierTransferService.commit(supplierImportRowsSchema.parse(req.body).rows, req.user?.id, req.user?.name) }); }
    catch (error) { next(error); }
  }
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await SupplierService.list(supplierListQuerySchema.parse(req.query)) });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await SupplierService.create(createSupplierSchema.parse(req.body), req.user?.id, req.user?.name);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('ID nhà cung cấp không hợp lệ');
      const data = await SupplierService.update(id, updateSupplierSchema.parse(req.body), req.user?.id, req.user?.name);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
