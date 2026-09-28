import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('VietQR transfer instructions', () => {
  it('creates an amount-bound QR URL with the exact transfer content', async () => {
    vi.stubEnv('DEPOSIT_VIETQR_BANK_ID', 'vietcombank');
    vi.stubEnv('DEPOSIT_BANK_ACCOUNT', '0123456789');
    vi.stubEnv('DEPOSIT_ACCOUNT_NAME', 'CRISPY BITE');
    const { getVietQrInstructions } = await import('../src/lib/vietqr');

    const instructions = getVietQrInstructions(300000, 'COC BK202609290001');

    expect(instructions).toMatchObject({ bankId: 'vietcombank', accountNumber: '0123456789', accountName: 'CRISPY BITE' });
    const qr = new URL(instructions!.qrUrl);
    expect(qr.origin + qr.pathname).toBe('https://img.vietqr.io/image/vietcombank-0123456789-compact2.png');
    expect(qr.searchParams.get('amount')).toBe('300000');
    expect(qr.searchParams.get('addInfo')).toBe('COC BK202609290001');
  });

  it('does not fabricate bank details when payment receiving configuration is incomplete', async () => {
    vi.stubEnv('DEPOSIT_VIETQR_BANK_ID', 'vietcombank');
    vi.stubEnv('DEPOSIT_BANK_ACCOUNT', '');
    vi.stubEnv('DEPOSIT_ACCOUNT_NAME', '');
    const { getVietQrInstructions } = await import('../src/lib/vietqr');
    expect(getVietQrInstructions(300000, 'COC BK202609290001')).toBeNull();
  });
});
