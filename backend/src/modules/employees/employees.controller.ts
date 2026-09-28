import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import { getUploadsDir } from '../../lib/uploads';
import { AuditService } from '../audit/audit.service';
import {
  departmentCreateSchema,
  departmentUpdateSchema,
  employeeCompensationSchema,
  employeeCreateSchema,
  employeeIdSchema,
  employeeListQuerySchema,
  employeeStatusSchema,
  employeeUpdateSchema,
  employeeAvatarUploadSchema,
  jobTitleCreateSchema,
  jobTitleUpdateSchema,
  linkableUsersQuerySchema
} from './employees.schemas';
import { EmployeesService } from './employees.service';

const actor = (req: Request) => ({ id: req.user!.id, name: req.user!.name });
const idFrom = (req: Request) => employeeIdSchema.parse(req.params.id);

export class EmployeesController {
  static async uploadAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const { dataUrl } = employeeAvatarUploadSchema.parse(req.body);
      const matches = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
      if (!matches || matches[2].length % 4 !== 0) {
        throw ApiError.badRequest('Ảnh phải là JPEG, PNG hoặc WebP hợp lệ');
      }

      const mimeType = `image/${matches[1]}`;
      const base64 = matches[2];
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.toString('base64') !== base64 || buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
        throw ApiError.badRequest('Ảnh không hợp lệ hoặc vượt quá dung lượng tối đa 2 MiB');
      }

      const signatures: Record<string, (bytes: Buffer) => boolean> = {
        'image/jpeg': bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
        'image/png': bytes => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        'image/webp': bytes => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
      };
      if (!signatures[mimeType]?.(buffer)) {
        throw ApiError.badRequest('Nội dung ảnh không khớp với định dạng đã khai báo');
      }

      const extension = mimeType === 'image/jpeg' ? 'jpg' : matches[1];
      const fileName = `employee_avatar_${crypto.randomUUID()}.${extension}`;
      const filePath = path.join(getUploadsDir(), fileName);
      fs.writeFileSync(filePath, buffer, { flag: 'wx' });

      await AuditService.log({
        action: 'EMPLOYEE_AVATAR_UPLOADED',
        targetType: 'EmployeeAvatar',
        actorId: req.user?.id,
        actorName: req.user?.name,
        metadata: { fileName, mimeType, fileSize: buffer.length }
      });

      res.status(201).json({ data: { avatarUrl: `/uploads/${fileName}`, fileName } });
    } catch (error) { next(error); }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeesService.list(employeeListQuerySchema.parse(req.query)) }); } catch (error) { next(error); }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeesService.get(idFrom(req)) }); } catch (error) { next(error); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = actor(req);
      const data = await EmployeesService.create(employeeCreateSchema.parse(req.body), user.id, user.name);
      res.status(201).json({ data });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const user = actor(req);
      res.json({ data: await EmployeesService.update(idFrom(req), employeeUpdateSchema.parse(req.body), user.id, user.name) });
    } catch (error) { next(error); }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const user = actor(req);
      res.json({ data: await EmployeesService.updateStatus(idFrom(req), employeeStatusSchema.parse(req.body), user.id, user.name) });
    } catch (error) { next(error); }
  }

  static async appendCompensation(req: Request, res: Response, next: NextFunction) {
    try {
      const user = actor(req);
      res.status(201).json({ data: await EmployeesService.appendCompensation(idFrom(req), employeeCompensationSchema.parse(req.body), user.id, user.name) });
    } catch (error) { next(error); }
  }

  static async departments(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeesService.departments() }); } catch (error) { next(error); }
  }

  static async createDepartment(req: Request, res: Response, next: NextFunction) {
    try {
      const user = actor(req);
      res.status(201).json({ data: await EmployeesService.createDepartment(departmentCreateSchema.parse(req.body), user.id, user.name) });
    } catch (error) { next(error); }
  }

  static async updateDepartment(req: Request, res: Response, next: NextFunction) {
    try {
      const user = actor(req);
      res.json({ data: await EmployeesService.updateDepartment(idFrom(req), departmentUpdateSchema.parse(req.body), user.id, user.name) });
    } catch (error) { next(error); }
  }

  static async jobTitles(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeesService.jobTitles() }); } catch (error) { next(error); }
  }

  static async createJobTitle(req: Request, res: Response, next: NextFunction) {
    try {
      const user = actor(req);
      res.status(201).json({ data: await EmployeesService.createJobTitle(jobTitleCreateSchema.parse(req.body), user.id, user.name) });
    } catch (error) { next(error); }
  }

  static async updateJobTitle(req: Request, res: Response, next: NextFunction) {
    try {
      const user = actor(req);
      res.json({ data: await EmployeesService.updateJobTitle(idFrom(req), jobTitleUpdateSchema.parse(req.body), user.id, user.name) });
    } catch (error) { next(error); }
  }

  static async linkableUsers(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await EmployeesService.linkableUsers(linkableUsersQuerySchema.parse(req.query)) }); } catch (error) { next(error); }
  }
}
