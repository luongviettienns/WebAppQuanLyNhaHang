import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env tu thu muc goc cua du an neu dang chay local
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // Fallback load .env tai thu muc hien tai neu co

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL khong duoc de trong'),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phai dai it nhat 32 ky tu de dam bao an toan'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  JWT_ISSUER: z.string().default('crispy-bite-api'),
  JWT_AUDIENCE: z.string().default('crispy-bite-client'),
  CORS_ORIGIN: z.string().default('http://localhost:8081'),
  EXPO_PUBLIC_API_URL: z.string().optional(),
  EXPO_PUBLIC_SOCKET_URL: z.string().optional(),
  VAT_RATE_BPS: z.coerce.number().default(800), // 8% = 800 basis points
  BUSINESS_TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),
  SEED_CASHIER_PASSWORD: z.string().default('cashier123'),
  SEED_KITCHEN_PASSWORD: z.string().default('kitchen123'),
  SEED_ADMIN_PASSWORD: z.string().default('admin123')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ LOI BIEN MOI TRUONG KHONG HOP LE:');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  throw new Error('Cau hinh moi truong he thong khong hop le.');
}

export const env = parsedEnv.data;
