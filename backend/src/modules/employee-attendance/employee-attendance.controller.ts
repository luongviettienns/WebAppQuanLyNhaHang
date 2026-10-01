import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import {
  parseAdminAttendanceSessionUpdateInput,
  parseAttendanceExceptionQuery,
  parseAttendanceRouteId,
  parseAttendanceWeekQuery,
  parseAttendanceWorkDate,
  parseCreateKioskSessionInput,
  parseDispositionRevokeInput,
  parseKioskSessionId,
  parseKioskSessionListQuery,
  parseManualAttendanceSessionInput,
  parseMarkAttendanceAbsentInput
} from './employee-attendance.schemas';
import { EmployeeAttendanceService } from './employee-attendance.service';
import { EmployeeAttendanceAdminService, PrismaAttendanceAdminStore } from './employee-attendance-admin.service';
import { EmployeeAttendanceKioskAdminService, PrismaAttendanceKioskAdminStore } from './kiosk-session.service';
import { EmployeeAttendancePunchService } from './employee-attendance-punch.service';
import type { KioskSessionContext } from './kiosk-auth';

const kioskAdminService = new EmployeeAttendanceKioskAdminService(new PrismaAttendanceKioskAdminStore(prisma));
const attendancePunchService = new EmployeeAttendancePunchService(prisma);
const attendanceService = new EmployeeAttendanceService(prisma);
const attendanceAdminService = new EmployeeAttendanceAdminService(new PrismaAttendanceAdminStore(prisma));

export class EmployeeAttendanceController {
  static async getWeek(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseAttendanceWeekQuery(req.query);
      res.json({ data: await attendanceService.getWeek(query) });
    } catch (error) {
      next(error);
    }
  }

  static async getExceptions(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseAttendanceExceptionQuery(req.query);
      res.json({ data: await attendanceService.getExceptions(query) });
    } catch (error) {
      next(error);
    }
  }

  static async createManualSession(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseManualAttendanceSessionInput(req.body);
      const result = await attendanceAdminService.createManualSession(input, { id: req.user!.id, name: req.user!.name });
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async updateSession(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = parseAttendanceRouteId(req.params.id, 'Mã phiên chấm công không hợp lệ');
      const input = parseAdminAttendanceSessionUpdateInput(req.body);
      const result = await attendanceAdminService.updateSession(sessionId, input, { id: req.user!.id, name: req.user!.name });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async markAbsent(req: Request, res: Response, next: NextFunction) {
    try {
      const scheduleRuleId = parseAttendanceRouteId(req.params.scheduleRuleId, 'Mã quy tắc lịch không hợp lệ');
      const workDate = parseAttendanceWorkDate(req.params.workDate);
      const input = parseMarkAttendanceAbsentInput(req.body);
      const result = await attendanceAdminService.markAbsent(scheduleRuleId, workDate, input, { id: req.user!.id, name: req.user!.name });
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async resolveAbsenceConflict(req: Request, res: Response, next: NextFunction) {
    try {
      const dispositionId = parseAttendanceRouteId(req.params.id, 'Mã yêu cầu chấm công không hợp lệ');
      const input = parseDispositionRevokeInput(req.body);
      const result = await attendanceAdminService.resolveAbsenceConflict(dispositionId, input, { id: req.user!.id, name: req.user!.name });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async kioskPunch(req: Request, res: Response, next: NextFunction) {
    try {
      const kiosk = req.attendanceKioskSession as KioskSessionContext | undefined;
      if (!kiosk) throw new Error('Kiosk authentication middleware was not applied.');
      res.json({ data: await attendancePunchService.punch(req.body, kiosk) });
    } catch (error) {
      next(error);
    }
  }

  static async listKioskSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseKioskSessionListQuery(req.query);
      res.json({ data: { sessions: await kioskAdminService.list(query.branchId) } });
    } catch (error) {
      next(error);
    }
  }

  static async createKioskSession(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await kioskAdminService.create(parseCreateKioskSessionInput(req.body), { id: req.user!.id });
      res.status(201).json({ data: session });
    } catch (error) {
      next(error);
    }
  }

  static async revokeKioskSession(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await kioskAdminService.revoke(parseKioskSessionId(req.params.id), { id: req.user!.id });
      res.json({ data: { session } });
    } catch (error) {
      next(error);
    }
  }
}
