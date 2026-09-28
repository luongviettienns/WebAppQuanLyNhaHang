import { NextFunction, Request, Response } from 'express';
import { customerCreateSchema, customerGroupSchema, customerListQuerySchema } from './customers.schemas';
import { CustomersService } from './customers.service';

export class CustomersController {
  static async groups(_req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CustomersService.groups() }); } catch (error) { next(error); } }
  static async createGroup(req: Request, res: Response, next: NextFunction) { try { const data = await CustomersService.createGroup(customerGroupSchema.parse(req.body), req.user?.id, req.user?.name); res.status(201).json({ data }); } catch (error) { next(error); } }
  static async create(req: Request, res: Response, next: NextFunction) { try { const data = await CustomersService.create(customerCreateSchema.parse(req.body), req.user?.id, req.user?.name); res.status(201).json({ data }); } catch (error) { next(error); } }
  static async list(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CustomersService.list(customerListQuerySchema.parse(req.query)) }); } catch (error) { next(error); } }
  static async selectable(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CustomersService.selectable(typeof req.query.search === 'string' ? req.query.search : undefined) }); } catch (error) { next(error); } }
}
