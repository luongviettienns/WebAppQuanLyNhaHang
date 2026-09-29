import type { NextFunction, Request, Response } from 'express';
import { EmployeePayrollQueryService } from './employee-payroll.query.service';
import {
  parsePayrollBatchId,
  parsePayrollAdjustmentInput,
  parsePayrollCancelInput,
  parsePayrollCreateInput,
  parsePayrollExportQuery,
  parsePayrollFinalizeInput,
  parsePayrollIdempotencyKey,
  parsePayrollListQuery,
  parsePayrollReasonInput,
  parsePayrollRouteId
} from './employee-payroll.schemas';
import {
  serializeEmployeePayrollCsv,
  serializeEmployeePayrollWorkbook
} from './employee-payroll.export';
import { EmployeePayrollMutationService } from './employee-payroll.mutation.service';

const queryService = new EmployeePayrollQueryService();
const mutationService = new EmployeePayrollMutationService();

export class EmployeePayrollController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parsePayrollCreateInput(req.body);
      const idempotencyKey = parsePayrollIdempotencyKey(req.header('Idempotency-Key'));
      const result = await mutationService.create(input, { id: req.user!.id, name: req.user!.name }, idempotencyKey);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async recalculate(req: Request, res: Response, next: NextFunction) {
    try {
      const batchId = parsePayrollBatchId(req.params.id);
      const idempotencyKey = parsePayrollIdempotencyKey(req.header('Idempotency-Key'));
      const result = await mutationService.recalculate(batchId, { id: req.user!.id, name: req.user!.name }, idempotencyKey);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async addAdjustment(req: Request, res: Response, next: NextFunction) {
    try {
      const batchId = parsePayrollBatchId(req.params.id);
      const lineId = parsePayrollRouteId(req.params.lineId, 'Mã dòng lương không hợp lệ');
      const result = await mutationService.addAdjustment(
        batchId, lineId, parsePayrollAdjustmentInput(req.body), { id: req.user!.id, name: req.user!.name }
      );
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async reverseAdjustment(req: Request, res: Response, next: NextFunction) {
    try {
      const batchId = parsePayrollBatchId(req.params.id);
      const lineId = parsePayrollRouteId(req.params.lineId, 'Mã dòng lương không hợp lệ');
      const adjustmentId = parsePayrollRouteId(req.params.adjustmentId, 'Mã điều chỉnh lương không hợp lệ');
      const result = await mutationService.reverseAdjustment(
        batchId, lineId, adjustmentId, parsePayrollReasonInput(req.body), { id: req.user!.id, name: req.user!.name }
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async finalize(req: Request, res: Response, next: NextFunction) {
    try {
      parsePayrollFinalizeInput(req.body);
      const batchId = parsePayrollBatchId(req.params.id);
      const idempotencyKey = parsePayrollIdempotencyKey(req.header('Idempotency-Key'));
      const result = await mutationService.finalize(batchId, { id: req.user!.id, name: req.user!.name }, idempotencyKey);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const batchId = parsePayrollBatchId(req.params.id);
      const result = await mutationService.cancel(
        batchId, parsePayrollCancelInput(req.body), { id: req.user!.id, name: req.user!.name }
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ data: await queryService.list(parsePayrollListQuery(req.query)) });
    } catch (error) {
      next(error);
    }
  }

  static async detail(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ data: await queryService.detail(parsePayrollBatchId(req.params.id)) });
    } catch (error) {
      next(error);
    }
  }

  static async export(req: Request, res: Response, next: NextFunction) {
    try {
      const batchId = parsePayrollBatchId(req.params.id);
      const query = parsePayrollExportQuery(req.query);
      const result = await queryService.exportRows(batchId);
      const buffer = query.format === 'xlsx'
        ? serializeEmployeePayrollWorkbook(result.rows)
        : serializeEmployeePayrollCsv(result.rows);
      res.setHeader(
        'Content-Type',
        query.format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv; charset=utf-8'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${result.batchCode}.${query.format}"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }
}
