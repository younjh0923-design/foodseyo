import type { AnalysisCacheTransactionManager } from "../../lib/database/database-port.ts";
import {
  acquireAnalysisRunOwnership,
  findAnalysisRunById,
  findProcessingAnalysisRunForIdentity,
  getOrCreateAnalysisContract,
  getOrCreateUploadedMenuEvidenceSet,
  inspectActiveAnalysisSnapshot,
  invalidateActiveAnalysisSnapshot,
  markProcessingAnalysisRunFailed,
  persistReadyAnalysisSnapshot,
  touchActiveAnalysisSnapshot,
  type SafeSnapshotInvalidationCode,
} from "../../lib/database/repositories/index.ts";
import type {
  MenuAnalysisCacheIdentityContext,
  MenuAnalysisCacheOwnership,
  MenuAnalysisExactCache,
  MenuAnalysisExactCacheClaim,
  MenuAnalysisExactCachePoll,
} from "./menu-analysis-exact-cache.ts";
import type { PreparedMenuImagesAnalysis } from "./menu-analysis-preparation.ts";

export interface DatabaseMenuAnalysisExactCacheDependencies {
  readonly getDatabase: () => AnalysisCacheTransactionManager;
  readonly createRunId?: () => string;
  readonly now?: () => Date;
}

type SnapshotRead =
  | {
      readonly state: "hit";
      readonly analysis: Extract<
        MenuAnalysisExactCacheClaim,
        { readonly state: "hit" }
      >["analysis"];
    }
  | { readonly state: "none" }
  | { readonly state: "unsafe" };

const readSnapshot = async (
  database: AnalysisCacheTransactionManager,
  identity: MenuAnalysisCacheIdentityContext,
  observedAt: Date,
): Promise<SnapshotRead> => {
  const inspection = await inspectActiveAnalysisSnapshot(
    database,
    identity,
  );
  if (inspection.state === "none") return { state: "none" };

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
      ...identity,
      invalidatedAt: observedAt,
      safeInvalidationCode: invalidation.safeInvalidationCode,
    });
    return { state: quarantined ? "none" : "unsafe" };
  }

  if (inspection.state !== "valid") return { state: "unsafe" };
  try {
    const stillActive = await touchActiveAnalysisSnapshot(database, {
      snapshotId: inspection.snapshot.id,
      ...identity,
      accessedAt: observedAt,
    });
    if (!stillActive) return { state: "unsafe" };
  } catch {
    // Access metadata is best-effort and cannot invalidate a proven hit.
  }
  return {
    state: "hit",
    analysis: inspection.snapshot.canonicalResultJson,
  };
};

const toIdentity = (
  menuEvidenceSetId: string,
  analysisContractId: string,
): MenuAnalysisCacheIdentityContext => ({
  menuEvidenceSetId,
  analysisContractId,
});

const toOwnership = (
  run: {
    readonly id: string;
    readonly menuEvidenceSetId: string;
    readonly analysisContractId: string;
    readonly leaseExpiresAt: Date | null;
  },
): MenuAnalysisCacheOwnership | null =>
  run.leaseExpiresAt
    ? {
        analysisRunId: run.id,
        menuEvidenceSetId: run.menuEvidenceSetId,
        analysisContractId: run.analysisContractId,
        leaseExpiresAt: run.leaseExpiresAt,
      }
    : null;

export function createDatabaseMenuAnalysisExactCache(
  dependencies: DatabaseMenuAnalysisExactCacheDependencies,
): MenuAnalysisExactCache {
  const createRunId =
    dependencies.createRunId ?? (() => globalThis.crypto.randomUUID());
  const now = dependencies.now ?? (() => new Date());

  return {
    async claim(
      prepared: PreparedMenuImagesAnalysis,
    ): Promise<MenuAnalysisExactCacheClaim> {
      let database: AnalysisCacheTransactionManager;
      let identity: MenuAnalysisCacheIdentityContext;
      const observedAt = now();
      try {
        database = dependencies.getDatabase();
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
        identity = toIdentity(evidence.id, contract.id);
        const snapshot = await readSnapshot(
          database,
          identity,
          observedAt,
        );
        if (snapshot.state === "hit") {
          return { state: "hit", analysis: snapshot.analysis };
        }
        if (snapshot.state === "unsafe") return { state: "bypass" };
      } catch {
        return { state: "bypass" };
      }

      const proposedRunId = createRunId();
      try {
        const acquisition = await acquireAnalysisRunOwnership(database, {
          proposedRunId,
          ...identity,
          acquiredAt: observedAt,
        });
        if (acquisition.state === "busy") {
          return { state: "busy", identity };
        }
        const ownership = toOwnership(acquisition.analysisRun);
        return ownership
          ? {
              state: "owner",
              ownership,
              recoveredExpiredLease:
                acquisition.recoveredExpiredRunId !== null,
            }
          : { state: "indeterminate" };
      } catch {
        // The transaction outcome may be ambiguous. Never fail open here.
        try {
          const proposed = await findAnalysisRunById(
            database,
            proposedRunId,
          );
          const recoveredOwnership =
            proposed?.status === "processing" &&
            proposed.menuEvidenceSetId === identity.menuEvidenceSetId &&
            proposed.analysisContractId === identity.analysisContractId &&
            proposed.leaseExpiresAt !== null &&
            proposed.leaseExpiresAt > observedAt
              ? toOwnership(proposed)
              : null;
          if (recoveredOwnership) {
            return {
              state: "owner",
              ownership: recoveredOwnership,
              recoveredExpiredLease: false,
            };
          }

          const current = await findProcessingAnalysisRunForIdentity(
            database,
            identity,
          );
          if (
            current?.leaseExpiresAt &&
            current.leaseExpiresAt > observedAt
          ) {
            return { state: "busy", identity };
          }
        } catch {
          // A failed recovery read leaves ownership indeterminate.
        }
        return { state: "indeterminate" };
      }
    },

    async poll(
      identity: MenuAnalysisCacheIdentityContext,
    ): Promise<MenuAnalysisExactCachePoll> {
      try {
        const snapshot = await readSnapshot(
          dependencies.getDatabase(),
          identity,
          now(),
        );
        if (snapshot.state === "hit") {
          return { state: "hit", analysis: snapshot.analysis };
        }
        return snapshot.state === "none"
          ? { state: "pending" }
          : { state: "indeterminate" };
      } catch {
        return { state: "indeterminate" };
      }
    },

    async persistOwned(ownership, analysis) {
      await persistReadyAnalysisSnapshot(dependencies.getDatabase(), {
        analysisRunId: ownership.analysisRunId,
        menuEvidenceSetId: ownership.menuEvidenceSetId,
        analysisContractId: ownership.analysisContractId,
        canonicalResult: analysis,
        persistedAt: now(),
      });
      return "persisted";
    },

    async failOwned(ownership, safeErrorCode) {
      try {
        const failed = await markProcessingAnalysisRunFailed(
          dependencies.getDatabase(),
          {
            id: ownership.analysisRunId,
            menuEvidenceSetId: ownership.menuEvidenceSetId,
            analysisContractId: ownership.analysisContractId,
            safeErrorCode,
            failedAt: now(),
          },
        );
        return failed.status === "failed";
      } catch {
        return false;
      }
    },
  };
}
