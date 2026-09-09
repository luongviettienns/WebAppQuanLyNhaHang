import { Request, Response, NextFunction } from 'express';
import { ReportsService } from './reports.service';
import { getDailyReportSchema } from './reports.schemas';

export class ReportsController {
  static async getDailyReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { date } = getDailyReportSchema.parse(req.query);
      const data = await ReportsService.getDailyReport(date);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
