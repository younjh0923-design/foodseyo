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
const record = (name, passed, detail = "") => {
  checks.push({ name, passed, detail });
  if (!passed) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};
const checkOverflow = async (page, name) => {
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  record(name, sizes.scroll <= sizes.client + 1, JSON.stringify(sizes));
};

for (const viewport of [
  { name: "mobile-390", width: 390, height: 844, isMobile: true },
  { name: "desktop-1280", width: 1280, height: 900, isMobile: false },
]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`[${viewport.name}] ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`[${viewport.name}] ${error.message}`));
  await page.goto(baseURL, { waitUntil: "networkidle" });

  record(
    `${viewport.name} exact heading`,
    await page.getByRole("heading", { name: "Know what you’re ordering." }).isVisible(),
  );
  record(
    `${viewport.name} exact description`,
    await page.getByText("See the taste, texture, ingredients, and details behind every dish.", { exact: true }).isVisible(),
  );
  record(
    `${viewport.name} one menu CTA`,
    (await page.getByRole("button", { name: "Scan or upload a menu", exact: true }).count()) === 1,
  );
  record(
    `${viewport.name} supporting copy`,
    await page.getByText("Take or choose menu photos.", { exact: true }).isVisible(),
  );
  record(
    `${viewport.name} no Passport UI`,
    (await page.getByText(/Food Passport/i).count()) === 0,
  );
  const ctaBox = await page.getByRole("button", { name: "Scan or upload a menu" }).boundingBox();
  record(`${viewport.name} CTA touch target`, Boolean(ctaBox && ctaBox.height >= 44), JSON.stringify(ctaBox));
  await checkOverflow(page, `${viewport.name} no horizontal overflow`);
  await page.screenshot({ path: path.join(outputDir, `t5-5-home-${viewport.name}.png`), fullPage: true });
  await context.close();
}

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(`[flow] ${message.text()}`);
});
page.on("pageerror", (error) => consoleErrors.push(`[flow] ${error.message}`));
await page.goto(baseURL, { waitUntil: "networkidle" });

const input = page.locator('input[type="file"]');
record("Home has one hidden file input", (await input.count()) === 1 && !(await input.isVisible()));
record("native picker keeps multiple", await input.getAttribute("multiple") !== null);
record("native picker has no capture", await input.getAttribute("capture") === null);
record(
  "native picker accept is exact",
  (await input.getAttribute("accept")) === "image/jpeg,image/png,image/webp",
);

const cta = page.getByRole("button", { name: "Scan or upload a menu", exact: true });
await page.evaluate(() => {
  window.__foodseyoPickerActivated = false;
  const fileInput = document.querySelector('input[type="file"]');
  fileInput?.addEventListener(
    "click",
    (event) => {
      window.__foodseyoPickerActivated = true;
      event.preventDefault();
    },
    { once: true },
  );
});
await cta.focus();
await page.keyboard.press("Enter");
record(
  "keyboard activation reaches the file input",
  await page.evaluate(() => window.__foodseyoPickerActivated === true),
);
record("prevented picker leaves Home unchanged", page.url() === `${baseURL}/`);

await input.setInputFiles([
  { name: "menu-1.png", mimeType: "image/png", buffer: png },
  { name: "menu-2.png", mimeType: "image/png", buffer: png },
]);
await page.waitForURL(`${baseURL}/menu-scan`);
await page.getByRole("heading", { name: "2 images ready" }).waitFor({ state: "visible" });
record("valid native selection reaches Menu Scan", true);
record(
  "Menu Scan preserves selected order",
  (await page.getByText("Image 1", { exact: true }).count()) === 1 &&
    (await page.getByText("Image 2", { exact: true }).count()) === 1,
);
record("Menu Scan has one picker", (await page.locator('input[type="file"]').count()) === 1);
record("Menu Scan picker has no capture", await page.locator('input[type="file"]').getAttribute("capture") === null);
await checkOverflow(page, "Menu Scan no horizontal overflow at 390px");
await page.screenshot({ path: path.join(outputDir, "t5-5-menu-scan-390.png"), fullPage: true });

await page.goto(`${baseURL}/analysis`, { waitUntil: "networkidle" });
record(
  "Analysis recovery has no profile UI",
  (await page.getByText(/Food Passport/i).count()) === 0,
);
await checkOverflow(page, "Analysis recovery no horizontal overflow at 390px");
await page.screenshot({ path: path.join(outputDir, "t5-5-analysis-recovery-390.png"), fullPage: true });

await context.close();
record("browser console has zero errors", consoleErrors.length === 0, consoleErrors.join(" | "));
await browser.close();

const result = { passed: failures.length === 0, checks, failures, consoleErrors };
await fs.writeFile(path.join(outputDir, "mobile-qa-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
