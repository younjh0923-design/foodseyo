import { readFile } from "node:fs/promises";
import type { FoodseyoAnalysis } from "../src/domain/foodseyo-analysis.ts";
import { demoFoodseyoAnalysis } from "../src/data/demoFoodseyoAnalysis.ts";
import {
  createLiveAnalysisOverview,
  createLiveDishDetail,
  findLiveDish,
  liveDishPath,
} from "../src/lib/live-analysis-results.ts";
import {
  MENU_ANALYSIS_NAVIGATION_WARNING,
  MENU_ANALYSIS_STORAGE_WARNING,
  createMenuAnalysisSuccessSummary,
  isMenuAnalysisActive,
  menuAnalysisUiReducer,
  type MenuAnalysisUiState,
} from "../src/lib/menu-analysis-ui-state.ts";
import {
  CURRENT_ANALYSIS_STORAGE_KEY,
  parseCurrentAnalysisStorageValue,
  readCurrentAnalysisResult,
  serializeCurrentAnalysis,
  tryWriteCurrentAnalysis,
} from "../src/lib/storage.ts";
import {
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo live analysis result validation",
  "Live analysis result validation failed",
);
const cloneAnalysis = () => structuredClone(demoFoodseyoAnalysis) as FoodseyoAnalysis;
const summary = createMenuAnalysisSuccessSummary(demoFoodseyoAnalysis);
const requesting = (attemptId = 1): MenuAnalysisUiState => ({
  phase: "requesting",
  attemptId,
  startedAt: 1,
});

// A. Normal automatic navigation state and source contract.
const navigating = menuAnalysisUiReducer(requesting(), {
  type: "PERSISTED",
  attemptId: 1,
  summary,
});
verify(navigating.phase === "navigating", "persisted canonical result enters navigating");
verify(isMenuAnalysisActive(navigating), "navigating remains a disabled loading phase");
verify(
  menuAnalysisUiReducer(navigating, { type: "FINALIZED", attemptId: 1 }) === navigating,
  "finally cannot reset navigating",
);
verify(
  menuAnalysisUiReducer(requesting(2), {
    type: "PERSISTED",
    attemptId: 1,
    summary,
  }).phase === "requesting",
  "stale persistence cannot navigate a newer attempt",
);

// B. Storage failure fallback.
const storageFailure = menuAnalysisUiReducer(requesting(), {
  type: "STORAGE_FAILED",
  attemptId: 1,
  summary,
});
verify(storageFailure.phase === "success", "storage failure retains completion fallback");
verify(
  storageFailure.phase === "success" && storageFailure.fallback === "storage",
  "storage fallback is explicitly typed",
);
verify(
  storageFailure.phase === "success" &&
    storageFailure.message === "This browser could not keep the result for the next screen." &&
    storageFailure.message === MENU_ANALYSIS_STORAGE_WARNING,
  "storage fallback uses exact safe copy",
);

// C. Navigation failure fallback.
const navigationFailure = menuAnalysisUiReducer(navigating, {
  type: "NAVIGATION_FAILED",
  attemptId: 1,
});
verify(navigationFailure.phase === "success", "navigation failure retains completion fallback");
verify(
  navigationFailure.phase === "success" && navigationFailure.fallback === "navigation",
  "navigation fallback is explicitly typed",
);
verify(
  navigationFailure.phase === "success" &&
    navigationFailure.message === "We couldn't open the results automatically." &&
    navigationFailure.message === MENU_ANALYSIS_NAVIGATION_WARNING,
  "navigation fallback uses exact safe copy",
);

// D. Session storage read states and confirmed writes.
const serialized = serializeCurrentAnalysis(demoFoodseyoAnalysis);
verify(parseCurrentAnalysisStorageValue(serialized).status === "success", "valid canonical storage reads successfully");
verify(parseCurrentAnalysisStorageValue(null).status === "missing", "missing key is distinguished");
verify(parseCurrentAnalysisStorageValue("").status === "missing", "empty key is treated as missing");
verify(parseCurrentAnalysisStorageValue("not-json").status === "invalid-json", "invalid JSON is distinguished");
verify(parseCurrentAnalysisStorageValue("{}").status === "invalid-schema", "invalid schema is distinguished");
const unsupported = JSON.parse(serialized) as Record<string, unknown>;
unsupported.schemaVersion = "99.0.0";
verify(
  parseCurrentAnalysisStorageValue(JSON.stringify(unsupported)).status === "unsupported-version",
  "unsupported canonical version is distinguished",
);
const failed = cloneAnalysis();
failed.status = "failed";
verify(
  parseCurrentAnalysisStorageValue(JSON.stringify(failed)).status === "failed-analysis",
  "failed canonical analysis is rejected",
);
const empty = cloneAnalysis();
if (!empty.payload.menu) throw new Error("Demo menu is required.");
empty.payload.menu.dishes = [];
verify(
  parseCurrentAnalysisStorageValue(JSON.stringify(empty)).status === "empty-menu",
  "zero-dish canonical analysis is rejected",
);
verify(
  readCurrentAnalysisResult({ getItem() { throw new Error("private storage detail"); } }).status === "unavailable",
  "storage exceptions become unavailable state",
);
let confirmedValue: string | null = null;
verify(
  tryWriteCurrentAnalysis(demoFoodseyoAnalysis, {
    setItem(key, value) {
      verify(key === CURRENT_ANALYSIS_STORAGE_KEY, "write uses only currentAnalysis key");
      confirmedValue = value;
    },
    getItem() { return confirmedValue; },
  }),
  "write succeeds only after readback confirmation",
);
verify(
  !tryWriteCurrentAnalysis(demoFoodseyoAnalysis, {
    setItem() {},
    getItem() { return null; },
  }),
  "unconfirmed write cannot trigger navigation",
);

// E. Canonical Overview mapping.
const overview = createLiveAnalysisOverview(demoFoodseyoAnalysis);
verify(overview.restaurantName !== "Restaurant not confirmed", "confirmed restaurant name is rendered");
verify(overview.dishCount === demoFoodseyoAnalysis.payload.menu?.dishes.length, "dish count uses canonical dishes");
verify(overview.dishCountLabel.endsWith("dishes found"), "plural dish count copy is correct");
verify(overview.completenessLabel === "Menu details extracted", "complete status uses friendly copy");
const partial = cloneAnalysis();
partial.status = "partial";
verify(
  createLiveAnalysisOverview(partial).completenessLabel === "Some menu details may be missing",
  "partial status uses friendly copy",
);
const unconfirmed = cloneAnalysis();
unconfirmed.payload.restaurantResolution.status = "unconfirmed";
unconfirmed.payload.restaurantResolution.confirmedBy = null;
verify(
  createLiveAnalysisOverview(unconfirmed).restaurantName === "Restaurant not confirmed",
  "unconfirmed restaurant cannot expose a candidate as confirmed",
);
const oneDish = cloneAnalysis();
if (!oneDish.payload.menu) throw new Error("Demo menu is required.");
oneDish.payload.menu.dishes = oneDish.payload.menu.dishes.slice(0, 1);
verify(createLiveAnalysisOverview(oneDish).dishCountLabel === "1 dish found", "singular dish count copy is correct");
verify(
  overview.categories.map((category) => category.label).join("|") ===
    demoFoodseyoAnalysis.payload.menu?.categories
      .filter((category) => demoFoodseyoAnalysis.payload.menu?.dishes.some((dish) => dish.categoryId === category.id))
      .map((category) => category.label)
      .join("|"),
  "category order follows canonical order and hides empty categories",
);
verify(
  overview.categories.every((category) => {
    const categoryId = demoFoodseyoAnalysis.payload.menu?.categories.find(
      (candidate) => candidate.label === category.label,
    )?.id;
    return (
      category.dishes.map((dish) => dish.id).join("|") ===
      demoFoodseyoAnalysis.payload.menu?.dishes
        .filter((dish) => dish.categoryId === categoryId)
        .map((dish) => dish.id)
        .join("|")
    );
  }),
  "dish order within each category follows canonical order",
);
const uncategorized = cloneAnalysis();
if (!uncategorized.payload.menu) throw new Error("Demo menu is required.");
uncategorized.payload.menu.dishes[0].categoryId = "missing-category";
verify(
  createLiveAnalysisOverview(uncategorized).categories.at(-1)?.label === "Menu",
  "unknown categories use the Menu fallback",
);
verify(overview.limitations.every((item) => !item.includes("demo-menu-fixture")), "Overview never exposes raw source IDs");

// F. Dish links, lookup and duplicate defenses.
verify(liveDishPath("dish/with space") === "/analysis/dishes/dish%2Fwith%20space", "dish links encode canonical IDs safely");
const firstDish = demoFoodseyoAnalysis.payload.menu?.dishes[0];
if (!firstDish) throw new Error("Demo dish is required.");
verify(findLiveDish(demoFoodseyoAnalysis, firstDish.id)?.id === firstDish.id, "dish lookup finds canonical ID");
verify(findLiveDish(demoFoodseyoAnalysis, encodeURIComponent(firstDish.id))?.id === firstDish.id, "dish lookup accepts route-encoded ID");
verify(findLiveDish(demoFoodseyoAnalysis, "missing") === null, "invalid dish lookup is safe");
const duplicates = cloneAnalysis();
if (!duplicates.payload.menu) throw new Error("Demo menu is required.");
duplicates.payload.menu.dishes.push(structuredClone(duplicates.payload.menu.dishes[0]));
verify(
  createLiveAnalysisOverview(duplicates).dishCount === overview.dishCount,
  "duplicate dish IDs are rendered once",
);

// G. Dish Detail is canonical-only and section-safe.
const detail = createLiveDishDetail(demoFoodseyoAnalysis, firstDish.id);
verify(detail?.name === firstDish.name, "Dish Detail preserves canonical name");
verify(Boolean(detail?.description), "Dish Detail maps a nonempty description when available");
verify((detail?.ingredients.length ?? 0) > 0, "Dish Detail maps available ingredients");
verify(detail?.dietaryNotes.length === firstDish.dietary.items.length, "Dish Detail maps dietary notes without fabrication");
verify(detail?.allergySafetyNotice.includes("cannot guarantee allergy safety") === true, "Dish Detail preserves allergy safety language");

// H and I. Source-level cleanup, route independence and MVP scope.
const menuScanSource = await readFile("src/components/menu-scan/MenuScanClient.tsx", "utf8");
const overviewSource = await readFile("src/components/analysis/LiveAnalysisOverviewClient.tsx", "utf8");
const detailSource = await readFile("src/components/analysis/LiveDishDetailClient.tsx", "utf8");
const hookSource = await readFile("src/components/analysis/useCurrentAnalysisSession.ts", "utf8");
const uiStateSource = await readFile("src/lib/menu-analysis-ui-state.ts", "utf8");
const liveResultAdapterSource = await readFile("src/lib/live-analysis-results.ts", "utf8");
const storageSource = await readFile("src/lib/storage.ts", "utf8");
const resultSource = `${overviewSource}\n${detailSource}\n${hookSource}\n${liveResultAdapterSource}`;
verify(menuScanSource.indexOf("tryWriteCurrentAnalysis") < menuScanSource.indexOf('type: "PERSISTED"'), "storage confirmation precedes navigating phase");
verify(menuScanSource.indexOf('type: "PERSISTED"') < menuScanSource.indexOf("router.replace(MENU_ANALYSIS_RESULTS_PATH)"), "navigating phase precedes router.replace");
verify((menuScanSource.match(/fetch\("\/api\/analyze\/menu-images"/g) ?? []).length === 1, "Menu Scan retains one API call site");
verify(menuScanSource.includes("attemptGateRef.current.isCurrent(attemptId)"), "stale attempts are checked before navigation");
verify(menuScanSource.includes("hardNavigationAttempted"), "hard navigation fallback can run only once");
verify((menuScanSource.match(/window\.location\.replace/g) ?? []).length === 1, "hard navigation has one source call site");
verify(menuScanSource.includes("Open menu results"), "manual navigation fallback action exists");
verify(
  menuScanSource.includes("MENU_ANALYSIS_LOADING_LABEL") &&
    uiStateSource.includes("Reading your menu…"),
  "single loading copy is rendered",
);
verify(!menuScanSource.includes("View results"), "normal success has no View results button");
verify(overviewSource.includes("tryRemoveCurrentAnalysis") === false, "Overview clears through the scoped session hook");
verify(overviewSource.includes("clearPendingFiles"), "Scan another menu clears pending intake");
verify(overviewSource.includes('router.push("/")'), "Scan another menu returns Home");
verify(!overviewSource.includes("localStorage.clear") && !hookSource.includes("sessionStorage.clear"), "no broad browser storage clear is used");
verify(!/passport/i.test(resultSource), "Live result UI and adapter contain no Passport comparison");
verify(!/passport|localStorage/i.test(storageSource), "Passport storage keys and writes are absent");
verify(overviewSource.includes("Scan another menu"), "Overview retains Scan another menu");
verify(detailSource.includes("Dietary and allergy notes"), "Dish Detail retains menu-based caution notes");
verify(detailSource.includes("ingredientsTitle"), "Dish Detail retains ingredient information");
verify(!/fetch\(|OpenAI|openai/i.test(resultSource), "result pages contain no fetch or OpenAI call");
verify(!/demoFoodseyoAnalysis|demoRestaurant|pai-northern/i.test(resultSource), "Live results contain no Demo or PAI fallback");
verify(!/base64|data:image/i.test(resultSource), "Live results contain no Base64 payload");
verify(!/indexedDB|Vercel Blob|S3|database/i.test(resultSource), "Live results add no persistence service");
verify(!/restaurant_photo|restaurant_screen|restaurant_link/i.test(resultSource), "T6 and T7 analyzers are not started");
verify(!/nearby_search|candidate confirmation/i.test(resultSource), "T8 and Nearby work are not started");
verify(!/console\./.test(resultSource), "Live results log no canonical content");
verify(!/price|rating|popular|best seller|reviews/i.test(overviewSource + detailSource), "Live UI makes no price, rating, review or popularity claim");
verify(!/SafeImage|<img|imageUrl/.test(overviewSource + detailSource), "Live UI shows no generated or unverified food image");
verify(detailSource.includes('backHref="/analysis"'), "Dish Detail back returns to Overview");
verify(resultSource.includes("No menu results yet") === false, "recovery copy remains centralized");
const recoverySource = await readFile("src/components/analysis/AnalysisRecoveryState.tsx", "utf8");
verify(recoverySource.includes("No menu results yet") && recoverySource.includes("Scan or upload menu images to see what to order."), "missing result uses exact recovery copy");
verify(recoverySource.includes("Dish not found") && recoverySource.includes("This dish is not available in the current menu analysis."), "invalid dish uses exact recovery copy");
verify(recoverySource.includes("Loading menu results…"), "hydration-safe loading copy exists");

const networkGuard = installNetworkGuard(
  "Live result validation must not call the network.",
);
createLiveAnalysisOverview(demoFoodseyoAnalysis);
createLiveDishDetail(demoFoodseyoAnalysis, firstDish.id);
networkGuard.restore();
verify(networkGuard.callCount === 0, "live result validation makes zero network calls");

report();
