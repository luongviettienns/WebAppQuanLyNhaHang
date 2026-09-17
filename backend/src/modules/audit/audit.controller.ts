import { Request, Response, NextFunction } from 'express';
import { AuditService } from './audit.service';
import { getAuditLogsSchema } from './audit.schemas';

export class AuditController {
  static async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = getAuditLogsSchema.parse(req.query);
      const data = await AuditService.getLogs(query);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
