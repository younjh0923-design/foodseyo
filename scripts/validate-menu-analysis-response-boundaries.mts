import { readFile } from "node:fs/promises";
import type { FoodseyoAnalysis } from "../src/domain/foodseyo-analysis.ts";
import { demoFoodseyoAnalysis } from "../src/data/demoFoodseyoAnalysis.ts";
import {
  MENU_ANALYSIS_EMPTY_MENU_MESSAGE,
  MENU_ANALYSIS_FAILED_STATUS_MESSAGE,
  MENU_ANALYSIS_RESPONSE_BODY_MESSAGE,
  MENU_ANALYSIS_RESPONSE_JSON_MESSAGE,
  MENU_ANALYSIS_RESPONSE_MISMATCH_MESSAGE,
  MENU_ANALYSIS_RESPONSE_SCHEMA_MESSAGE,
  MENU_ANALYSIS_SEMANTIC_MESSAGE,
  SAFE_MENU_ANALYSIS_ERROR_MESSAGE,
  getSafeMenuAnalysisFailure,
  parseMenuAnalysisResponse,
  type MenuAnalysisResponseObservation,
} from "../src/lib/menu-analysis-client.ts";
import { logMenuAnalysisClientObservation } from "../src/lib/menu-analysis-observability.ts";
import {
  MENU_ANALYSIS_NAVIGATION_WARNING,
  MENU_ANALYSIS_STORAGE_WARNING,
  menuAnalysisUiReducer,
  type AnalysisSuccessSummary,
  type MenuAnalysisUiState,
} from "../src/lib/menu-analysis-ui-state.ts";
import { tryWriteCurrentAnalysis } from "../src/lib/storage.ts";
import {
  AnalysisEnvelopeValidationError,
  AnalysisSemanticValidationError,
  AnalysisStructuralValidationError,
} from "../src/services/analysis/analysis-errors.ts";
import {
  MENU_ANALYSIS_CORRELATION_HEADER,
  MenuAnalysisApiSuccessSchema,
} from "../src/services/menu-analysis/menu-analysis-api.ts";
import {
  createMenuAnalysisPostHandler,
  describeMenuAnalysisFailure,
  type MenuAnalysisObservation,
} from "../src/services/menu-analysis/menu-analysis-post-handler.ts";
import type { MenuImageModelOutput } from "../src/services/menu-analysis/menu-image-model-schema.ts";
import type { MenuVisionProvider } from "../src/services/menu-analysis/menu-vision-provider.ts";
import {
  captureError,
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo menu response boundary validation",
  "Menu response boundary validation failed",
);

const correlationId = "123e4567-e89b-12d3-a456-426614174000";
const response = (body: unknown, status = 200): Response =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { [MENU_ANALYSIS_CORRELATION_HEADER]: correlationId },
  });
const safeFailure = (error: unknown) =>
  getSafeMenuAnalysisFailure(error, {
    signalAborted: false,
    timedOut: false,
  });

const createSyntheticAnalysis = (dishCount: number): FoodseyoAnalysis => {
  const analysis = structuredClone(demoFoodseyoAnalysis) as FoodseyoAnalysis;
  analysis.analysisId = `synthetic-analysis-${dishCount}`;
  analysis.inputContext = {
    type: "menu_images",
    imageCount: 1,
    userEnteredRestaurantName: null,
    locationUsed: false,
    storageScope: "session_only",
  };
  if (analysis.payload.restaurant) {
    analysis.payload.restaurant.name = "Synthetic Restaurant";
    analysis.payload.restaurant.summary = "Synthetic canonical fixture.";
  }
  analysis.payload.restaurantResolution.candidates.forEach((candidate) => {
    candidate.name = "Synthetic Restaurant";
  });
  const menu = analysis.payload.menu;
  if (!menu?.dishes[0] || !menu.categories[0]) {
    throw new Error("Synthetic analysis requires a menu template.");
  }
  const template = menu.dishes[0];
  menu.categories = [{ id: "synthetic-category", label: "Synthetic category" }];
  menu.dishes = Array.from({ length: dishCount }, (_, index) => ({
    ...structuredClone(template),
    id: `synthetic-dish-${index + 1}`,
    name: `Synthetic dish ${index + 1}`,
    originalName: null,
    categoryId: "synthetic-category",
    menuDescription: `Synthetic description ${index + 1}`,
  }));
  menu.featuredDishIds = [];
  return analysis;
};

// Small and large valid HTTP 200 JSON responses.
const smallAnalysis = createSyntheticAnalysis(1);
const smallBody = JSON.stringify({ ok: true, analysis: smallAnalysis });
const smallParseObservations: MenuAnalysisResponseObservation[] = [];
const smallParseTimes = [100, 112];
const parsedSmall = await parseMenuAnalysisResponse(response(smallBody), {
  now: () => smallParseTimes.shift() ?? 112,
  observe: (observation) => smallParseObservations.push(observation),
});
verify(parsedSmall.payload.menu?.dishes.length === 1, "small valid 200 JSON parses");
const smallBytes = new TextEncoder().encode(smallBody).byteLength;
verify(smallBytes > 0, "small response byte length is measurable");
const smallParseObservation = smallParseObservations[0];
verify(smallParseObservations.length === 1, "valid response records one client parse observation");
verify(smallParseObservation?.failureStageCode === "success", "valid response records the success stage");
verify(smallParseObservation?.responseByteLength === smallBytes, "client records exact response bytes");
verify(smallParseObservation?.clientParseValidationMs === 12, "client parse and validation duration is measurable");
verify(
  smallParseObservation?.structuralErrorCount === 0 &&
    smallParseObservation.semanticErrorCount === 0,
  "valid response records zero structural and semantic errors",
);

const largeAnalysis = createSyntheticAnalysis(31);
const largeBody = JSON.stringify({ ok: true, analysis: largeAnalysis });
const largeBytes = new TextEncoder().encode(largeBody).byteLength;
const parsedLarge = await parseMenuAnalysisResponse(response(largeBody));
verify(parsedLarge.payload.menu?.dishes.length === 31, "large valid 31-dish 200 JSON parses");
verify(largeBytes > smallBytes, "31-dish response is larger than small response");
verify(largeBytes < 1_000_000, "31-dish synthetic response remains below one megabyte");

// Body read, JSON, structural schema, HTTP/body, status, empty and semantic stages.
const bodyReadError = await captureError(() =>
  parseMenuAnalysisResponse({
    ok: true,
    headers: new Headers({ [MENU_ANALYSIS_CORRELATION_HEADER]: correlationId }),
    async text() {
      throw new TypeError("private Safari body detail");
    },
  }),
);
verify(safeFailure(bodyReadError)?.errorKind === "response_body", "body read failure is categorized");
verify(safeFailure(bodyReadError)?.message === MENU_ANALYSIS_RESPONSE_BODY_MESSAGE, "body read failure uses safe copy");
verify(safeFailure(bodyReadError)?.referenceCode === "123E4567", "body read failure exposes a short safe reference");

for (const [label, body] of [
  ["truncated", '{"ok":true,"analysis":'],
  ["HTML", "<html><body>gateway response</body></html>"],
] as const) {
  const error = await captureError(() => parseMenuAnalysisResponse(response(body)));
  verify(safeFailure(error)?.errorKind === "response_json", `${label} 200 response is categorized as JSON failure`);
  verify(safeFailure(error)?.message === MENU_ANALYSIS_RESPONSE_JSON_MESSAGE, `${label} 200 response uses safe JSON copy`);
}

const invalidSchemaObservations: MenuAnalysisResponseObservation[] = [];
const invalidSchemaError = await captureError(() =>
  parseMenuAnalysisResponse(response({ ok: true, analysis: {} }), {
    observe: (observation) => invalidSchemaObservations.push(observation),
  }),
);
verify(safeFailure(invalidSchemaError)?.errorKind === "response_schema", "invalid API schema is categorized");
verify(safeFailure(invalidSchemaError)?.message === MENU_ANALYSIS_RESPONSE_SCHEMA_MESSAGE, "invalid API schema uses safe copy");
verify(
  invalidSchemaObservations[0]?.failureStageCode === "response_schema" &&
    invalidSchemaObservations[0].structuralErrorCount > 0,
  "invalid API schema records only its structural issue count",
);

const mismatchError = await captureError(() =>
  parseMenuAnalysisResponse(
    response({
      ok: false,
      error: { code: "OPENAI_TIMEOUT", message: "Safe server message.", retryable: true },
    }),
  ),
);
verify(safeFailure(mismatchError)?.errorKind === "response_mismatch", "HTTP/body mismatch is categorized");
verify(safeFailure(mismatchError)?.message === MENU_ANALYSIS_RESPONSE_MISMATCH_MESSAGE, "HTTP/body mismatch uses safe copy");

const failedAnalysis = createSyntheticAnalysis(1);
failedAnalysis.status = "failed";
const failedError = await captureError(() =>
  parseMenuAnalysisResponse(response({ ok: true, analysis: failedAnalysis })),
);
verify(safeFailure(failedError)?.errorKind === "failed_analysis", "failed analysis status is categorized");
verify(safeFailure(failedError)?.message === MENU_ANALYSIS_FAILED_STATUS_MESSAGE, "failed analysis status uses safe copy");

const emptyAnalysis = createSyntheticAnalysis(1);
if (!emptyAnalysis.payload.menu) throw new Error("Synthetic menu is required.");
emptyAnalysis.payload.menu.dishes = [];
emptyAnalysis.payload.menu.featuredDishIds = [];
const emptyError = await captureError(() =>
  parseMenuAnalysisResponse(response({ ok: true, analysis: emptyAnalysis })),
);
verify(safeFailure(emptyError)?.errorKind === "empty_menu", "empty menu is categorized");
verify(safeFailure(emptyError)?.message === MENU_ANALYSIS_EMPTY_MENU_MESSAGE, "empty menu uses safe copy");

const semanticAnalysis = createSyntheticAnalysis(1);
if (!semanticAnalysis.payload.menu) throw new Error("Synthetic menu is required.");
semanticAnalysis.payload.menu.dishes[0].categoryId = "missing-category";
const semanticObservations: MenuAnalysisResponseObservation[] = [];
const semanticError = await captureError(() =>
  parseMenuAnalysisResponse(response({ ok: true, analysis: semanticAnalysis }), {
    observe: (observation) => semanticObservations.push(observation),
  }),
);
verify(safeFailure(semanticError)?.errorKind === "semantic_validation", "semantic validation failure is categorized");
verify(safeFailure(semanticError)?.message === MENU_ANALYSIS_SEMANTIC_MESSAGE, "semantic validation uses safe copy");
verify(
  semanticObservations[0]?.failureStageCode === "semantic_validation" &&
    semanticObservations[0].semanticErrorCount > 0,
  "semantic failure records only its semantic issue count",
);

const networkFailure = safeFailure(new TypeError("private network detail"));
verify(networkFailure?.errorKind === "network", "network TypeError remains a distinct category");
verify(networkFailure?.message === SAFE_MENU_ANALYSIS_ERROR_MESSAGE, "network TypeError alone uses connection copy");
verify(networkFailure?.referenceCode === null, "network failure without a response has no reference");

// Storage and navigation remain separate post-parse fallbacks.
verify(
  !tryWriteCurrentAnalysis(smallAnalysis, {
    setItem() {},
    getItem() { return null; },
  }),
  "storage readback failure remains detectable",
);
const summary: AnalysisSuccessSummary = {
  status: "complete",
  restaurantLabel: "Synthetic Restaurant",
  dishCount: 1,
};
const requesting: MenuAnalysisUiState = {
  phase: "requesting",
  attemptId: 1,
  startedAt: 1,
};
const storageFallback = menuAnalysisUiReducer(requesting, {
  type: "STORAGE_FAILED",
  attemptId: 1,
  summary,
});
verify(storageFallback.phase === "success" && storageFallback.message === MENU_ANALYSIS_STORAGE_WARNING, "storage failure keeps exact completion fallback");
const navigating = menuAnalysisUiReducer(requesting, {
  type: "PERSISTED",
  attemptId: 1,
  summary,
});
const navigationFallback = menuAnalysisUiReducer(navigating, {
  type: "NAVIGATION_FAILED",
  attemptId: 1,
});
verify(navigationFallback.phase === "success" && navigationFallback.message === MENU_ANALYSIS_NAVIGATION_WARNING, "navigation failure keeps exact completion fallback");

// Server correlation header and privacy-safe observation shape.
const modelOutput: MenuImageModelOutput = {
  analysisQuality: "good",
  menuTitle: "Synthetic menu",
  currency: null,
  restaurantSignals: [],
  categories: [
    {
      label: "Synthetic category",
      sourceImageIndexes: [0],
      dishes: [
        {
          name: "Synthetic dish",
          originalName: null,
          pronunciation: null,
          menuDescription: "Synthetic description",
          rawPriceText: null,
          price: null,
          priceOptions: [],
          options: [],
          visibleSpiceLabel: null,
          visibleDietaryLabels: [],
          explicitDietaryClaims: [],
          generalKnowledge: {
            definition: "Synthetic definition.",
            regionalBackground: null,
            typicalTaste: [],
            typicalTexture: [],
            typicalSpice: null,
            typicalPreparation: null,
            commonIngredients: [],
            similarDishes: [],
            orderingConsiderations: [],
          },
          consistency: {
            basicTastes: [],
            flavorNotes: [],
            heatLevel: "unknown",
            richnessLevel: "unknown",
            textures: [],
            ingredients: [],
          },
          sourceImageIndexes: [0],
          uncertaintyNotes: [],
        },
      ],
    },
  ],
  warnings: [],
};
const provider: MenuVisionProvider = {
  modelVersion: "gpt-5.6",
  async analyzeMenuImages() {
    return modelOutput;
  },
};
let observation: MenuAnalysisObservation | null = null;
const times = [1_000, 1_005, 1_015, 1_020, 1_025];
const handler = createMenuAnalysisPostHandler({
  createProvider: () => provider,
  createCorrelationId: () => correlationId,
  now: () => times.shift() ?? 1_025,
  logObservation(next) {
    observation = next;
  },
});
const formData = new FormData();
formData.append(
  "images",
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1])], { type: "image/jpeg" }),
  "synthetic.jpg",
);
const networkGuard = installNetworkGuard(
  "Response boundary tests must not call the network.",
);
const routeResponse = await handler(
  new Request("http://localhost/api/analyze/menu-images", {
    method: "POST",
    body: formData,
  }),
);
const routeText = await routeResponse.text();
networkGuard.restore();
verify(routeResponse.status === 200, "fake-provider server success returns 200");
verify(MenuAnalysisApiSuccessSchema.safeParse(JSON.parse(routeText)).success, "server success body remains API-schema valid");
verify(routeResponse.headers.get(MENU_ANALYSIS_CORRELATION_HEADER) === correlationId, "server success includes correlation header");
verify(observation !== null, "server records one safe observation");
verify(observation?.httpStatus === 200 && observation.failureStageCode === "success", "success observation records status and stage");
verify(observation?.durationMs === 25, "observation records duration only");
verify(observation?.openAiDurationMs === 10, "observation records the provider request duration");
verify(observation?.serverValidationDurationMs === 5, "observation records post-provider canonical validation duration");
verify(observation?.responseByteLength === new TextEncoder().encode(routeText).byteLength, "observation records exact response byte length");
verify(
  observation?.cacheReadState === "disabled" &&
    observation.cacheWriteState === "not_attempted" &&
    observation.providerCallCount === 1,
  "observation records only safe cache state and provider count",
);
verify(observation?.structuralErrorCount === 0 && observation.semanticErrorCount === 0, "success observation records zero validation errors");
verify(
  Object.keys(observation ?? {}).sort().join("|") ===
    [
      "cacheReadState",
      "cacheWriteState",
      "correlationId",
      "durationMs",
      "failureStageCode",
      "httpStatus",
      "openAiDurationMs",
      "providerCallCount",
      "responseByteLength",
      "semanticErrorCount",
      "serverValidationDurationMs",
      "structuralErrorCount",
    ].join("|"),
  "observation contains only approved fields",
);
verify(!JSON.stringify(observation).includes("Synthetic dish"), "observation contains no menu content");

const clientLogs: Array<{ label: string; value: unknown }> = [];
logMenuAnalysisClientObservation(
  {
    referenceCode: "123E4567",
    httpStatus: 200,
    clientPreprocessMs: 12,
    requestTotalMs: 250,
    responseByteLength: smallBytes,
    clientParseValidationMs: 12,
    storageMs: 2,
    failureStageCode: "success",
    structuralErrorCount: 0,
    semanticErrorCount: 0,
  },
  (label, value) => clientLogs.push({ label, value }),
);
verify(clientLogs.length === 1, "client observation emits one safe record");
verify(
  Object.keys(clientLogs[0]?.value ?? {}).sort().join("|") ===
    [
      "clientParseValidationMs",
      "clientPreprocessMs",
      "failureStageCode",
      "httpStatus",
      "referenceCode",
      "requestTotalMs",
      "responseByteLength",
      "semanticErrorCount",
      "storageMs",
      "structuralErrorCount",
    ].join("|"),
  "client observation contains only approved fields",
);
verify(!JSON.stringify(clientLogs).includes("Synthetic dish"), "client observation contains no menu content");

const structural = describeMenuAnalysisFailure(
  new AnalysisStructuralValidationError([
    { path: ["private"], message: "private structural detail" },
    { path: ["private2"], message: "private structural detail 2" },
  ]),
);
verify(structural.failureStageCode === "structural_validation" && structural.structuralErrorCount === 2, "structural observation records count without details");
verify(!JSON.stringify(structural).includes("private structural"), "structural details are not logged");
const semantic = describeMenuAnalysisFailure(
  new AnalysisSemanticValidationError([
    {
      code: "DISH_CATEGORY_REFERENCE_MISSING",
      message: "private semantic detail",
      relatedEntityIds: ["private-dish"],
    },
  ]),
);
verify(semantic.failureStageCode === "semantic_validation" && semantic.semanticErrorCount === 1, "semantic observation records count without details");
verify(!JSON.stringify(semantic).includes("private semantic"), "semantic details are not logged");
const envelope = describeMenuAnalysisFailure(
  new AnalysisEnvelopeValidationError([
    { path: ["private"], message: "private envelope detail" },
  ]),
);
verify(envelope.failureStageCode === "envelope_validation" && envelope.structuralErrorCount === 1, "envelope validation records only its count");
verify(networkGuard.callCount === 0, "regression suite makes zero network calls");

const clientSource = await readFile("src/lib/menu-analysis-client.ts", "utf8");
const handlerSource = await readFile(
  "src/services/menu-analysis/menu-analysis-post-handler.ts",
  "utf8",
);
verify(clientSource.includes("await response.text()") && clientSource.includes("JSON.parse(responseText)"), "body read and JSON parse are separate source stages");
verify(clientSource.includes("Reference:") === false, "client parser never logs or formats menu content");
verify(
  !handlerSource.includes("logObservation(formData") &&
    !handlerSource.includes("console.info(error"),
  "observation source never logs form data or raw errors",
);
verify(!handlerSource.includes("JSON.stringify(error)"), "server never serializes raw errors into logs");

report(` (small=${smallBytes}B, 31-dish=${largeBytes}B)`);
