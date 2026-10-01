import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { systemRouter } from './modules/system/system.routes';
import { authRouter } from './modules/auth/auth.routes';
import { menuRouter } from './modules/menu/menu.routes';
import { tablesRouter } from './modules/tables/tables.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { vouchersRouter } from './modules/vouchers/vouchers.routes';
import { priceListRouter } from './modules/price-lists/price-list.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { reservationsRouter } from './modules/reservations/reservations.routes';
import { employeesRouter } from './modules/employees/employees.routes';
import { employeeSchedulesRouter } from './modules/employee-schedules/employee-schedules.routes';
import { employeeAttendanceRouter } from './modules/employee-attendance/employee-attendance.routes';
import { attendanceKioskRouter } from './modules/employee-attendance/attendance-kiosk.routes';
import { employeePayrollRouter } from './modules/employee-payroll/employee-payroll.routes';
import { employeeSettingsRouter } from './modules/employee-settings/employee-settings.routes';
import { employeeCommissionRouter } from './modules/employee-commissions/employee-commission.routes';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';

import { getUploadsDir } from './lib/uploads';

export const app = express();

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json({ limit: '10mb' }));

// Phục vụ ảnh tải lên tĩnh
const uploadsDir = getUploadsDir();
app.use('/uploads', express.static(uploadsDir));

// Swagger UI Documentation Endpoint
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Phục vụ trực tiếp trang Bảng Mã QR 12 Bàn Ăn
app.get('/qr.html', (_req: Request, res: Response) => {
  const possiblePaths = [
    path.resolve(__dirname, '../../qr.html'),
    path.resolve(process.cwd(), 'qr.html'),
    path.resolve(process.cwd(), '../qr.html')
  ];
  const qrFilePath = possiblePaths.find((p) => fs.existsSync(p));
  if (qrFilePath) {
    return res.sendFile(qrFilePath);
  }
  res.status(404).json({ error: { message: 'Không tìm thấy file qr.html' } });
});

// Health Check Endpoint theo Foundation Contract
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    data: {
      status: 'ok'
    }
  });
});

// Authentication routes
app.use('/api/auth', authRouter);

// Menu & Modifiers routes
app.use('/api/menu', menuRouter);

// Dining Tables routes
app.use('/api/tables', tablesRouter);

// Orders & Checkout routes
app.use('/api/orders', ordersRouter);

// Daily Reports & KPI routes (Admin only)
app.use('/api/reports', reportsRouter);

// System Audit Logs routes (Admin only)
app.use('/api/audit', auditRouter);

// Inventory, BOM & Stock routes (Admin & Kitchen)
app.use('/api/inventory', inventoryRouter);

// Vouchers & Promotions routes
app.use('/api/vouchers', vouchersRouter);

// General price list management (Admin only)
app.use('/api/price-lists', priceListRouter);

// Customer profiles and groups (Admin management; staff selection is limited)
app.use('/api/customers', customersRouter);

// Public booking and manual-deposit declaration endpoints
app.use('/api/reservations', reservationsRouter);

// Employee profiles and workforce master data (Admin only)
app.use('/api/employees', employeesRouter);

// Employee schedule management (Admin only)
app.use('/api/employee-schedules', employeeSchedulesRouter);

// Admin attendance operations use the full Admin session; kiosk punches use only their scoped credential.
app.use('/api/employee-attendance', employeeAttendanceRouter);
app.use('/api/attendance-kiosk', attendanceKioskRouter);

// Employee payroll read/write workspace (Admin only).
app.use('/api/employee-payrolls', employeePayrollRouter);

// Versioned branch-aware employee settings (Admin only).
app.use('/api/employee-settings', employeeSettingsRouter);

// Employee commission configuration, assignment, issue queue and immutable ledger.
app.use('/api/employee-commissions', employeeCommissionRouter);

// System routes (ho tro test contracts va status)
app.use('/api/system', systemRouter);

// Frontend static distribution (neu ton tai va khong phai moi truong test)
const possibleFrontendPaths = [
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(process.cwd(), '../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist')
];
const frontendDist = possibleFrontendPaths.find((p) => fs.existsSync(p));

if (process.env.NODE_ENV !== 'test' && frontendDist) {
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/api-docs') || req.path.startsWith('/qr.html')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 Handler cho cac endpoint khong hop le
app.use(notFoundHandler);

// Global Error Handler chuan hoa format { error: { code, message, details? } }
app.use(errorHandler);
