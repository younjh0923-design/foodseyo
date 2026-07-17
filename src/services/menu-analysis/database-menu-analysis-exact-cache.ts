import type { AnalysisCacheTransactionManager } from "../../lib/database/database-port.ts";
import {
  getOrCreateAnalysisContract,
  getOrCreateUploadedMenuEvidenceSet,
  inspectActiveAnalysisSnapshot,
  invalidateActiveAnalysisSnapshot,
  persistUncachedReadyAnalysisSnapshot,
  touchActiveAnalysisSnapshot,
  type SafeSnapshotInvalidationCode,
} from "../../lib/database/repositories/index.ts";
import type {
  MenuAnalysisCacheWriteContext,
  MenuAnalysisExactCache,
  MenuAnalysisExactCacheLookup,
} from "./menu-analysis-exact-cache.ts";
import type { PreparedMenuImagesAnalysis } from "./menu-analysis-preparation.ts";

export interface DatabaseMenuAnalysisExactCacheDependencies {
  readonly getDatabase: () => AnalysisCacheTransactionManager;
  readonly createRunId?: () => string;
  readonly now?: () => Date;
}

const toWriteContext = (
  menuEvidenceSetId: string,
  analysisContractId: string,
): MenuAnalysisCacheWriteContext => ({
  menuEvidenceSetId,
  analysisContractId,
});

export function createDatabaseMenuAnalysisExactCache(
  dependencies: DatabaseMenuAnalysisExactCacheDependencies,
): MenuAnalysisExactCache {
  const createRunId =
    dependencies.createRunId ?? (() => globalThis.crypto.randomUUID());
  const now = dependencies.now ?? (() => new Date());

  return {
    async lookup(
      prepared: PreparedMenuImagesAnalysis,
    ): Promise<MenuAnalysisExactCacheLookup> {
      const database = dependencies.getDatabase();
      const observedAt = now();
      const [contract, evidence] = await Promise.all([
        getOrCreateAnalysisContract(
          database,
          prepared.cacheIdentity.analysisContract,
        ),
        getOrCreateUploadedMenuEvidenceSet(database, {
          sourceFingerprint: prepared.cacheIdentity.sourceFingerprint,
          fingerprintVersion:
            prepared.cacheIdentity.sourceFingerprintVersion,
          imageCount: prepared.imageCount,
          observedAt,
        }),
      ]);
      const writeContext = toWriteContext(evidence.id, contract.id);
      const inspection = await inspectActiveAnalysisSnapshot(
        database,
        writeContext,
      );
      if (inspection.state === "none") {
        return { state: "miss", writeContext };
      }

      let invalidation:
        | {
            readonly snapshotId: string;
            readonly safeInvalidationCode: SafeSnapshotInvalidationCode;
          }
        | undefined;
      if (inspection.state === "invalid") {
        invalidation = {
          snapshotId: inspection.snapshotId,
          safeInvalidationCode: inspection.safeInvalidationCode,
        };
      } else if (
        inspection.snapshot.expiresAt !== null &&
        inspection.snapshot.expiresAt <= observedAt
      ) {
        invalidation = {
          snapshotId: inspection.snapshot.id,
          safeInvalidationCode: "SNAPSHOT_EXPIRED",
        };
      }

      if (invalidation) {
        const quarantined = await invalidateActiveAnalysisSnapshot(database, {
          snapshotId: invalidation.snapshotId,
          ...writeContext,
          invalidatedAt: observedAt,
          safeInvalidationCode: invalidation.safeInvalidationCode,
        });
        return quarantined
          ? { state: "miss", writeContext }
          : { state: "bypass" };
      }

      if (inspection.state !== "valid") return { state: "bypass" };
      try {
        const stillActive = await touchActiveAnalysisSnapshot(database, {
          snapshotId: inspection.snapshot.id,
          ...writeContext,
          accessedAt: observedAt,
        });
        if (!stillActive) return { state: "bypass" };
      } catch {
        // Access metadata is best-effort and cannot invalidate a proven hit.
      }
      return {
        state: "hit",
        analysis: inspection.snapshot.canonicalResultJson,
      };
    },

    async persist(writeContext, analysis) {
      const result = await persistUncachedReadyAnalysisSnapshot(
        dependencies.getDatabase(),
        {
          analysisRunId: createRunId(),
          ...writeContext,
          canonicalResult: analysis,
          persistedAt: now(),
        },
      );
      return result.state;
    },
  };
}
