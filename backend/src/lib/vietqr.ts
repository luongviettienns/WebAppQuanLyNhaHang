import { env } from '../config/env';

export function getVietQrInstructions(amount: number, transferContent: string) {
  const bankId = env.DEPOSIT_VIETQR_BANK_ID;
  const accountNumber = env.DEPOSIT_BANK_ACCOUNT;
  const accountName = env.DEPOSIT_ACCOUNT_NAME;
  if (!bankId || !accountNumber || !accountName) return null;

  const query = new URLSearchParams({ amount: String(amount), addInfo: transferContent, accountName });
  return {
    bankId,
    accountNumber,
    accountName,
    qrUrl: `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNumber)}-compact2.png?${query.toString()}`
  };
}
