import type { FoodseyoAnalysis } from "../domain/foodseyo-analysis.ts";

export const CLIENT_MENU_ANALYSIS_WATCHDOG_MS = 105_000;
export const MENU_ANALYSIS_TIMEOUT_MESSAGE =
  "The menu analysis took too long. Try again with fewer or clearer images.";
export const MENU_ANALYSIS_STORAGE_WARNING =
  "This browser could not keep the result for the next screen.";
export const MENU_ANALYSIS_NAVIGATION_WARNING =
  "We couldn't open the results automatically.";
export const MENU_ANALYSIS_LOADING_LABEL = "Reading your menu…";
export const MENU_ANALYSIS_LOADING_HELPER =
  "This can take up to a minute for detailed menus.";
export const MENU_ANALYSIS_RESULTS_PATH = "/analysis";
export const MENU_ANALYSIS_NAVIGATION_FALLBACK_MS = 1_500;

export interface AnalysisSuccessSummary {
  readonly status: "complete" | "partial";
  readonly restaurantLabel: string;
  readonly dishCount: number;
}

export type MenuAnalysisUiErrorKind =
  | "input"
  | "network"
  | "timeout"
  | "api"
  | "response_body"
  | "response_json"
  | "response_schema"
  | "response_mismatch"
  | "failed_analysis"
  | "empty_menu"
  | "semantic_validation";

export type MenuAnalysisUiState =
  | { readonly phase: "idle" }
  | { readonly phase: "preparing"; readonly attemptId: number }
  | {
      readonly phase: "requesting";
      readonly attemptId: number;
      readonly startedAt: number;
    }
  | {
      readonly phase: "navigating";
      readonly attemptId: number;
      readonly summary: AnalysisSuccessSummary;
    }
  | {
      readonly phase: "success";
      readonly attemptId: number;
      readonly summary: AnalysisSuccessSummary;
      readonly fallback: "storage" | "navigation";
      readonly message: string;
    }
  | {
      readonly phase: "error";
      readonly attemptId: number | null;
      readonly message: string;
      readonly errorKind: MenuAnalysisUiErrorKind;
      readonly referenceCode: string | null;
    };

export type MenuAnalysisUiEvent =
  | { readonly type: "ATTEMPT_STARTED"; readonly attemptId: number }
  | {
      readonly type: "REQUEST_STARTED";
      readonly attemptId: number;
      readonly startedAt: number;
    }
  | {
      readonly type: "PERSISTED";
      readonly attemptId: number;
      readonly summary: AnalysisSuccessSummary;
    }
  | {
      readonly type: "STORAGE_FAILED";
      readonly attemptId: number;
      readonly summary: AnalysisSuccessSummary;
    }
  | {
      readonly type: "NAVIGATION_FAILED";
      readonly attemptId: number;
    }
  | {
      readonly type: "FAILED";
      readonly attemptId: number;
      readonly message: string;
      readonly errorKind: MenuAnalysisUiErrorKind;
      readonly referenceCode?: string | null;
    }
  | { readonly type: "ABORTED"; readonly attemptId: number }
  | { readonly type: "INPUT_REJECTED"; readonly message: string }
  | { readonly type: "IMAGES_CHANGED" }
  | { readonly type: "FINALIZED"; readonly attemptId: number };

export const INITIAL_MENU_ANALYSIS_UI_STATE: MenuAnalysisUiState = {
  phase: "idle",
};

const isActiveAttempt = (
  state: MenuAnalysisUiState,
  attemptId: number,
): state is Extract<MenuAnalysisUiState, { phase: "preparing" | "requesting" }> =>
  (state.phase === "preparing" || state.phase === "requesting") &&
  state.attemptId === attemptId;

export function menuAnalysisUiReducer(
  state: MenuAnalysisUiState,
  event: MenuAnalysisUiEvent,
): MenuAnalysisUiState {
  switch (event.type) {
    case "ATTEMPT_STARTED":
      return { phase: "preparing", attemptId: event.attemptId };
    case "REQUEST_STARTED":
      return state.phase === "preparing" && state.attemptId === event.attemptId
        ? {
            phase: "requesting",
            attemptId: event.attemptId,
            startedAt: event.startedAt,
          }
        : state;
    case "PERSISTED":
      return state.phase === "requesting" && state.attemptId === event.attemptId
        ? {
            phase: "navigating",
            attemptId: event.attemptId,
            summary: event.summary,
          }
        : state;
    case "STORAGE_FAILED":
      return state.phase === "requesting" && state.attemptId === event.attemptId
        ? {
            phase: "success",
            attemptId: event.attemptId,
            summary: event.summary,
            fallback: "storage",
            message: MENU_ANALYSIS_STORAGE_WARNING,
          }
        : state;
    case "NAVIGATION_FAILED":
      return state.phase === "navigating" && state.attemptId === event.attemptId
        ? {
            phase: "success",
            attemptId: event.attemptId,
            summary: state.summary,
            fallback: "navigation",
            message: MENU_ANALYSIS_NAVIGATION_WARNING,
          }
        : state;
    case "FAILED":
      return isActiveAttempt(state, event.attemptId)
        ? {
            phase: "error",
            attemptId: event.attemptId,
            message: event.message,
            errorKind: event.errorKind,
            referenceCode: event.referenceCode ?? null,
          }
        : state;
    case "ABORTED":
      return isActiveAttempt(state, event.attemptId)
        ? INITIAL_MENU_ANALYSIS_UI_STATE
        : state;
    case "INPUT_REJECTED":
      return {
        phase: "error",
        attemptId: null,
        message: event.message,
        errorKind: "input",
        referenceCode: null,
      };
    case "IMAGES_CHANGED":
      return INITIAL_MENU_ANALYSIS_UI_STATE;
    case "FINALIZED":
      return state;
  }
}

export const isMenuAnalysisActive = (state: MenuAnalysisUiState): boolean =>
  state.phase === "preparing" ||
  state.phase === "requesting" ||
  state.phase === "navigating";

export function createMenuAnalysisSuccessSummary(
  analysis: FoodseyoAnalysis,
): AnalysisSuccessSummary {
  const resolution = analysis.payload.restaurantResolution;
  const selectedCandidate = resolution.selectedCandidateId
    ? resolution.candidates.find(
        (candidate) => candidate.id === resolution.selectedCandidateId,
      )
    : null;
  const restaurantLabel =
    resolution.status === "confirmed" || resolution.status === "likely"
      ? analysis.payload.restaurant?.name ??
        selectedCandidate?.name ??
        resolution.candidates[0]?.name ??
        "Restaurant not confirmed"
      : "Restaurant not confirmed";

  return {
    status: analysis.status === "complete" ? "complete" : "partial",
    restaurantLabel,
    dishCount: analysis.payload.menu?.dishes.length ?? 0,
  };
}

export interface MenuAnalysisAttemptGate {
  begin(): number | null;
  isCurrent(attemptId: number): boolean;
  release(attemptId: number): boolean;
  current(): number | null;
}

export function createMenuAnalysisAttemptGate(): MenuAnalysisAttemptGate {
  let currentAttemptId: number | null = null;
  let nextAttemptId = 0;

  return {
    begin() {
      if (currentAttemptId !== null) return null;
      nextAttemptId += 1;
      currentAttemptId = nextAttemptId;
      return currentAttemptId;
    },
    isCurrent(attemptId) {
      return currentAttemptId === attemptId;
    },
    release(attemptId) {
      if (currentAttemptId !== attemptId) return false;
      currentAttemptId = null;
      return true;
    },
    current() {
      return currentAttemptId;
    },
  };
}

export type MenuAnalysisWatchdogScheduler = (
  callback: () => void,
  delayMs: number,
) => () => void;

const browserWatchdogScheduler: MenuAnalysisWatchdogScheduler = (
  callback,
  delayMs,
) => {
  const timeoutId = setTimeout(callback, delayMs);
  return () => clearTimeout(timeoutId);
};

export function startMenuAnalysisWatchdog(
  onTimeout: () => void,
  scheduler: MenuAnalysisWatchdogScheduler = browserWatchdogScheduler,
): () => void {
  let active = true;
  const cancelScheduled = scheduler(() => {
    if (!active) return;
    active = false;
    onTimeout();
  }, CLIENT_MENU_ANALYSIS_WATCHDOG_MS);

  return () => {
    if (!active) return;
    active = false;
    cancelScheduled();
  };
}
