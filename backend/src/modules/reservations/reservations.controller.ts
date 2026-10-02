import { NextFunction, Request, Response } from 'express';
import { ReservationsService } from './reservations.service';
import {
  checkInReservationSchema,
  confirmDepositSchema,
  createPublicReservationSchema,
  markNoShowSchema,
  publicCancellationSchema,
  rejectDepositSchema,
  refundDepositSchema,
  reservationListQuerySchema,
  rescheduleReservationSchema,
  staffCancellationSchema
} from './reservations.schemas';
import { ApiError } from '../../lib/api-error';

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw ApiError.badRequest('ID đặt bàn không hợp lệ');
  return id;
}

export class ReservationsController {
  static async getPublic(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.getPublic(req.params.accessToken) }); } catch (error) { next(error); } }
  static async requestCancellation(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.requestCancellation(req.params.accessToken, publicCancellationSchema.parse(req.body)) }); } catch (error) { next(error); } }
  static async list(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.list(reservationListQuerySchema.parse(req.query)) }); } catch (error) { next(error); } }
  static async getStaffDetail(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.getStaffDetail(parseId(req.params.id)) }); } catch (error) { next(error); } }
  static async createPublic(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await ReservationsService.createPublic(createPublicReservationSchema.parse(req.body)) }); } catch (error) { next(error); } }
  static async declarePayment(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.declarePayment(req.params.accessToken) }); } catch (error) { next(error); } }
  static async confirmDeposit(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.confirmDeposit(parseId(req.params.id), confirmDepositSchema.parse(req.body), req.user!.id, req.user!.name, req.user!.role === 'ADMIN' ? 'ADMIN' : 'CASHIER') }); } catch (error) { next(error); } }
  static async rejectDeposit(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.rejectDeposit(parseId(req.params.id), rejectDepositSchema.parse(req.body), req.user!.id, req.user!.name) }); } catch (error) { next(error); } }
  static async refundDeposit(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.refundDeposit(parseId(req.params.id), refundDepositSchema.parse(req.body), req.user!.id, req.user!.name, req.user!.role === 'ADMIN' ? 'ADMIN' : 'CASHIER') }); } catch (error) { next(error); } }
  static async reschedule(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.reschedule(parseId(req.params.id), rescheduleReservationSchema.parse(req.body), req.user!.id, req.user!.name) }); } catch (error) { next(error); } }
  static async markNoShow(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.markNoShow(parseId(req.params.id), markNoShowSchema.parse(req.body), req.user!.id, req.user!.name) }); } catch (error) { next(error); } }
  static async checkIn(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.checkIn(parseId(req.params.id), checkInReservationSchema.parse(req.body), req.user!.id, req.user!.name) }); } catch (error) { next(error); } }
  static async cancelByRestaurant(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await ReservationsService.cancelByRestaurant(parseId(req.params.id), staffCancellationSchema.parse(req.body), req.user!.id, req.user!.name) }); } catch (error) { next(error); } }
}
