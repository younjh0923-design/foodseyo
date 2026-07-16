import type { FoodseyoAnalysis } from "../domain/foodseyo-analysis.ts";

export const CLIENT_MENU_ANALYSIS_WATCHDOG_MS = 105_000;
export const MENU_ANALYSIS_TIMEOUT_MESSAGE =
  "The menu analysis took too long. Try again with fewer or clearer images.";
export const MENU_ANALYSIS_STORAGE_WARNING =
  "Menu analysis succeeded, but this browser could not keep the result for the next screen.";

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
  | "response";

export type MenuAnalysisUiState =
  | { readonly phase: "idle" }
  | { readonly phase: "preparing"; readonly attemptId: number }
  | {
      readonly phase: "requesting";
      readonly attemptId: number;
      readonly startedAt: number;
    }
  | {
      readonly phase: "success";
      readonly attemptId: number;
      readonly summary: AnalysisSuccessSummary;
      readonly storageWarning: string | null;
    }
  | {
      readonly phase: "error";
      readonly attemptId: number | null;
      readonly message: string;
      readonly errorKind: MenuAnalysisUiErrorKind;
    };

export type MenuAnalysisUiEvent =
  | { readonly type: "ATTEMPT_STARTED"; readonly attemptId: number }
  | {
      readonly type: "REQUEST_STARTED";
      readonly attemptId: number;
      readonly startedAt: number;
    }
  | {
      readonly type: "SUCCEEDED";
      readonly attemptId: number;
      readonly summary: AnalysisSuccessSummary;
    }
  | {
      readonly type: "STORAGE_WARNING";
      readonly attemptId: number;
      readonly message: string;
    }
  | {
      readonly type: "FAILED";
      readonly attemptId: number;
      readonly message: string;
      readonly errorKind: MenuAnalysisUiErrorKind;
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
    case "SUCCEEDED":
      return state.phase === "requesting" && state.attemptId === event.attemptId
        ? {
            phase: "success",
            attemptId: event.attemptId,
            summary: event.summary,
            storageWarning: null,
          }
        : state;
    case "STORAGE_WARNING":
      return state.phase === "success" && state.attemptId === event.attemptId
        ? { ...state, storageWarning: event.message }
        : state;
    case "FAILED":
      return isActiveAttempt(state, event.attemptId)
        ? {
            phase: "error",
            attemptId: event.attemptId,
            message: event.message,
            errorKind: event.errorKind,
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
      };
    case "IMAGES_CHANGED":
      return INITIAL_MENU_ANALYSIS_UI_STATE;
    case "FINALIZED":
      return state;
  }
}

export const isMenuAnalysisActive = (state: MenuAnalysisUiState): boolean =>
  state.phase === "preparing" || state.phase === "requesting";

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
