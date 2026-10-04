import { Request, Response, NextFunction } from 'express';
import { ReportsService } from './reports.service';
import { getDailyReportSchema } from './reports.schemas';
import { ApiError } from '../../lib/api-error';
import { parseEndOfDayQuery } from './end-of-day/end-of-day.schemas';
import { EndOfDayReportService, EndOfDayReportRowLimitError } from './end-of-day/end-of-day.service';
import { END_OF_DAY_EXPORT_MAX_ROWS, reportExportTooLarge, serializeEndOfDayWorkbook } from './end-of-day/end-of-day.export';

const endOfDayService = new EndOfDayReportService();

export class ReportsController {
  static async getEndOfDayReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = parseEndOfDayQuery(req.query);
      const data = await endOfDayService.get(query);
      res.status(200).json({ data });
    } catch (error) { next(error); }
  }

  static async exportEndOfDayReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, ...input } = req.query;
      if (format !== 'xlsx') throw ApiError.badRequest('Chỉ hỗ trợ xuất báo cáo với format=xlsx');
      const query = parseEndOfDayQuery(input);
      const snapshot = await endOfDayService.get(query, { mode: 'EXPORT', maxRows: END_OF_DAY_EXPORT_MAX_ROWS });
      const workbook = serializeEndOfDayWorkbook({ ...snapshot, filters: query });
      res.status(200).set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="end-of-day-${query.date}.xlsx"`,
        'Cache-Control': 'no-store'
      }).send(workbook);
    } catch (error) {
      next(error instanceof EndOfDayReportRowLimitError ? reportExportTooLarge(error.estimatedRows, error.maxRows) : error);
    }
  }

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
