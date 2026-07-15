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

const passedChecks: string[] = [];
const verify = (condition: boolean, label: string) => {
  if (!condition) throw new Error(`Home entry validation failed: ${label}`);
  passedChecks.push(label);
};

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

// Exact frozen Home copy.
verify(HOME_ENTRY_COPY.brand === "FOODSEYO", "Home brand is exact");
verify(HOME_ENTRY_COPY.brandDescription === "AI Food Copilot", "brand description is exact");
verify(HOME_ENTRY_COPY.heading === "What should I order?", "Home heading is exact");
verify(
  HOME_ENTRY_COPY.description === "Start with a restaurant link or image.",
  "Home description is exact",
);
verify(
  HOME_ENTRY_COPY.linkPlaceholder === "Paste a restaurant or menu link",
  "link placeholder is exact",
);
verify(HOME_ENTRY_COPY.foodPassportTitle === "Food Passport", "Passport title is exact");
verify(
  HOME_ENTRY_COPY.foodPassportDescription === "Allergies & preferences",
  "Passport description is exact",
);
verify(HOME_ENTRY_COPY.imageTitle === "Scan or upload", "image action title is exact");
verify(
  HOME_ENTRY_COPY.imageDescription === "Menu, screenshot, or restaurant sign",
  "image action description is exact",
);
verify(
  [
    "Understand the menu.",
    "Order with confidence.",
    "Analyze once. Explore everything instantly.",
    "Start with a restaurant",
    "Other ways to start",
  ].every(
    (text) =>
      !Object.values(HOME_ENTRY_COPY).includes(text) && !homeSource.includes(text),
  ),
  "forbidden former Home slogans are absent from copy",
);

// Honest, local-only link behavior.
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = (() => {
  networkCalls += 1;
  throw new Error("Home entry validation must not call the network.");
}) as typeof fetch;
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
  "valid link receives the honest unavailable message",
);
verify(
  !("url" in checkRestaurantLink("https://private.example/path")),
  "link result does not retain the submitted URL",
);
verify(!helperSource.includes("demoPath"), "link helper has no demo route");
verify(!helperSource.includes("fetch("), "link helper has no request boundary yet");

// Selection, staging, order, and one-shot consumption.
const image = (name: string, type = "image/jpeg", size = 10) =>
  ({ name, type, size }) as File;
const first = image("first.jpg");
const second = image("second.png", "image/png");
const third = image("third.webp", "image/webp");
verify(
  prepareImageIntakeSelection([], "gallery").kind === "cancelled",
  "cancelled picker stages nothing",
);
const cameraReady = prepareImageIntakeSelection([first], "camera");
verify(cameraReady.kind === "ready" && cameraReady.files.length === 1, "camera accepts one file");
verify(
  prepareImageIntakeSelection([first, second], "camera").kind === "invalid",
  "camera never stages multiple files",
);
const galleryReady = prepareImageIntakeSelection([first, second, third], "gallery");
verify(
  galleryReady.kind === "ready" &&
    galleryReady.files.map((file) => file.name).join(",") ===
      "first.jpg,second.png,third.webp",
  "gallery selection preserves FileList order",
);
verify(
  prepareImageIntakeSelection([image("photo.heic", "image/heic")], "gallery").kind ===
    "invalid",
  "unsupported HEIC is rejected safely",
);
verify(
  prepareImageIntakeSelection(
    Array.from({ length: 11 }, (_, index) => image(`${index}.jpg`)),
    "gallery",
  ).kind === "invalid",
  "eleven-image Home selection is rejected without partial staging",
);
const cameraPending = stagePendingImageIntake([first], "camera");
verify(
  cameraPending.source === "camera" && cameraPending.staged && cameraPending.files.length === 1,
  "camera source is staged explicitly",
);
const galleryPending = stagePendingImageIntake([first, second, third], "gallery");
verify(
  galleryPending.files.map((file) => file.name).join(",") ===
    "first.jpg,second.png,third.webp",
  "pending gallery files preserve order",
);
const replacement = stagePendingImageIntake([third], "gallery");
verify(
  replacement.files.length === 1 && replacement.files[0] === third,
  "a new stage operation replaces the prior pending set",
);
const consumed = consumePendingImageIntake(galleryPending);
verify(consumed.consumed === galleryPending, "consume returns the staged set once");
verify(consumed.pending === null, "consume clears pending state atomically");
verify(
  consumePendingImageIntake(consumed.pending).consumed === null,
  "a second consume receives no files",
);
verify(cameraPending.files[0] === first, "raw File identity is preserved in memory");
const directAppend = prepareMenuScanAppend([], [first, second]);
verify(
  directAppend.kind === "ready" && directAppend.files[0] === first,
  "direct Menu Scan selection remains valid",
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
  "Menu Scan handoff revalidates the combined ten-image maximum",
);

// Provider and source boundaries.
verify(
  !/localStorage|sessionStorage|indexedDB|JSON\.stringify|base64/i.test(providerSource),
  "provider contains no persistence or serialization",
);
verify(!providerSource.includes("createObjectURL"), "provider stores no object URL");
verify(!providerSource.includes("console."), "provider logs no File data");
verify(!homeSource.includes("demoPath"), "Home contains no demo path constant");
verify(!homeSource.includes("pai-northern-thai-kitchen"), "Home contains no fixed PAI route");
verify(!homeSource.includes('href="/nearby"'), "Home renders no Nearby card");
verify(!homeSource.includes("Recent"), "Home renders no Recent heading");
verify(!homeSource.includes("UploadRestaurantAction"), "separate screenshot card is removed");
verify(
  homeSource.indexOf("foodPassportTitle") < homeSource.indexOf("imageTitle"),
  "Food Passport is rendered before Scan or upload",
);
const cameraInputSource = homeSource.slice(
  homeSource.indexOf("ref={cameraRef}"),
  homeSource.indexOf("ref={galleryRef}"),
);
const galleryInputSource = homeSource.slice(
  homeSource.indexOf("ref={galleryRef}"),
  homeSource.indexOf('aria-label="Foodseyo actions"'),
);
verify(cameraInputSource.includes('capture="environment"'), "camera input requests the rear camera");
verify(!cameraInputSource.includes("multiple"), "camera input is single-file only");
verify(galleryInputSource.includes("multiple"), "gallery input supports multiple files");
verify(
  (homeSource.match(/accept=\{ACCEPTED_IMAGE_TYPES\}/g) ?? []).length === 2,
  "both Home inputs use the same explicit accepted types",
);
verify(
  homeSource.includes("cameraRef.current?.click()") &&
    homeSource.includes("galleryRef.current?.click()"),
  "picker opens directly from Bottom Sheet button clicks",
);
verify(homeSource.includes('router.push("/menu-scan")'), "navigation occurs only after selection staging");
verify(!homeSource.includes("fetch("), "Home link input makes no network request");
verify(!/localStorage|sessionStorage/.test(homeSource), "Home persists no raw image or link input");
verify(homeSource.includes('role="alert"'), "Home image selection errors are accessible");
verify(homeSource.includes('aria-label="Check restaurant link"'), "arrow submit has an accessible name");
verify(!homeSource.includes("LoaderCircle"), "unsupported link action has no fake loader");
verify(
  homeSource.includes('title="Add an image"') &&
    homeSource.includes('description="Choose how to add restaurant images."'),
  "unified image Bottom Sheet copy is exact",
);
verify(
  layoutSource.indexOf("<PassportProvider>") < layoutSource.indexOf("<ImageIntakeProvider>") &&
    layoutSource.includes("<ImageIntakeProvider>{children}</ImageIntakeProvider>"),
  "root provider composition preserves Passport and adds image intake",
);
verify(
  !existsSync("src/components/home/UploadRestaurantAction.tsx"),
  "unreferenced fake screenshot component is removed",
);

// Menu Scan compatibility and ownership.
verify(menuScanSource.includes("useImageIntake"), "Menu Scan consumes transient intake context");
verify(
  menuScanSource.includes("window.setTimeout") &&
    menuScanSource.includes("consumePendingFiles()"),
  "handoff waits through Strict Mode setup before one-shot consumption",
);
verify(menuScanSource.includes("URL.createObjectURL(file)"), "Menu Scan owns preview object URLs");
verify(menuScanSource.includes("URL.revokeObjectURL"), "Menu Scan cleans preview object URLs");
verify(menuScanSource.includes("No images yet."), "direct Menu Scan keeps a valid empty state");
verify(menuScanSource.includes('title="Review images"'), "Menu Scan title is aligned");
verify(menuScanSource.includes("MAX_MENU_IMAGE_COUNT"), "Menu Scan retains shared ten-image limit");
verify(
  menuScanSource.includes('fetch("/api/analyze/menu-images"'),
  "existing T5 analysis API call remains wired",
);
verify(
  menuScanSource.includes("Images are used for this analysis only and are not stored permanently."),
  "existing transient-image privacy copy remains",
);
verify(menuScanSource.includes('aria-label={`Remove image ${index + 1}`}'), "remove labels use image numbering");
verify(menuScanSource.includes(': "Analyze menu"'), "analysis button copy remains honest");

globalThis.fetch = originalFetch;
verify(networkCalls === 0, "Home entry validation makes zero network calls");

console.log(`Foodseyo Home entry validation: ${passedChecks.length} checks passed.`);
