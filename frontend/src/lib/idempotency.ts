export class IdempotencyKeyStore {
  private pending: { fingerprint: string; key: string } | null = null;

  constructor(
    private readonly createKey: () => string = () =>
      `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  ) {}

  get(fingerprint: string): string {
    if (this.pending?.fingerprint !== fingerprint) {
      this.pending = { fingerprint, key: this.createKey() };
    }
    return this.pending.key;
  }

  complete(key: string): void {
    if (this.pending?.key === key) {
      this.pending = null;
    }
  }
}
