import "server-only";

import type { AnalysisCacheTransactionManager } from "../../lib/database/database-port.ts";
import { getAnalysisCacheRuntimeDatabase } from "../../lib/database/runtime.ts";
import {
  createDatabaseMenuAnalysisExactCache,
  type DatabaseMenuAnalysisExactCacheDependencies,
} from "./database-menu-analysis-exact-cache.ts";
import type { MenuAnalysisExactCache } from "./menu-analysis-exact-cache.ts";

export interface RuntimeMenuAnalysisExactCacheDependencies
  extends Omit<
    DatabaseMenuAnalysisExactCacheDependencies,
    "getDatabase"
  > {
  readonly getDatabase?: () => AnalysisCacheTransactionManager;
}

export function createRuntimeMenuAnalysisExactCache(
  dependencies: RuntimeMenuAnalysisExactCacheDependencies = {},
): MenuAnalysisExactCache {
  return createDatabaseMenuAnalysisExactCache({
    ...dependencies,
    getDatabase:
      dependencies.getDatabase ?? getAnalysisCacheRuntimeDatabase,
  });
}
