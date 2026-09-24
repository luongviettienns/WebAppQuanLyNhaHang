import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import { serializeSalesReturnsCsv, serializeSalesReturnsWorkbook } from './sales-return.export';
import { SalesReturnService } from './sales-return.service';
import { salesReturnCandidateQuerySchema, salesReturnCreateSchema, salesReturnExportSchema, salesReturnIdSchema, salesReturnQuerySchema } from './sales-return.schemas';

const idOf = (value: string) => { const parsed = salesReturnIdSchema.parse({ id: value }).id; if (!Number.isSafeInteger(parsed)) throw ApiError.badRequest('ID phiếu trả không hợp lệ'); return parsed; };
export class SalesReturnController {
  static async candidates(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await SalesReturnService.candidates(salesReturnCandidateQuerySchema.parse(req.query)) }); } catch (error) { next(error); } }
  static async list(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await SalesReturnService.list(salesReturnQuerySchema.parse(req.query)) }); } catch (error) { next(error); } }
  static async detail(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await SalesReturnService.detail(idOf(req.params.id)) }); } catch (error) { next(error); } }
  static async create(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await SalesReturnService.create(salesReturnCreateSchema.parse(req.body), { id: req.user!.id, name: req.user!.name }) }); } catch (error) { next(error); } }
  static async export(req: Request, res: Response, next: NextFunction) { try { const query = salesReturnExportSchema.parse(req.query); const rows = await SalesReturnService.exportRows(query); const buffer = query.format === 'xlsx' ? serializeSalesReturnsWorkbook(rows) : serializeSalesReturnsCsv(rows); res.setHeader('Content-Type', query.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="phieu_tra_hang_${Date.now()}.${query.format}"`); res.send(buffer); } catch (error) { next(error); } }
}
