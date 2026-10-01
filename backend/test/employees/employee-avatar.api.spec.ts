import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';
import { AuditService } from '../../src/modules/audit/audit.service';
import { prismaTest, truncateAllTables } from '../helpers/database';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'employee-avatar-tests-'));
vi.mock('../../src/lib/uploads', () => ({ getUploadsDir: () => uploadsDir }));

describe('employee avatar upload API', () => {
  let app: typeof import('../../src/app').app;
  let adminToken: string;
  let cashierToken: string;
  const uploadedFiles = new Set<string>();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sign = (user: { id: number; username: string; name: string; role: 'ADMIN' | 'CASHIER' | 'KITCHEN' }) => jwt.sign(
    { sub: String(user.id), username: user.username, name: user.name, role: user.role },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
  );
  const upload = (token: string, dataUrl: string, fileName?: string) => request(app)
    .post('/api/employees/avatar')
    .set(auth(token))
    .send({ dataUrl, fileName });
  const pngDataUrl = (bytes: number) => {
    const content = Buffer.alloc(bytes, 0x41);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(content);
    return `data:image/png;base64,${content.toString('base64')}`;
  };
  const imageDataUrl = (mime: 'jpeg' | 'webp', bytes: Buffer) => `data:image/${mime};base64,${bytes.toString('base64')}`;

  beforeAll(async () => {
    ({ app } = await import('../../src/app'));
  });

  beforeEach(async () => {
    await truncateAllTables();
    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({ data: { username: `avatar-admin-${Date.now()}`, passwordHash: 'admin-hash', name: 'Quản lý', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: `avatar-cashier-${Date.now()}`, passwordHash: 'cashier-hash', name: 'Thu ngân', role: 'CASHIER' } })
    ]);
    adminToken = sign(admin);
    cashierToken = sign(cashier);
  });

  afterEach(() => {
    for (const fileName of uploadedFiles) {
      const filePath = path.join(uploadsDir, fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    uploadedFiles.clear();
  });

  afterAll(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

  it('uploads supported employee avatar with generated file name and private audit metadata', async () => {
    const response = await upload(adminToken, pngDataUrl(68), '../../avatar.png');
    const fileName = response.body.data?.fileName;
    if (typeof fileName === 'string') uploadedFiles.add(fileName);

    expect(response.status).toBe(201);
    expect(fileName).toMatch(/^employee_avatar_[a-f0-9-]+\.png$/);
    expect(fileName).not.toContain('avatar.png');
    expect(response.body.data.avatarUrl).toBe(`/uploads/${fileName}`);
    expect(fs.readFileSync(path.join(uploadsDir, fileName))).toHaveLength(68);

    const audit = await prismaTest.auditLog.findFirst({ where: { action: 'EMPLOYEE_AVATAR_UPLOADED' } });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({ fileName, mimeType: 'image/png', fileSize: 68 });
    expect(JSON.stringify(audit?.metadata)).not.toContain('base64');
  });

  it('accepts JPEG and WebP signatures and chooses server-controlled extensions', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    const jpegResponse = await upload(adminToken, imageDataUrl('jpeg', jpeg));
    const webpResponse = await upload(adminToken, imageDataUrl('webp', webp));
    if (typeof jpegResponse.body.data?.fileName === 'string') uploadedFiles.add(jpegResponse.body.data.fileName);
    if (typeof webpResponse.body.data?.fileName === 'string') uploadedFiles.add(webpResponse.body.data.fileName);

    expect(jpegResponse.status).toBe(201);
    expect(jpegResponse.body.data.fileName).toMatch(/^employee_avatar_[a-f0-9-]+\.jpg$/);
    expect(webpResponse.status).toBe(201);
    expect(webpResponse.body.data.fileName).toMatch(/^employee_avatar_[a-f0-9-]+\.webp$/);
  });

  it('accepts exactly 2 MiB and rejects larger avatar', async () => {
    const accepted = await upload(adminToken, pngDataUrl(MAX_AVATAR_BYTES));
    if (typeof accepted.body.data?.fileName === 'string') uploadedFiles.add(accepted.body.data.fileName);
    const beforeOversize = fs.readdirSync(uploadsDir).filter((name) => name.startsWith('employee_avatar_'));

    const rejected = await upload(adminToken, pngDataUrl(MAX_AVATAR_BYTES + 1));
    const afterOversize = fs.readdirSync(uploadsDir).filter((name) => name.startsWith('employee_avatar_'));

    expect(accepted.status).toBe(201);
    expect(rejected.status).toBe(400);
    expect(afterOversize).toEqual(beforeOversize);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_AVATAR_UPLOADED' } })).toBe(1);
  });

  it('rejects mismatched or unsupported image data', async () => {
    const mismatch = await upload(adminToken, 'data:image/png;base64,QUJDREVGRw==');
    const unsupported = await upload(adminToken, 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
    const malformed = await upload(adminToken, 'data:image/png;base64,not-base64!');

    expect([mismatch.status, unsupported.status, malformed.status]).toEqual([400, 400, 400]);
    expect(fs.readdirSync(uploadsDir).filter((name) => name.startsWith('employee_avatar_'))).toEqual([]);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_AVATAR_UPLOADED' } })).toBe(0);
  });

  it('does not write a file for unauthorized or invalid upload', async () => {
    const before = fs.readdirSync(uploadsDir).filter((name) => name.startsWith('employee_avatar_'));
    const unauthorized = await request(app).post('/api/employees/avatar').send({ dataUrl: pngDataUrl(68) });
    const forbidden = await upload(cashierToken, pngDataUrl(68));
    const invalid = await upload(adminToken, 'not-an-image');
    const after = fs.readdirSync(uploadsDir).filter((name) => name.startsWith('employee_avatar_'));

    expect([unauthorized.status, forbidden.status, invalid.status]).toEqual([401, 403, 400]);
    expect(after).toEqual(before);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_AVATAR_UPLOADED' } })).toBe(0);
  });

  it('removes an uploaded avatar when its audit record cannot be written', async () => {
    const auditSpy = vi.spyOn(AuditService, 'log').mockResolvedValue(null);
    const response = await upload(adminToken, pngDataUrl(68));
    auditSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(fs.readdirSync(uploadsDir).filter(name => name.startsWith('employee_avatar_'))).toEqual([]);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_AVATAR_UPLOADED' } })).toBe(0);
  });
});
