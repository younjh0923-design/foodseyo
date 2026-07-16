import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { FoodseyoAnalysis } from "../src/domain/foodseyo-analysis.ts";
import { demoFoodseyoAnalysis } from "../src/data/demoFoodseyoAnalysis.ts";
import {
  MENU_ANALYSIS_FAILED_STATUS_MESSAGE,
  MENU_ANALYSIS_RESPONSE_JSON_MESSAGE,
  MENU_ANALYSIS_RESPONSE_SCHEMA_MESSAGE,
  getSafeMenuAnalysisFailure,
  parseMenuAnalysisResponse,
} from "../src/lib/menu-analysis-client.ts";
import { MenuImagePreprocessingError } from "../src/lib/menu-image-preprocessing.ts";
import {
  CLIENT_MENU_ANALYSIS_WATCHDOG_MS,
  INITIAL_MENU_ANALYSIS_UI_STATE,
  MENU_ANALYSIS_LOADING_HELPER,
  MENU_ANALYSIS_LOADING_LABEL,
  MENU_ANALYSIS_NAVIGATION_WARNING,
  MENU_ANALYSIS_RESULTS_PATH,
  MENU_ANALYSIS_STORAGE_WARNING,
  MENU_ANALYSIS_TIMEOUT_MESSAGE,
  createMenuAnalysisAttemptGate,
  createMenuAnalysisSuccessSummary,
  isMenuAnalysisActive,
  menuAnalysisUiReducer,
  startMenuAnalysisWatchdog,
  type AnalysisSuccessSummary,
  type MenuAnalysisUiState,
  type MenuAnalysisWatchdogScheduler,
} from "../src/lib/menu-analysis-ui-state.ts";
import {
  CURRENT_ANALYSIS_STORAGE_KEY,
  tryWriteCurrentAnalysis,
} from "../src/lib/storage.ts";
import { MAX_MENU_IMAGE_COUNT } from "../src/services/menu-analysis/menu-image-limits.ts";
import {
  captureError,
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo menu analysis completion validation",
  "Menu analysis completion validation failed",
);

const summary: AnalysisSuccessSummary = {
  status: "complete",
  restaurantLabel: "Confirmed restaurant",
  dishCount: 2,
};
const requesting = (attemptId: number): MenuAnalysisUiState => ({
  phase: "requesting",
  attemptId,
  startedAt: 1_000,
});

// A. Explicit state model and persistence.
verify(INITIAL_MENU_ANALYSIS_UI_STATE.phase === "idle", "initial phase is idle");
const preparing = menuAnalysisUiReducer(INITIAL_MENU_ANALYSIS_UI_STATE, {
  type: "ATTEMPT_STARTED",
  attemptId: 1,
});
verify(preparing.phase === "preparing", "idle transitions to preparing");
verify(isMenuAnalysisActive(preparing), "preparing derives loading true");
const activeRequest = menuAnalysisUiReducer(preparing, {
  type: "REQUEST_STARTED",
  attemptId: 1,
  startedAt: 1_000,
});
verify(activeRequest.phase === "requesting", "preparing transitions to requesting");
verify(
  activeRequest.phase === "requesting" && activeRequest.startedAt === 1_000,
  "requesting records its start time",
);
verify(isMenuAnalysisActive(activeRequest), "requesting derives loading true");
const navigating = menuAnalysisUiReducer(activeRequest, {
  type: "PERSISTED",
  attemptId: 1,
  summary,
});
verify(navigating.phase === "navigating", "persisted result transitions to navigating");
verify(isMenuAnalysisActive(navigating), "navigating derives loading true");
verify(
  menuAnalysisUiReducer(navigating, { type: "FINALIZED", attemptId: 1 }) ===
    navigating,
  "generic finalization does not reset navigating",
);
const successWithWarning = menuAnalysisUiReducer(requesting(2), {
  type: "STORAGE_FAILED",
  summary,
  attemptId: 2,
});
verify(
  successWithWarning.phase === "success" &&
    successWithWarning.fallback === "storage" &&
    successWithWarning.message === MENU_ANALYSIS_STORAGE_WARNING,
  "storage failure remains completion with the exact fallback message",
);
const navigationWarning = menuAnalysisUiReducer(navigating, {
  type: "NAVIGATION_FAILED",
  attemptId: 1,
});
verify(
  navigationWarning.phase === "success" &&
    navigationWarning.fallback === "navigation" &&
    navigationWarning.message === MENU_ANALYSIS_NAVIGATION_WARNING,
  "navigation failure retains the manual result fallback",
);
verify(
  menuAnalysisUiReducer(successWithWarning, { type: "IMAGES_CHANGED" }).phase ===
    "idle",
  "image mutation clears stale success",
);
const apiError = menuAnalysisUiReducer(requesting(2), {
  type: "FAILED",
  attemptId: 2,
  message: "Safe API error.",
  errorKind: "api",
});
verify(apiError.phase === "error", "requesting transitions to error");
verify(!isMenuAnalysisActive(apiError), "error derives loading false");
verify(
  menuAnalysisUiReducer(apiError, { type: "FINALIZED", attemptId: 2 }) === apiError,
  "generic finalization does not reset error",
);
const timeoutError = menuAnalysisUiReducer(requesting(3), {
  type: "FAILED",
  attemptId: 3,
  message: MENU_ANALYSIS_TIMEOUT_MESSAGE,
  errorKind: "timeout",
});
verify(
  timeoutError.phase === "error" && timeoutError.errorKind === "timeout",
  "requesting transitions to a typed timeout error",
);
verify(
  menuAnalysisUiReducer(requesting(4), { type: "ABORTED", attemptId: 4 }).phase ===
    "idle",
  "manual abort returns to idle without an error",
);
const inputError = menuAnalysisUiReducer(INITIAL_MENU_ANALYSIS_UI_STATE, {
  type: "INPUT_REJECTED",
  message: "Safe input error.",
});
verify(
  inputError.phase === "error" && inputError.errorKind === "input",
  "input rejection is a typed visible error",
);
verify(
  menuAnalysisUiReducer(inputError, { type: "ATTEMPT_STARTED", attemptId: 5 })
    .phase === "preparing",
  "a new attempt clears the previous error",
);
verify(
  menuAnalysisUiReducer(successWithWarning, { type: "ATTEMPT_STARTED", attemptId: 6 })
    .phase === "preparing",
  "a new attempt clears the previous success",
);
const latestRequest = requesting(7);
verify(
  menuAnalysisUiReducer(latestRequest, {
    type: "PERSISTED",
    attemptId: 6,
    summary,
  }) === latestRequest,
  "a stale success cannot overwrite the latest attempt",
);
verify(
  menuAnalysisUiReducer(latestRequest, {
    type: "FAILED",
    attemptId: 6,
    message: "Stale failure.",
    errorKind: "response",
  }) === latestRequest,
  "a stale failure cannot overwrite the latest attempt",
);

// B. Success summary rules.
const demoSummary = createMenuAnalysisSuccessSummary(demoFoodseyoAnalysis);
verify(
  demoSummary.restaurantLabel !== "Restaurant not confirmed",
  "confirmed analysis uses its restaurant name",
);
verify(
  demoSummary.dishCount === demoFoodseyoAnalysis.payload.menu?.dishes.length,
  "summary counts canonical dishes",
);
verify(demoSummary.status === "complete", "complete canonical status stays complete");
const likelyAnalysis = structuredClone(demoFoodseyoAnalysis) as FoodseyoAnalysis;
likelyAnalysis.payload.restaurant = null;
likelyAnalysis.payload.restaurantResolution.status = "likely";
likelyAnalysis.payload.restaurantResolution.confirmedBy = null;
verify(
  createMenuAnalysisSuccessSummary(likelyAnalysis).restaurantLabel ===
    likelyAnalysis.payload.restaurantResolution.candidates[0]?.name,
  "likely analysis uses its selected candidate name",
);
const unconfirmedAnalysis = structuredClone(likelyAnalysis) as FoodseyoAnalysis;
unconfirmedAnalysis.payload.restaurantResolution.status = "unconfirmed";
verify(
  createMenuAnalysisSuccessSummary(unconfirmedAnalysis).restaurantLabel ===
    "Restaurant not confirmed",
  "unconfirmed analysis uses the exact fallback",
);
const partialAnalysis = structuredClone(demoFoodseyoAnalysis) as FoodseyoAnalysis;
partialAnalysis.status = "partial";
verify(
  createMenuAnalysisSuccessSummary(partialAnalysis).status === "partial",
  "partial canonical status stays partial",
);
const oneDishAnalysis = structuredClone(demoFoodseyoAnalysis) as FoodseyoAnalysis;
if (!oneDishAnalysis.payload.menu) throw new Error("Demo analysis must include a menu.");
oneDishAnalysis.payload.menu.dishes = oneDishAnalysis.payload.menu.dishes.slice(0, 1);
verify(
  createMenuAnalysisSuccessSummary(oneDishAnalysis).dishCount === 1,
  "single canonical dish produces a count of one",
);

// C. Safe response handling.
const validAnalysis = await parseMenuAnalysisResponse({
  ...new Response(
    JSON.stringify({ ok: true, analysis: demoFoodseyoAnalysis }),
    { status: 200 },
  ),
  ok: true,
  text: () =>
    Promise.resolve(JSON.stringify({ ok: true, analysis: demoFoodseyoAnalysis })),
});
verify(
  validAnalysis.analysisId === demoFoodseyoAnalysis.analysisId,
  "valid HTTP success body returns canonical analysis",
);
const malformedJson = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: true,
    async text() {
      return '{"ok":true,"analysis":';
    },
  }),
);
verify(
  getSafeMenuAnalysisFailure(malformedJson, {
    signalAborted: false,
    timedOut: false,
  })?.errorKind === "response_json",
  "malformed JSON becomes a typed JSON response error",
);
const invalidSchema = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: true,
    async text() {
      return JSON.stringify({ ok: true });
    },
  }),
);
verify(
  getSafeMenuAnalysisFailure(invalidSchema, {
    signalAborted: false,
    timedOut: false,
  })?.message === MENU_ANALYSIS_RESPONSE_SCHEMA_MESSAGE,
  "HTTP 200 invalid schema uses the safe schema message",
);
const validApiError = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: false,
    async text() {
      return JSON.stringify({
        ok: false,
        error: {
          code: "OPENAI_RATE_LIMITED",
          message: "Menu analysis is busy. Try again shortly.",
          retryable: true,
        },
      });
    },
  }),
);
verify(
  getSafeMenuAnalysisFailure(validApiError, {
    signalAborted: false,
    timedOut: false,
  })?.errorKind === "api",
  "non-200 valid error body becomes a typed API error",
);
const mismatchedOk = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: true,
    async text() {
      return JSON.stringify({
        ok: false,
        error: {
          code: "OPENAI_TIMEOUT",
          message: "Safe but mismatched.",
          retryable: true,
        },
      });
    },
  }),
);
verify(
  getSafeMenuAnalysisFailure(mismatchedOk, {
    signalAborted: false,
    timedOut: false,
  })?.errorKind === "response_mismatch",
  "HTTP 200 ok false cannot pass as success",
);
const htmlResponse = await captureError(() =>
  parseMenuAnalysisResponse(new Response("<html>failure</html>", { status: 502 })),
);
verify(
  getSafeMenuAnalysisFailure(htmlResponse, {
    signalAborted: false,
    timedOut: false,
  })?.message === MENU_ANALYSIS_RESPONSE_JSON_MESSAGE,
  "HTML response uses the safe JSON message",
);
const failedCanonical = structuredClone(demoFoodseyoAnalysis) as FoodseyoAnalysis;
failedCanonical.status = "failed";
const failedSuccessBody = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: true,
    async text() {
      return JSON.stringify({ ok: true, analysis: failedCanonical });
    },
  }),
);
verify(
  getSafeMenuAnalysisFailure(failedSuccessBody, {
    signalAborted: false,
    timedOut: false,
  })?.errorKind === "failed_analysis" &&
    getSafeMenuAnalysisFailure(failedSuccessBody, {
      signalAborted: false,
      timedOut: false,
    })?.message === MENU_ANALYSIS_FAILED_STATUS_MESSAGE,
  "failed canonical analysis is not shown as completion",
);
verify(
  getSafeMenuAnalysisFailure(new TypeError("private network detail"), {
    signalAborted: false,
    timedOut: false,
  })?.errorKind === "network",
  "network failure is safely categorized",
);
verify(
  getSafeMenuAnalysisFailure(
    new MenuImagePreprocessingError("EMPTY_IMAGE", "Safe input guidance."),
    { signalAborted: false, timedOut: false },
  )?.errorKind === "input",
  "preprocessing failure is safely categorized",
);
verify(
  getSafeMenuAnalysisFailure(new Error("private timeout detail"), {
    signalAborted: true,
    timedOut: true,
  })?.message === MENU_ANALYSIS_TIMEOUT_MESSAGE,
  "timeout uses the exact safe watchdog message",
);
verify(
  getSafeMenuAnalysisFailure(new Error("private abort detail"), {
    signalAborted: true,
    timedOut: false,
  }) === null,
  "manual abort does not show a timeout or technical error",
);
verify(
  !getSafeMenuAnalysisFailure(new Error("private technical detail"), {
    signalAborted: false,
    timedOut: false,
  })?.message.includes("private technical detail"),
  "technical error details are never exposed",
);

// D. Synchronous duplicate prevention and stale-attempt gate.
const attemptGate = createMenuAnalysisAttemptGate();
const firstAttempt = attemptGate.begin();
verify(firstAttempt === 1, "first attempt receives monotonic ID one");
verify(attemptGate.begin() === null, "active attempt blocks a second submit");
verify(attemptGate.isCurrent(1), "only the active attempt is current");
verify(!attemptGate.release(99), "stale attempt cannot release the active request");
verify(attemptGate.release(1), "active request releases after completion");
const retryAttempt = attemptGate.begin();
verify(retryAttempt === 2, "retry receives a new monotonic attempt ID");
verify(attemptGate.release(2), "retry releases normally");

let requestCalls = 0;
let resolveRequest = () => {};
const pendingRequest = new Promise<void>((resolve) => {
  resolveRequest = resolve;
});
const doubleTapGate = createMenuAnalysisAttemptGate();
const submit = async () => {
  const attemptId = doubleTapGate.begin();
  if (attemptId === null) return false;
  requestCalls += 1;
  await pendingRequest;
  doubleTapGate.release(attemptId);
  return true;
};
const firstSubmit = submit();
const duplicateSubmit = await submit();
verify(!duplicateSubmit, "fast double submit is rejected synchronously");
verify(requestCalls === 1, "one click sequence produces one request call");
resolveRequest();
verify(await firstSubmit, "the active request completes normally");
verify(doubleTapGate.begin() !== null, "retry is available after completion");

// E. Watchdog creation, cancellation, and timeout behavior.
let scheduledCallback = () => {};
let scheduledDelay = 0;
let clearedTimers = 0;
let timeoutEvents = 0;
const scheduler: MenuAnalysisWatchdogScheduler = (callback, delayMs) => {
  scheduledCallback = callback;
  scheduledDelay = delayMs;
  return () => {
    clearedTimers += 1;
  };
};
const cancelBeforeTimeout = startMenuAnalysisWatchdog(() => {
  timeoutEvents += 1;
}, scheduler);
verify(
  CLIENT_MENU_ANALYSIS_WATCHDOG_MS === 105_000,
  "client watchdog is 105 seconds",
);
verify(scheduledDelay === 105_000, "watchdog schedules the documented duration");
cancelBeforeTimeout();
verify(clearedTimers === 1, "watchdog timer clears on normal completion");
scheduledCallback();
verify(timeoutEvents === 0, "cleared watchdog cannot fire late");
const cancelAfterTimeout = startMenuAnalysisWatchdog(() => {
  timeoutEvents += 1;
}, scheduler);
scheduledCallback();
verify(timeoutEvents === 1, "unresolved request triggers the watchdog once");
cancelAfterTimeout();
verify(clearedTimers === 1, "fired watchdog is not cleared twice");

// F. Storage separation and source-level mobile safety.
let storedKey = "";
let storedValue: string | null = null;
verify(
  tryWriteCurrentAnalysis(demoFoodseyoAnalysis, {
    setItem(key, value) {
      storedKey = key;
      storedValue = value;
    },
    getItem() {
      return storedValue;
    },
  }),
  "successful confirmed storage write reports success",
);
verify(storedKey === CURRENT_ANALYSIS_STORAGE_KEY, "session storage key is unchanged");
verify(
  !tryWriteCurrentAnalysis(demoFoodseyoAnalysis, {
    setItem() {
      throw new Error("private browser storage detail");
    },
    getItem() {
      return null;
    },
  }),
  "storage exception is contained without changing analysis success",
);

const componentSource = await readFile(
  "src/components/menu-scan/MenuScanClient.tsx",
  "utf8",
);
const uiStateSource = await readFile("src/lib/menu-analysis-ui-state.ts", "utf8");
verify(componentSource.includes("Menu analysis complete"), "success heading exists");
verify(
  componentSource.includes('role="status"') &&
    componentSource.includes('aria-live="polite"'),
  "success panel has live-region semantics",
);
verify(
  componentSource.includes('analysisUi.phase === "success"'),
  "fallback completion rendering is connected to the explicit success phase",
);
verify(
  componentSource.includes("scrollIntoView") &&
    componentSource.includes("prefers-reduced-motion") &&
    componentSource.includes("scroll-mb-32"),
  "feedback scrolls into a mobile-safe viewport position",
);
verify(
  componentSource.includes('type: "FINALIZED"') &&
    uiStateSource.includes('case "FINALIZED"'),
  "request finalization is cleanup-only for visible state",
);
verify(
  componentSource.includes("watchdogCancelRef.current?.()") &&
    componentSource.includes("cancelWatchdog()"),
  "watchdog clears on unmount and request settlement",
);
verify(
  (componentSource.match(/fetch\("\/api\/analyze\/menu-images"/g) ?? []).length === 1,
  "Menu Scan retains one API call site",
);
verify(
  componentSource.includes("router.replace(MENU_ANALYSIS_RESULTS_PATH)"),
  "normal success replaces Menu Scan with the result route",
);
verify(
  componentSource.includes("Open menu results") &&
    componentSource.includes('analysisUi.fallback === "navigation"'),
  "Open menu results exists only for navigation fallback",
);
verify(!componentSource.includes("View results"), "T6 View results action is absent");
verify(!componentSource.includes("console."), "Menu Scan logs no menu content");
verify(MAX_MENU_IMAGE_COUNT === 10, "ten-image maximum remains unchanged");
verify(
  componentSource.includes("preprocessMenuImages"),
  "existing adaptive preprocessing remains wired",
);
verify(
  componentSource.includes("useImageIntake") &&
    componentSource.includes("consumePendingFiles"),
  "Home transient image handoff remains wired",
);
verify(
  existsSync("src/app/analysis/page.tsx") &&
    existsSync("src/app/analysis/dishes/[dishId]/page.tsx"),
  "T5.4 canonical Overview and Dish Detail routes exist",
);
verify(
  MENU_ANALYSIS_LOADING_LABEL === "Reading your menu…" &&
    MENU_ANALYSIS_LOADING_HELPER ===
      "This can take up to a minute for detailed menus." &&
    MENU_ANALYSIS_RESULTS_PATH === "/analysis",
  "loading copy and canonical result path are frozen",
);

const networkGuard = installNetworkGuard(
  "Completion validation must not call the network.",
);
networkGuard.restore();
verify(networkGuard.callCount === 0, "completion validation makes zero network calls");

report();
