import type { PoolConfig } from "pg";

export const ANALYSIS_CACHE_POOL_MAX_CONNECTIONS = 5 as const;
export const ANALYSIS_CACHE_POOL_CONNECTION_TIMEOUT_MS = 5_000 as const;
export const ANALYSIS_CACHE_POOL_IDLE_TIMEOUT_MS = 5_000 as const;

export class AnalysisCacheRuntimeConfigurationError extends Error {
  readonly code = "DATABASE_RUNTIME_CONFIGURATION_INVALID" as const;

  constructor() {
    super("The pooled analysis-cache runtime database configuration is invalid.");
    this.name = "AnalysisCacheRuntimeConfigurationError";
  }
}

const parseRuntimeDatabaseUrl = (value: string | undefined): string => {
  if (!value) throw new AnalysisCacheRuntimeConfigurationError();

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AnalysisCacheRuntimeConfigurationError();
  }

  const protocolIsPostgres =
    parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  const endpointLabel = parsed.hostname.toLowerCase().split(".")[0] ?? "";
  const sslMode = parsed.searchParams.get("sslmode");
  const channelBinding = parsed.searchParams.get("channel_binding");

  if (
    !protocolIsPostgres ||
    parsed.username !== "foodseyo_runtime" ||
    !parsed.password ||
    !parsed.hostname ||
    !endpointLabel.endsWith("-pooler") ||
    parsed.pathname.length <= 1 ||
    (sslMode !== "require" && sslMode !== "verify-full") ||
    channelBinding !== "require"
  ) {
    throw new AnalysisCacheRuntimeConfigurationError();
  }

  return value;
};

export function createAnalysisCachePoolConfig(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<PoolConfig> {
  return Object.freeze({
    connectionString: parseRuntimeDatabaseUrl(environment.DATABASE_URL),
    max: ANALYSIS_CACHE_POOL_MAX_CONNECTIONS,
    min: 0,
    connectionTimeoutMillis: ANALYSIS_CACHE_POOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: ANALYSIS_CACHE_POOL_IDLE_TIMEOUT_MS,
    allowExitOnIdle: true,
    keepAlive: true,
    application_name: "foodseyo-analysis-cache-runtime",
  });
}
