import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createValidationSuite } from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo MVP scope validation",
  "MVP scope validation failed",
);
const read = (path: string) => readFile(path, "utf8");

const [
  home,
  menuScan,
  overview,
  dishDetail,
  layout,
  storage,
  intake,
  intakeProvider,
  domainTypes,
  liveAdapter,
  restaurantOverview,
  mealPlanner,
  recommendation,
  analyzers,
  postHandler,
  canonical,
  apiRoute,
  inputDocs,
  productDocs,
  liveDocs,
  decisionLog,
  agentsGuide,
  packageJson,
  readme,
  menuDocs,
] = await Promise.all([
  read("src/components/home/HomeClient.tsx"),
  read("src/components/menu-scan/MenuScanClient.tsx"),
  read("src/components/analysis/LiveAnalysisOverviewClient.tsx"),
  read("src/components/analysis/LiveDishDetailClient.tsx"),
  read("src/app/layout.tsx"),
  read("src/lib/storage.ts"),
  read("src/lib/image-intake.ts"),
  read("src/components/intake/ImageIntakeProvider.tsx"),
  read("src/types/domain.ts"),
  read("src/lib/live-analysis-results.ts"),
  read("src/components/restaurant/RestaurantOverviewClient.tsx"),
  read("src/components/recommendation/MealPlannerSheet.tsx"),
  read("src/lib/recommendation.ts"),
  read("src/services/analysis/analyzers.ts"),
  read("src/services/menu-analysis/menu-analysis-post-handler.ts"),
  read("src/domain/foodseyo-analysis.ts"),
  read("src/app/api/analyze/menu-images/route.ts"),
  read("docs/input-architecture.md"),
  read("docs/product-rules.md"),
  read("docs/live-analysis-results.md"),
  read("docs/decision-log.md"),
  read("AGENTS.md"),
  read("package.json"),
  read("README.md"),
  read("docs/menu-image-analysis.md"),
]);

const activeProductSource = [
  home,
  menuScan,
  overview,
  dishDetail,
  layout,
  storage,
  intake,
  intakeProvider,
  domainTypes,
  liveAdapter,
  restaurantOverview,
  mealPlanner,
  recommendation,
].join("\n");

// Removed profile and personalization scope.
verify(!/passport/i.test(activeProductSource), "active product code contains no Passport path");
verify(!existsSync("src/components/passport/FoodPassportSheet.tsx"), "Passport settings component is deleted");
verify(!existsSync("src/components/passport/PassportProvider.tsx"), "Passport provider is deleted");
verify(!/FoodPassport|SpicePreference|PreferredLanguage/.test(domainTypes), "profile-only domain types are deleted");
verify(!/localStorage|PASSPORT_STORAGE_KEY|foodseyo:food-passport/i.test(storage), "profile storage key and writes are deleted");
verify(storage.includes("CURRENT_ANALYSIS_STORAGE_KEY"), "current analysis session key remains");
verify(storage.includes("window.sessionStorage"), "current analysis sessionStorage behavior remains");
verify(!/compareDishWithPassport|PassportComparisonView/.test(liveAdapter), "profile comparison view-model is deleted");
verify(!/For you|showReason=/.test(restaurantOverview), "demo personalization section is deleted");
verify(!/passport/i.test(mealPlanner + recommendation), "meal planning has no profile dependency");

// Home and native picker boundary.
verify(home.includes("Know what you’re ordering.") === false, "Home visible copy remains centralized");
verify(home.includes("HOME_ENTRY_COPY.heading"), "Home renders the centralized heading");
verify(home.includes('aria-label="Scan or upload a menu"'), "Home CTA accessible name is exact");
verify((home.match(/type="file"/g) ?? []).length === 1, "Home exposes one file input");
verify(home.includes("multiple"), "Home picker is multi-file");
verify(home.includes("image/jpeg,image/png,image/webp"), "Home picker limits accepted MIME types");
verify(!/\bcapture\b/.test(home + menuScan), "Home and Menu Scan use no capture hint");
verify(!/BottomSheet|cameraRef|galleryRef/.test(home), "Home has no custom image-choice sheet or split inputs");
verify(home.includes("imageInputRef.current?.click()"), "CTA directly activates the native picker");
verify(home.indexOf('kind === "cancelled"') < home.indexOf('router.push("/menu-scan")'), "cancel returns before navigation");
verify(intakeProvider.includes("useRef<PendingImageIntake | null>"), "handoff is held in React memory");
verify(!/localStorage|sessionStorage|indexedDB|base64/i.test(intake + intakeProvider), "raw Files are not persisted or serialized");

// Supported inputs and unavailable legacy contract.
verify(home.includes("restaurant-link"), "restaurant/menu link input remains on Home");
verify(!home.includes("fetch("), "link UI has no analysis request");
verify(apiRoute.includes("createOpenAIMenuVisionProvider"), "menu_images API route remains live");
verify(postHandler.includes("menu_images: createPreparedMenuImagesAnalyzer"), "only menu_images is overridden by the live route");
verify(!/restaurant_photo: create|restaurant_screen: create/.test(postHandler), "legacy image inputs receive no live provider override");
verify(analyzers.includes('>("restaurant_photo")'), "legacy photo input remains capability-unavailable");
verify(analyzers.includes('>("restaurant_screen")'), "legacy screen input remains capability-unavailable");
verify(!existsSync("src/app/api/analyze/restaurant-photo/route.ts"), "no legacy photo API route exists");
verify(!existsSync("src/app/api/analyze/restaurant-screen/route.ts"), "no legacy screen API route exists");
verify(canonical.includes('z.literal("restaurant_photo")'), "schema-v1 photo branch remains parseable");
verify(canonical.includes('z.literal("restaurant_screen")'), "schema-v1 screen branch remains parseable");
verify(canonical.includes("@deprecated Schema-v1 compatibility only"), "legacy canonical rationale is explicit");

// Result content that remains source-grounded.
verify(!/passport/i.test(overview + dishDetail), "Live result screens have no profile UI");
verify(overview.includes("What to keep in mind"), "Overview retains limitations");
verify(overview.includes("Scan another menu"), "Overview retains Scan another menu");
verify(dishDetail.includes("ingredientsTitle"), "Dish Detail retains menu-derived ingredients");
verify(dishDetail.includes("Dietary and allergy notes"), "Dish Detail retains caution notes");
verify(dishDetail.includes("Confirm with the restaurant"), "Dish Detail retains the safety confirmation section");

// Current documentation and roadmap.
verify(inputDocs.includes("menu_images ───────┐"), "active input diagram starts with menu_images");
verify(inputDocs.includes("restaurant_link ───┘"), "active input diagram includes restaurant_link");
verify(productDocs.includes("T6:** cancelled from the MVP"), "T6 cancellation is documented");
verify(
  productDocs.includes("T7.1–T7.4:** restaurant/menu link analysis after C2"),
  "T7 link analysis is documented after C2",
);
verify(productDocs.includes("T8:** restaurant identification"), "T8 reevaluation is documented");
verify(productDocs.includes("Later:** map-app share-to-Foodseyo integration"), "map-app sharing is Later only");
verify(productDocs.includes("No share extension or inbound map-app share flow exists today"), "map-app sharing is not claimed as implemented");
verify(!/passport/i.test(inputDocs + productDocs + liveDocs), "active scope docs contain no Passport claim");
verify(decisionLog.includes("D-059 — Align the MVP around menu photos and links"), "scope change is appended to the decision log");
verify(decisionLog.includes("D-060 — Optimize the workflow without changing product behavior"), "R1 decision is appended to the decision log");
verify(agentsGuide.includes("Never run a real OpenAI request") && agentsGuide.includes("pnpm verify:full"), "AGENTS guide freezes paid-call and full-verify rules");
verify(agentsGuide.includes("T7 link analysis and map-app sharing have not started"), "AGENTS guide keeps future scope inactive");
verify(
  ["verify:quick", "verify:menu", "verify:results", "verify:full"].every((name) =>
    packageJson.includes(`"${name}"`),
  ),
  "package scripts expose all four verification tiers",
);
verify(readme.includes("R1 — codebase and development workflow optimization (completed)"), "README roadmap includes R1");
verify(menuDocs.includes("T5.5 superseded that UI") && menuDocs.includes("one native multi-file picker"), "technical docs distinguish historical Bottom Sheet from current native picker");

report();
