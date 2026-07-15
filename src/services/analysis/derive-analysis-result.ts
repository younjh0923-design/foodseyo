import type {
  AnalysisIssue,
  AnalysisStatus,
  FoodseyoAnalysisPayload,
} from "../../domain/foodseyo-analysis.ts";
import type {
  AnalysisCapability,
  AnalysisDraft,
  SemanticValidationResult,
} from "./analysis-types.ts";

const hasUsefulResult = (payload: FoodseyoAnalysisPayload): boolean =>
  payload.restaurant !== null ||
  (payload.menu !== null && payload.menu.dishes.length > 0) ||
  (payload.orderingGuidance !== null && payload.orderingGuidance.recommendations.length > 0);

export function deriveAnalysisStatus(
  draft: AnalysisDraft,
  payload: FoodseyoAnalysisPayload,
  semanticResult: SemanticValidationResult,
): AnalysisStatus {
  if (semanticResult.errors.length > 0) return "failed";
  if (!hasUsefulResult(payload)) return "failed";

  const coreCapabilityCompleted = draft.completedCapabilities.includes(draft.coreCapability);
  const coreCapabilityDegraded = draft.degradedCapabilities.includes(draft.coreCapability);
  if (!coreCapabilityCompleted || coreCapabilityDegraded) return "partial";
  if (draft.degradedCapabilities.length > 0) return "partial";

  return "complete";
}

const severityRank: Record<AnalysisIssue["severity"], number> = {
  info: 0,
  warning: 1,
  error: 2,
};

const normalizedRelatedEntityIds = (issue: AnalysisIssue): string[] =>
  [...new Set(issue.relatedEntityIds)].sort();

const issueKey = (issue: AnalysisIssue): string =>
  `${issue.code}:${normalizedRelatedEntityIds(issue).join(",")}`;

export function deduplicateAnalysisIssues(
  issues: readonly AnalysisIssue[],
): AnalysisIssue[] {
  const byKey = new Map<string, AnalysisIssue>();
  for (const issue of issues) {
    const key = issueKey(issue);
    const existing = byKey.get(key);
    const normalizedIssue: AnalysisIssue = {
      ...issue,
      relatedEntityIds: normalizedRelatedEntityIds(issue),
    };

    if (!existing) {
      byKey.set(key, normalizedIssue);
      continue;
    }

    const preferredIssue =
      severityRank[normalizedIssue.severity] > severityRank[existing.severity]
        ? normalizedIssue
        : existing;

    byKey.set(key, {
      ...preferredIssue,
      relatedEntityIds: normalizedIssue.relatedEntityIds,
      recoverable: existing.recoverable && normalizedIssue.recoverable,
    });
  }
  return [...byKey.values()];
}

const derivedIssue = (
  code: AnalysisIssue["code"],
  severity: AnalysisIssue["severity"],
  message: string,
  relatedEntityIds: readonly string[],
): AnalysisIssue => ({
  code,
  severity,
  message,
  relatedEntityIds: [...relatedEntityIds],
  recoverable: true,
});

export function deriveAnalysisIssues(
  payload: FoodseyoAnalysisPayload,
  semanticWarnings: readonly AnalysisIssue[],
  operationalIssues: readonly AnalysisIssue[],
  status: AnalysisStatus,
  degradedCapabilities: readonly AnalysisCapability[],
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [...operationalIssues, ...semanticWarnings];
  const resolution = payload.restaurantResolution;

  if (resolution.status === "unconfirmed") {
    issues.push(
      derivedIssue(
        "RESTAURANT_UNCONFIRMED",
        "info",
        "Restaurant identity was not confirmed; general guidance remains available.",
        [],
      ),
    );
  }
  if (resolution.status === "likely") {
    issues.push(
      derivedIssue(
        "RESTAURANT_MATCH_LIKELY",
        "info",
        "Restaurant identity is a likely match and requires confirmation.",
        resolution.selectedCandidateId ? [resolution.selectedCandidateId] : [],
      ),
    );
  }

  if (payload.menu) {
    if (payload.menu.freshness.status === "could_not_verify") {
      issues.push(
        derivedIssue(
          "MENU_FRESHNESS_UNVERIFIED",
          "info",
          "Menu freshness could not be verified against an official source.",
          [],
        ),
      );
    }

    for (const dish of payload.menu.dishes) {
      const related = [dish.id];
      if (dish.reviews.status === "insufficient") {
        issues.push(
          derivedIssue(
            "REVIEW_EVIDENCE_INSUFFICIENT",
            "info",
            `Review evidence is insufficient for ${dish.name}.`,
            related,
          ),
        );
      }
      if (dish.image.sourceType === "unavailable") {
        issues.push(
          derivedIssue("IMAGE_UNAVAILABLE", "info", `Image is unavailable for ${dish.name}.`, related),
        );
      }
      if (
        dish.image.rightsStatus === "session_only" ||
        dish.image.rightsStatus === "not_reusable"
      ) {
        issues.push(
          derivedIssue(
            "IMAGE_NOT_REUSABLE",
            "warning",
            `Image for ${dish.name} is evidence-only and cannot be reused publicly.`,
            related,
          ),
        );
      }
      if (dish.dietary.items.some((item) => item.status === "confirm_with_staff")) {
        issues.push(
          derivedIssue(
            "DIETARY_CONFIRM_WITH_STAFF",
            "warning",
            `Confirm dietary details for ${dish.name} with restaurant staff.`,
            related,
          ),
        );
      }
      if (dish.price === null) {
        issues.push(
          derivedIssue("PRICE_UNKNOWN", "info", `Price is unknown for ${dish.name}.`, related),
        );
      }
    }
  }

  if (degradedCapabilities.includes("external_research")) {
    issues.push(
      derivedIssue(
        "EXTERNAL_RESEARCH_FAILED",
        "warning",
        "External research was unavailable; the result uses only available input evidence.",
        [],
      ),
    );
  }

  if (status === "partial") {
    issues.push(
      derivedIssue(
        "ANALYSIS_PARTIAL",
        "warning",
        "The analysis is useful but one or more core capabilities were incomplete.",
        [],
      ),
    );
  }

  return deduplicateAnalysisIssues(issues);
}
