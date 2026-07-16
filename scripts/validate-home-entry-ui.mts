import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  HOME_ENTRY_COPY,
  INVALID_RESTAURANT_LINK_MESSAGE,
  RESTAURANT_LINK_UNAVAILABLE_MESSAGE,
  checkRestaurantLink,
} from "../src/lib/home-entry.ts";
import {
  consumePendingImageIntake,
  prepareImageIntakeSelection,
  prepareMenuScanAppend,
  stagePendingImageIntake,
} from "../src/lib/image-intake.ts";
import {
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo Home entry validation",
  "Home entry validation failed",
);

const homeSource = await readFile("src/components/home/HomeClient.tsx", "utf8");
const providerSource = await readFile(
  "src/components/intake/ImageIntakeProvider.tsx",
  "utf8",
);
const layoutSource = await readFile("src/app/layout.tsx", "utf8");
const menuScanSource = await readFile(
  "src/components/menu-scan/MenuScanClient.tsx",
  "utf8",
);
const helperSource = await readFile("src/lib/home-entry.ts", "utf8");
const intakeSource = await readFile("src/lib/image-intake.ts", "utf8");
const storageSource = await readFile("src/lib/storage.ts", "utf8");

// Exact C1.1 Home copy; T5.5 intake behavior remains unchanged.
verify(HOME_ENTRY_COPY.brand === "FOODSEYO", "Home brand is exact");
verify(HOME_ENTRY_COPY.brandDescription === "AI Food Copilot", "brand description is exact");
verify(HOME_ENTRY_COPY.heading === "Know what you’re ordering.", "Home heading is exact");
verify(
  HOME_ENTRY_COPY.description ===
    "See the taste, texture, ingredients, and details behind every dish.",
  "Home description is exact",
);
verify(
  HOME_ENTRY_COPY.linkPlaceholder === "Paste a restaurant or menu link",
  "link placeholder is exact",
);
verify(HOME_ENTRY_COPY.imageTitle === "Scan or upload a menu", "image CTA title is exact");
verify(
  HOME_ENTRY_COPY.imageDescription === "Take or choose menu photos.",
  "image CTA supporting copy is exact",
);
verify(!/passport/i.test(JSON.stringify(HOME_ENTRY_COPY)), "Home copy contains no Passport");

// Honest, local-only link behavior.
const networkGuard = installNetworkGuard(
  "Home entry validation must not call the network.",
);
verify(checkRestaurantLink("   ").kind === "empty", "empty link produces no result");
verify(
  checkRestaurantLink("not a URL").message === INVALID_RESTAURANT_LINK_MESSAGE,
  "invalid link receives the safe validation message",
);
verify(checkRestaurantLink("http://example.com/menu").kind === "unavailable", "HTTP is valid");
verify(checkRestaurantLink("https://example.com/menu").kind === "unavailable", "HTTPS is valid");
verify(checkRestaurantLink("javascript:alert(1)").kind === "invalid", "javascript scheme is rejected");
verify(checkRestaurantLink("data:text/plain,menu").kind === "invalid", "data scheme is rejected");
verify(checkRestaurantLink("file:///menu.jpg").kind === "invalid", "file scheme is rejected");
verify(
  checkRestaurantLink("https://example.com").message ===
    RESTAURANT_LINK_UNAVAILABLE_MESSAGE,
  "valid link reports analysis as unavailable",
);
verify(
  !("url" in checkRestaurantLink("https://private.example/path")),
  "link result does not retain the submitted URL",
);
verify(!helperSource.includes("demoPath"), "link helper has no demo route");
verify(!helperSource.includes("fetch("), "link helper has no request boundary yet");

// Native multi-file selection, validation, ordering and in-memory handoff.
const image = (name: string, type = "image/jpeg", size = 10) =>
  ({ name, type, size }) as File;
const first = image("first.jpg");
const second = image("second.png", "image/png");
const third = image("third.webp", "image/webp");
verify(prepareImageIntakeSelection([]).kind === "cancelled", "cancelled picker stages nothing");
const ready = prepareImageIntakeSelection([first, second, third]);
verify(
  ready.kind === "ready" &&
    ready.files.map((file) => file.name).join(",") ===
      "first.jpg,second.png,third.webp",
  "native picker selection preserves FileList order",
);
verify(
  prepareImageIntakeSelection([image("photo.heic", "image/heic")]).kind === "invalid",
  "unsupported HEIC is rejected safely",
);
verify(
  prepareImageIntakeSelection(
    Array.from({ length: 10 }, (_, index) => image(`${index}.jpg`)),
  ).kind === "ready",
  "ten-image Home selection remains valid",
);
verify(
  prepareImageIntakeSelection(
    Array.from({ length: 11 }, (_, index) => image(`${index}.jpg`)),
  ).kind === "invalid",
  "eleven-image Home selection is rejected without partial staging",
);
const pending = stagePendingImageIntake([first, second, third]);
verify(pending.staged && pending.files.length === 3, "files are staged in memory");
verify(
  pending.files.map((file) => file.name).join(",") ===
    "first.jpg,second.png,third.webp",
  "pending files preserve selection order",
);
verify(!("source" in pending), "camera/gallery source is not staged");
verify(pending.files[0] === first, "raw File identity is preserved in memory");
const consumed = consumePendingImageIntake(pending);
verify(consumed.consumed === pending, "consume returns the staged set once");
verify(consumed.pending === null, "consume clears pending state atomically");
verify(
  consumePendingImageIntake(consumed.pending).consumed === null,
  "a second consume receives no files",
);
const orderedAppend = prepareMenuScanAppend([first], [second, third]);
verify(
  orderedAppend.kind === "ready" &&
    orderedAppend.files.map((file) => file.name).join(",") === "second.png,third.webp",
  "Menu Scan append preserves incoming order",
);
verify(
  prepareMenuScanAppend(
    Array.from({ length: 9 }, (_, index) => image(`existing-${index}.jpg`)),
    [first, second],
  ).kind === "invalid",
  "Menu Scan revalidates the combined ten-image maximum",
);

// Home renders one full-width direct native picker action.
verify((homeSource.match(/type="file"/g) ?? []).length === 1, "Home has one file input");
verify(homeSource.includes("multiple"), "Home file input supports multiple images");
verify(
  homeSource.includes('const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp"'),
  "Home accept list is limited to JPEG, PNG and WEBP",
);
verify(!/\bcapture\b/.test(homeSource), "Home file input has no capture attribute");
verify(homeSource.includes("hidden"), "Home file input is not duplicated in the accessibility tree");
verify(
  (homeSource.match(/aria-label="Scan or upload a menu"/g) ?? []).length === 1,
  "Home has exactly one accessible menu image CTA",
);
verify(homeSource.includes("min-h-[88px]"), "Home CTA touch target exceeds 44px");
verify(
  homeSource.includes("imageInputRef.current?.click()"),
  "Home CTA directly opens the native file input",
);
verify(!homeSource.includes("BottomSheet"), "custom Add-an-image Bottom Sheet is absent");
verify(!homeSource.includes("imageSheetOpen"), "Bottom Sheet open state is absent");
verify(!/cameraRef|galleryRef|ImageIntakeSource/.test(homeSource + intakeSource), "camera/gallery UI split is absent");
verify(!/Take a photo|Choose from photos/.test(homeSource), "Home does not recreate native picker choices");
verify(!/restaurant sign|storefront|screenshot|restaurant screen/i.test(homeSource), "unsupported image scope is absent from Home");
verify(homeSource.includes('router.push("/menu-scan")'), "valid selection keeps the menu-scan handoff");
verify(
  homeSource.indexOf('if (result.kind === "cancelled") return') <
    homeSource.indexOf('router.push("/menu-scan")'),
  "picker cancellation returns before navigation",
);
verify(!homeSource.includes("fetch("), "Home makes no link-analysis request");
verify(!/localStorage|sessionStorage|indexedDB/.test(homeSource), "Home persists no input");
verify(homeSource.includes('role="alert"'), "Home selection errors are accessible");
verify(homeSource.includes('aria-label="Check restaurant link"'), "link submit has an accessible name");
verify(!homeSource.includes("LoaderCircle"), "unimplemented link action has no fake loader");

// Passport and persistence cleanup.
verify(!/passport/i.test(homeSource + layoutSource), "Home and root layout contain no Passport");
verify(!existsSync("src/components/passport/FoodPassportSheet.tsx"), "Passport settings UI is removed");
verify(!existsSync("src/components/passport/PassportProvider.tsx"), "Passport provider is removed");
verify(layoutSource.includes("<ImageIntakeProvider>{children}</ImageIntakeProvider>"), "image intake provider remains");
verify(!/localStorage|foodseyo:food-passport|PASSPORT_STORAGE_KEY/i.test(storageSource), "Passport storage key and writes are removed");
verify(storageSource.includes("CURRENT_ANALYSIS_STORAGE_KEY"), "current analysis session storage remains");

// Provider and Menu Scan boundaries.
verify(!/localStorage|sessionStorage|indexedDB|JSON\.stringify|base64/i.test(providerSource), "intake provider contains no persistence");
verify(!providerSource.includes("createObjectURL"), "intake provider stores no object URL");
verify(!providerSource.includes("console."), "intake provider logs no File data");
verify(!providerSource.includes("useState"), "intake provider holds only the transient ref");
verify((menuScanSource.match(/type="file"/g) ?? []).length === 1, "Menu Scan has one file input");
verify(menuScanSource.includes("multiple"), "Menu Scan picker remains multi-file");
verify(menuScanSource.includes('accept="image/jpeg,image/png,image/webp"'), "Menu Scan accept list is exact");
verify(!/\bcapture\b/.test(menuScanSource), "Menu Scan has no capture attribute");
verify(!/cameraRef|galleryRef|Take a photo|Choose from photos/.test(menuScanSource), "Menu Scan has no two-step picker UI");
verify(menuScanSource.includes("consumePendingFiles()"), "Menu Scan consumes the one-shot handoff");
verify(menuScanSource.includes("URL.createObjectURL(file)"), "Menu Scan owns preview object URLs");
verify(menuScanSource.includes("URL.revokeObjectURL"), "Menu Scan cleans preview object URLs");
verify(menuScanSource.includes("No images yet."), "direct Menu Scan keeps a valid empty state");
verify(menuScanSource.includes('title="Review images"'), "Menu Scan title remains aligned");
verify(menuScanSource.includes("MAX_MENU_IMAGE_COUNT"), "Menu Scan retains the ten-image limit");
verify(menuScanSource.includes('fetch("/api/analyze/menu-images"'), "menu_images API remains wired");
verify(
  menuScanSource.includes("Images are used for this analysis only and are not stored permanently."),
  "transient-image privacy copy remains",
);

networkGuard.restore();
verify(networkGuard.callCount === 0, "Home entry validation makes zero network calls");

report();
