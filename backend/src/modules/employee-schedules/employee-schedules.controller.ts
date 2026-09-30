import { NextFunction, Request, Response } from 'express';
import { EmployeeSchedulesService } from './employee-schedules.service';
import { EmployeeScheduleTransferService } from './employee-schedule-transfer.service';
import {
  parseCreateScheduleBatchInput,
  parseCreateWorkShiftInput,
  parseScheduleDeleteInput,
  parseScheduleMutationInput,
  parseScheduleRuleId,
  parseScheduleWeekQuery,
  parseScheduleImportExportQuery,
  parseScheduleImportFile,
  parseScheduleImportRows,
  parseScheduleIdempotencyKey
} from './employee-schedules.schemas';

export class EmployeeSchedulesController {
  static async getWeek(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ data: await EmployeeSchedulesService.getWeek(parseScheduleWeekQuery(req.query)) });
    } catch (error) {
      next(error);
    }
  }

  static async createBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await EmployeeSchedulesService.createBatch(parseCreateScheduleBatchInput(req.body), {
        id: req.user!.id,
        name: req.user!.name
      }, parseScheduleIdempotencyKey(req.header('Idempotency-Key')));
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async mutateRule(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await EmployeeSchedulesService.mutateRule(parseScheduleRuleId(req.params.ruleId), parseScheduleMutationInput(req.body), {
        id: req.user!.id,
        name: req.user!.name
      });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async deleteRule(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await EmployeeSchedulesService.deleteRule(parseScheduleRuleId(req.params.ruleId), parseScheduleDeleteInput(req.query), {
        id: req.user!.id,
        name: req.user!.name
      });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async listShifts(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ data: { shifts: await EmployeeSchedulesService.listShifts() } });
    } catch (error) {
      next(error);
    }
  }

  static async createShift(req: Request, res: Response, next: NextFunction) {
    try {
      const shift = await EmployeeSchedulesService.createShift(parseCreateWorkShiftInput(req.body), {
        id: req.user!.id,
        name: req.user!.name
      });
      res.status(201).json({ data: { shift } });
    } catch (error) {
      next(error);
    }
  }

  static async exportWeek(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseScheduleImportExportQuery(req.query);
      const buffer = await EmployeeScheduleTransferService.export(query.weekStart, query.format);
      res.type(query.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .attachment(`lich_lam_viec_${query.weekStart}.${query.format}`).send(buffer);
    } catch (error) { next(error); }
  }

  static async importTemplate(_req: Request, res: Response, next: NextFunction) {
    try {
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .attachment('mau_lich_lam_viec.xlsx').send(EmployeeScheduleTransferService.template());
    } catch (error) { next(error); }
  }

  static async previewImport(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseScheduleImportFile(req.body);
      res.json({ data: await EmployeeScheduleTransferService.preview(input.fileName, input.fileBase64) });
    } catch (error) { next(error); }
  }

  static async commitImport(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseScheduleImportRows(req.body);
      const data = await EmployeeScheduleTransferService.commit(
        input.rows,
        input.calendarWarningAcknowledged,
        { id: req.user!.id, name: req.user!.name },
        parseScheduleIdempotencyKey(req.header('Idempotency-Key'))
      );
      res.status(201).json({ data });
    } catch (error) { next(error); }
  }
}
