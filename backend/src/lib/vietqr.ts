import { env } from '../config/env';

export function getVietQrConfig() {
  const bankId = env.DEPOSIT_VIETQR_BANK_ID;
  const accountNumber = env.DEPOSIT_BANK_ACCOUNT;
  const accountName = env.DEPOSIT_ACCOUNT_NAME;
  if (!bankId || !accountNumber || !accountName) return null;
  return { bankId, accountNumber, accountName };
}

export function getVietQrInstructions(amount: number, transferContent: string) {
  const config = getVietQrConfig();
  if (!config) return null;

  const query = new URLSearchParams({ amount: String(amount), addInfo: transferContent, accountName: config.accountName });
  return {
    ...config,
    qrUrl: `https://img.vietqr.io/image/${encodeURIComponent(config.bankId)}-${encodeURIComponent(config.accountNumber)}-compact2.png?${query.toString()}`
  };
}
