import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export * from './generated/prisma/enums';
export * from './default-access';

export class DatabaseClient extends PrismaClient {
  constructor(databaseUrl: string) {
    super({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
      }),
    });
  }
}
