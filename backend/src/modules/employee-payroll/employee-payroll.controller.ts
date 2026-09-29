import type { NextFunction, Request, Response } from 'express';
import { EmployeePayrollQueryService } from './employee-payroll.query.service';
import {
  parsePayrollBatchId,
  parsePayrollExportQuery,
  parsePayrollListQuery
} from './employee-payroll.schemas';
import {
  serializeEmployeePayrollCsv,
  serializeEmployeePayrollWorkbook
} from './employee-payroll.export';

const queryService = new EmployeePayrollQueryService();

export class EmployeePayrollController {
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
