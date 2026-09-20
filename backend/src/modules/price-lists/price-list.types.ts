import { Prisma, PriceListScopeType } from '@prisma/client';

export type PriceDataClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

export interface PriceResolveContext {
  priceListId?: number;
  scopeType?: PriceListScopeType;
  scopeKey?: string;
  at?: Date;
}

export interface ResolvedPrice {
  menuItemId: number;
  salePrice: number;
  priceListId: number | null;
  version: number | null;
  source: 'PRICE_LIST' | 'BASE_PRICE';
}
