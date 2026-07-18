import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import {
  Pool,
  type PoolClient,
  type QueryConfig,
  type QueryResult,
  type QueryResultRow,
} from "pg";

import type {
  AnalysisCacheQueryExecutor,
  AnalysisCacheTransactionManager,
} from "./database-port.ts";
import { createAnalysisCachePoolConfig } from "./runtime-config.ts";

class PoolClientExecutor implements AnalysisCacheQueryExecutor {
  private readonly client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    return this.client.query<Row>(config);
  }
}

class PooledAnalysisCacheRuntime
  implements AnalysisCacheTransactionManager
{
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(config);
  }

  async withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PoolClientExecutor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original safe application error.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

let runtimeDatabase: AnalysisCacheTransactionManager | null = null;

export function getAnalysisCacheRuntimeDatabase(): AnalysisCacheTransactionManager {
  if (runtimeDatabase) return runtimeDatabase;

  const pool = new Pool(createAnalysisCachePoolConfig(process.env));
  attachDatabasePool(pool);
  pool.on("error", () => {
    console.error("[foodseyo-analysis-cache] pool_error");
  });
  runtimeDatabase = new PooledAnalysisCacheRuntime(pool);
  return runtimeDatabase;
}
