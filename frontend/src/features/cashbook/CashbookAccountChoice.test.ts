import { describe, expect, it } from 'vitest';
import { isCashbookAccountSelectionSatisfied } from './cashbookAccountRequirement';

describe('source account requirement', () => {
  it('allows legacy flow before activation and default cash account resolution', () => {
    expect(isCashbookAccountSelectionSatisfied(false, 'BANK_TRANSFER', null)).toBe(true);
    expect(isCashbookAccountSelectionSatisfied(true, 'CASH', null)).toBe(true);
  });
  it('requires explicit compatible account for bank and wallet postings', () => {
    expect(isCashbookAccountSelectionSatisfied(true, 'BANK_TRANSFER', null)).toBe(false);
    expect(isCashbookAccountSelectionSatisfied(true, 'E_WALLET', 3)).toBe(true);
  });
});
