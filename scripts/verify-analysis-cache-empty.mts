import assert from "node:assert/strict";

import { Pool, type PoolClient } from "pg";

import { createAnalysisCachePoolConfig } from "../src/lib/database/runtime-config.ts";

if (
  process.env.FOODSEYO_C2_1_F_PERMANENT_DEVELOPMENT_READ_ONLY !== "1"
) {
  throw new Error(
    "The permanent Development check must be explicitly read-only.",
  );
}

const pool = new Pool(createAnalysisCachePoolConfig(process.env));
let client: PoolClient | undefined;

try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  const result = await client.query<{
    currentUser: string;
    contractCount: number;
    evidenceCount: number;
    runCount: number;
    snapshotCount: number;
  }>({
    name: "foodseyo-c2-1-f-permanent-development-empty",
    text: `
      SELECT
        current_user AS "currentUser",
        (SELECT count(*)::integer FROM public.analysis_contracts)
          AS "contractCount",
        (SELECT count(*)::integer FROM public.menu_evidence_sets)
          AS "evidenceCount",
        (SELECT count(*)::integer FROM public.analysis_runs)
          AS "runCount",
        (SELECT count(*)::integer FROM public.analysis_snapshots)
          AS "snapshotCount"
    `,
  });
  const stream = (
    client as unknown as {
      readonly connection?: {
        readonly stream?: { readonly encrypted?: boolean };
      };
    }
  ).connection?.stream;
  assert.deepEqual(result.rows[0], {
    currentUser: "foodseyo_runtime",
    contractCount: 0,
    evidenceCount: 0,
    runCount: 0,
    snapshotCount: 0,
  });
  assert.equal(stream?.encrypted, true);
  await client.query("ROLLBACK");
  console.log(
    JSON.stringify({
      target: "permanent Development branch",
      mode: "read-only transaction",
      currentUser: "foodseyo_runtime",
      connection: "pooled TLS",
      applicationRowCount: 0,
    }),
  );
} catch (error) {
  if (client) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original validation failure.
    }
  }
  const code =
    error instanceof Error && "code" in error
      ? String((error as Error & { code?: unknown }).code ?? "unknown")
      : "unknown";
  console.error(
    `Permanent Development read-only verification failed (code=${code}).`,
  );
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
