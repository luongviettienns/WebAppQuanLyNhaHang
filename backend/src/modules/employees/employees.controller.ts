import { NextFunction, Request, Response } from 'express';
import {
  departmentCreateSchema,
  departmentUpdateSchema,
  employeeCompensationSchema,
  employeeCreateSchema,
  employeeIdSchema,
  employeeListQuerySchema,
  employeeStatusSchema,
  employeeUpdateSchema,
  jobTitleCreateSchema,
  jobTitleUpdateSchema,
  linkableUsersQuerySchema
} from './employees.schemas';
import { EmployeesService } from './employees.service';

const actor = (req: Request) => ({ id: req.user!.id, name: req.user!.name });
const idFrom = (req: Request) => employeeIdSchema.parse(req.params.id);

export class EmployeesController {
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
