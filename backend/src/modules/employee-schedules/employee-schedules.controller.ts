import { NextFunction, Request, Response } from 'express';
import { EmployeeSchedulesService } from './employee-schedules.service';
import {
  parseCreateScheduleBatchInput,
  parseCreateWorkShiftInput,
  parseScheduleDeleteInput,
  parseScheduleMutationInput,
  parseScheduleRuleId,
  parseScheduleWeekQuery
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
      });
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
}
