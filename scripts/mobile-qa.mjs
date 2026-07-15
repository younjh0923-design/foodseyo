import { chromium } from "file:///C:/Users/younj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseURL = "http://127.0.0.1:3000";
const outputDir = fileURLToPath(new URL("../outputs/qa/", import.meta.url));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const failures = [];
const consoleErrors = [];
const checks = [];

function record(name, passed, detail = "") {
  checks.push({ name, passed, detail });
  if (!passed) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

async function expectVisible(locator, name) {
  try {
    await locator.waitFor({ state: "visible", timeout: 8_000 });
    record(name, true);
  } catch (error) {
    record(name, false, error.message.split("\n")[0]);
  }
}

async function checkOverflow(page, name) {
  const sizes = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  record(name, sizes.scroll <= sizes.client + 1, JSON.stringify(sizes));
}

for (const width of [320, 375, 390, 430]) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`[${width}] ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`[${width}] ${error.message}`));
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await expectVisible(page.getByRole("heading", { name: /Understand the menu/ }), `home hero visible at ${width}px`);
  record(`home has exactly four action cards at ${width}px`, (await page.locator('section[aria-labelledby="actions-title"] a, section[aria-labelledby="actions-title"] button').count()) === 4);
  await checkOverflow(page, `home has no horizontal overflow at ${width}px`);
  await page.screenshot({ path: path.join(outputDir, `home-${width}.png`), fullPage: true });
  for (const route of [
    "/menu-scan",
    "/nearby",
    "/restaurant/pai-northern-thai-kitchen",
    "/restaurant/pai-northern-thai-kitchen/dish/khao-soi",
  ]) {
    await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
    await checkOverflow(page, `${route} has no horizontal overflow at ${width}px`);
  }
  await context.close();
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, geolocation: { latitude: 43.6532, longitude: -79.3832 }, permissions: ["geolocation"] });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(`[flow] ${message.text()}`);
});
page.on("pageerror", (error) => consoleErrors.push(`[flow] ${error.message}`));

await page.goto(`${baseURL}/menu-scan`, { waitUntil: "networkidle" });
await expectVisible(page.getByRole("heading", { name: "No menu pages yet." }), "menu scan empty state");
record("zero-page analyze is disabled", await page.getByRole("button", { name: "Analyze 0 pages" }).isDisabled());
await page.locator('input[aria-label="Choose menu pages from photos"]').setInputFiles([
  { name: "menu-1.png", mimeType: "image/png", buffer: png },
  { name: "menu-2.png", mimeType: "image/png", buffer: png },
]);
await expectVisible(page.getByRole("heading", { name: "2 pages ready" }), "gallery appends two pages");
await page.getByRole("button", { name: "Remove menu page 1" }).click();
await expectVisible(page.getByRole("heading", { name: "1 page ready" }), "remove updates page count");
await page.locator('input[aria-label="Scan a menu page with the camera"]').setInputFiles({ name: "menu-3.png", mimeType: "image/png", buffer: png });
await expectVisible(page.getByRole("heading", { name: "2 pages ready" }), "camera selection appends without overwriting");
await page.getByRole("button", { name: "Preview menu page 1" }).click();
await expectVisible(page.getByRole("dialog", { name: "Menu page 1" }), "thumbnail opens preview");
await page.getByRole("button", { name: "Close Menu page 1" }).click();
await page.getByRole("button", { name: "Back to home" }).click();
await expectVisible(page.getByRole("alertdialog", { name: "Discard scanned pages?" }), "back with pages opens discard dialog");
await page.getByRole("button", { name: "Keep scanning" }).click();
await expectVisible(page.getByRole("heading", { name: "2 pages ready" }), "keep scanning retains pages");
await page.getByRole("button", { name: "Back to home" }).click();
await page.getByRole("button", { name: "Discard" }).click();
await page.waitForURL(`${baseURL}/`);
record("discard returns home", page.url() === `${baseURL}/`);

await page.locator('input[aria-label="Choose a restaurant screenshot"]').setInputFiles({ name: "restaurant.png", mimeType: "image/png", buffer: png });
await expectVisible(page.getByRole("dialog", { name: "Restaurant screen ready" }), "restaurant upload has independent confirmation");
record("restaurant upload does not navigate automatically", page.url() === `${baseURL}/`);
await page.getByRole("button", { name: "Close Restaurant screen ready" }).click();

const passportTrigger = page.getByRole("button", { name: "Food Passport" });
await passportTrigger.click();
await page.keyboard.press("Shift+Tab");
record(
  "Food Passport traps keyboard focus",
  await page.getByRole("dialog", { name: "Food Passport" }).evaluate((dialog) => dialog.contains(document.activeElement)),
);
await page.keyboard.press("Escape");
await page.getByRole("dialog", { name: "Food Passport" }).waitFor({ state: "hidden" });
record("Food Passport returns focus to trigger", await passportTrigger.evaluate((button) => button === document.activeElement));
await passportTrigger.click();
await page.getByRole("button", { name: "Peanuts" }).click();
await page.getByRole("button", { name: "Save passport" }).click();
await expectVisible(page.getByText(/Peanuts allergy/), "food passport summary updates on home");

await page.goto(`${baseURL}/nearby`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Use my location" }).click();
await expectVisible(page.getByRole("heading", { name: "Location ready" }), "nearby location success state");
await checkOverflow(page, "nearby has no horizontal overflow");

await page.goto(`${baseURL}/restaurant/pai-northern-thai-kitchen`, { waitUntil: "networkidle" });
await expectVisible(page.getByRole("heading", { name: "Representative dishes" }), "restaurant representative section");
await expectVisible(page.getByRole("heading", { name: "For you" }), "restaurant conditional For You section");
await expectVisible(page.getByRole("heading", { name: "All menu" }), "restaurant all menu section");
record("restaurant has no nonfunctional More control", (await page.getByRole("button", { name: /More restaurant/ }).count()) === 0);
await page.getByRole("button", { name: "Plan this meal" }).click();
await page.getByRole("button", { name: "Adventurous" }).click();
await page.getByRole("button", { name: "Share" }).click();
await page.getByRole("button", { name: "Recommend an order" }).click();
await expectVisible(page.getByText("Estimated total"), "meal planner returns typed recommendation");
await page.getByRole("button", { name: "Close Plan this meal" }).click();

await page.goto(`${baseURL}/restaurant/pai-northern-thai-kitchen/dish/khao-soi`, { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "Reviews" }).click();
await expectVisible(page.getByText(/Demo review evidence/), "reviews tab changes immediately");
await page.getByRole("tab", { name: "Dietary" }).click();
await expectVisible(page.getByText(/Foodseyo cannot guarantee allergy safety/), "exact allergy warning is present");
await page.getByRole("button", { name: "Create a question for staff" }).click();
await expectVisible(page.getByRole("dialog", { name: "Question for staff" }), "staff question sheet opens");
await page.getByRole("button", { name: "Close Question for staff" }).click();
await page.getByRole("button", { name: "Open AI Assistant" }).click();
for (const label of ["How spicy is this?", "Compare these dishes", "Best order for 2", "Ask about peanuts"]) {
  await expectVisible(page.getByRole("button", { name: label }), `assistant quick question: ${label}`);
}
await page.getByLabel("Ask anything about this restaurant").focus();
await page.screenshot({ path: path.join(outputDir, "dish-assistant-390.png"), fullPage: false });
await page.getByRole("button", { name: "Close AI Assistant" }).click();
await checkOverflow(page, "dish has no horizontal overflow");
await page.screenshot({ path: path.join(outputDir, "dish-390.png"), fullPage: true });

await context.close();
record("browser console has zero errors", consoleErrors.length === 0, consoleErrors.join(" | "));
await browser.close();

const result = { passed: failures.length === 0, checks, failures, consoleErrors };
await fs.writeFile(path.join(outputDir, "mobile-qa-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
