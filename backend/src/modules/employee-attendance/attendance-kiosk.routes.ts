import { Router } from 'express';
import { attendanceRateLimitHmacSecret } from '../../config/env';
import { prisma } from '../../config/prisma';
import { createKioskSessionAuthentication, PrismaKioskSessionLookup } from './kiosk-auth';
import { createAttendanceRateLimitMiddleware, PrismaAttendanceRateLimitBucketStore } from './attendance-rate-limit';
import { EmployeeAttendanceController } from './employee-attendance.controller';

export const attendanceKioskRouter = Router();
export const authenticateAttendanceKiosk = createKioskSessionAuthentication(new PrismaKioskSessionLookup(prisma));
export const limitAttendanceKioskPunches = createAttendanceRateLimitMiddleware(
  new PrismaAttendanceRateLimitBucketStore(prisma), attendanceRateLimitHmacSecret
);
attendanceKioskRouter.use(authenticateAttendanceKiosk);
attendanceKioskRouter.post('/punch', limitAttendanceKioskPunches, EmployeeAttendanceController.kioskPunch);
