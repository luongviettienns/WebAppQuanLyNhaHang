import { IdempotencyKeyStore } from '../../lib/idempotency';

export class ManualVoucherIdempotency {
  private readonly store: IdempotencyKeyStore;

  constructor(createKey?: () => string) {
    this.store = new IdempotencyKeyStore(createKey);
  }

  get(input: unknown): string {
    return this.store.get(JSON.stringify(input));
  }

  complete(key: string): void {
    this.store.complete(key);
  }
}
