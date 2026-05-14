import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema";
import type { Database } from "./query-helpers";

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;
  readonly client: Database;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined || connectionString.trim().length === 0) {
      throw new Error("DATABASE_URL is required");
    }

    this.pool = new Pool({ connectionString });
    this.client = drizzle(this.pool, { schema });
  }

  async onModuleInit(): Promise<void> {
    const connection = await this.pool.connect();
    connection.release();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
