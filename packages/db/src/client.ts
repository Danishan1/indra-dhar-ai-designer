import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

/** Creates a Prisma client using the pg driver adapter (Prisma 7). One per process. */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Transaction client type (argument of `prisma.$transaction(async (tx) => …)`). */
export type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
/** Either the root client or a transaction client. */
export type DbClient = PrismaClient | TxClient;
