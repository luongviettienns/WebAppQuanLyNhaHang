import type { NextFunction, Request, Response } from 'express';
import { EmployeeSettingsMutationService } from './employee-settings.mutation.service';
import { EmployeeSettingsQueryService } from './employee-settings.query.service';
import {
  parseAttendancePolicyCreateInput,
  parseEmployeeSettingsQuery,
  parseHolidayArchiveInput,
  parseHolidayCreateInput,
  parseHolidayId,
  parseHolidayListQuery,
  parseHolidayUpdateInput,
  parsePayrollPolicyCreateInput,
  parseWorkweekPolicyCreateInput
} from './employee-settings.schemas';

function actor(req: Request) {
  return { id: req.user!.id, name: req.user!.name };
}

export class EmployeeSettingsController {
  static async workspace(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseEmployeeSettingsQuery(req.query);
      res.json({ data: await EmployeeSettingsQueryService.getWorkspace(query.branchId) });
    } catch (error) { next(error); }
  }

  static async holidays(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ data: { holidays: await EmployeeSettingsQueryService.listHolidays(parseHolidayListQuery(req.query)) } });
    } catch (error) { next(error); }
  }

  static async createAttendancePolicy(req: Request, res: Response, next: NextFunction) {
    try {
      const policy = await EmployeeSettingsMutationService.createAttendancePolicy(parseAttendancePolicyCreateInput(req.body), actor(req));
      res.status(201).json({ data: { policy } });
    } catch (error) { next(error); }
  }

  static async createPayrollPolicy(req: Request, res: Response, next: NextFunction) {
    try {
      const policy = await EmployeeSettingsMutationService.createPayrollPolicy(parsePayrollPolicyCreateInput(req.body), actor(req));
      res.status(201).json({ data: { policy } });
    } catch (error) { next(error); }
  }

  static async createWorkweekPolicy(req: Request, res: Response, next: NextFunction) {
    try {
      const policy = await EmployeeSettingsMutationService.createWorkweekPolicy(parseWorkweekPolicyCreateInput(req.body), actor(req));
      res.status(201).json({ data: { policy } });
    } catch (error) { next(error); }
  }

  static async createHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json({ data: await EmployeeSettingsMutationService.createHoliday(parseHolidayCreateInput(req.body), actor(req)) });
    } catch (error) { next(error); }
  }

  static async updateHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ data: await EmployeeSettingsMutationService.updateHoliday(
        parseHolidayId(req.params.id), parseHolidayUpdateInput(req.body), actor(req)
      ) });
    } catch (error) { next(error); }
  }

  static async archiveHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ data: await EmployeeSettingsMutationService.archiveHoliday(
        parseHolidayId(req.params.id), parseHolidayArchiveInput(req.body), actor(req)
      ) });
    } catch (error) { next(error); }
  }
}
