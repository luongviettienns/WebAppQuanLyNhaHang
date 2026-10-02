import type { SalesReturnCreateInput } from './contracts';

const storagePrefix = 'crispy-bite:sales-return-pending:v1:';
const memoryKeys = new Map<string, string>();

function canonicalPayload(input: SalesReturnCreateInput): string {
  return JSON.stringify({
    orderId: input.orderId,
    lines: [...input.lines].sort((a, b) => a.orderItemId - b.orderItemId),
    refundMethod: input.refundMethod ?? 'CASH',
    financialAccountId: input.financialAccountId ?? null,
    refundedAmount: input.refundedAmount ?? null,
    note: input.note?.trim() || null
  });
}

async function fingerprint(input: SalesReturnCreateInput): Promise<{ value: string; persistent: boolean }> {
  const payload = canonicalPayload(input);
  if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return { value: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''), persistent: true };
  }
  return { value: payload, persistent: false };
}

function getStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sales-return-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getSalesReturnIdempotencyKey(input: SalesReturnCreateInput): Promise<string> {
  const { value: digest, persistent } = await fingerprint(input);
  const pending = memoryKeys.get(digest);
  if (pending) return pending;
  const storage = getStorage();
  const storageKey = storage && persistent ? storagePrefix + digest : '';
  try {
    const persisted = storageKey ? storage?.getItem(storageKey) : null;
    if (persisted) { memoryKeys.set(digest, persisted); return persisted; }
  } catch { /* Keep retry protection in memory when browser storage is unavailable. */ }
  const key = newKey();
  memoryKeys.set(digest, key);
  try { if (storageKey) storage?.setItem(storageKey, key); } catch { /* Private browsing may deny localStorage writes. */ }
  return key;
}

export async function clearSalesReturnIdempotencyKey(input: SalesReturnCreateInput): Promise<void> {
  const { value: digest, persistent } = await fingerprint(input);
  memoryKeys.delete(digest);
  const storage = getStorage();
  try { if (storage && persistent) storage.removeItem(storagePrefix + digest); } catch { /* Safe to retry in this page session. */ }
}
