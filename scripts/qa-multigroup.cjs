const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.QA_URL || "http://127.0.0.1:5173/";
const apiOrigin = process.env.QA_API_ORIGIN || "https://vlsu-pi-124-schedule.polkin-06.workers.dev";
const outputDir = path.resolve("artifacts/qa/2026-09-15-multigroup");
fs.mkdirSync(outputDir, { recursive: true });

async function rect(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const value = element.getBoundingClientRect();
    return {
      top: Math.round(value.top * 10) / 10,
      right: Math.round(value.right * 10) / 10,
      bottom: Math.round(value.bottom * 10) / 10,
      left: Math.round(value.left * 10) / 10,
      width: Math.round(value.width * 10) / 10,
      height: Math.round(value.height * 10) / 10
    };
  });
}

(async () => {
  let browser;
  try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  const consoleIssues = [];
  const apiResponses = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleIssues.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.url().includes("/vlsu-api/")) apiResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.route("**/vlsu-api/**", async (route) => {
    const request = route.request();
    const localUrl = new URL(request.url());
    const response = await fetch(`${apiOrigin}${localUrl.pathname}${localUrl.search}`, {
      method: request.method(),
      headers: request.method() === "GET" || request.method() === "HEAD"
        ? undefined
        : { "Content-Type": request.headers()["content-type"] || "application/json" },
      body: request.method() === "GET" || request.method() === "HEAD" ? undefined : request.postData()
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: Buffer.from(await response.arrayBuffer())
    });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".group-picker-sheet").waitFor();
  try {
    await page.locator(".group-picker-row:not(.group-row)").first().waitFor({ timeout: 15_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, "00-first-run-failure.png"), fullPage: false });
    console.error(JSON.stringify({ apiResponses, consoleIssues, text: (await page.locator("body").innerText()).slice(0, 1200) }, null, 2));
    throw error;
  }
  await page.screenshot({ path: path.join(outputDir, "01-first-run-402x874.png"), fullPage: false });

  const pickerRect = await rect(page, ".group-picker-sheet");
  const firstRun = {
    viewport: await page.evaluate(() => ({ innerWidth, innerHeight })),
    picker: pickerRect,
    instituteCount: await page.locator(".group-picker-row:not(.group-row)").count(),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  };

  await page.getByRole("button", { name: /ИИТЭ.*Институт информационных технологий/i }).click();
  const search = page.locator(".group-picker-search input");
  await search.fill("ПИ-124");
  await page.getByRole("button", { name: /ПИ-124.*3 курс/i }).click();
  await page.waitForFunction(() => document.title.startsWith("ПИ-124"));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(outputDir, "02-today-402x874.png"), fullPage: false });

  const mobile402 = {
    nav: await rect(page, ".bottom-nav"),
    shell: await rect(page, ".app-shell"),
    frame: await rect(page, ".phone-frame"),
    content: await rect(page, ".content-scroll"),
    navGap: await page.locator(".bottom-nav").evaluate((element) => Math.round((innerHeight - element.getBoundingClientRect().bottom) * 10) / 10),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  };

  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, "03-today-430x932.png"), fullPage: false });
  const mobile430 = {
    nav: await rect(page, ".bottom-nav"),
    navGap: await page.locator(".bottom-nav").evaluate((element) => Math.round((innerHeight - element.getBoundingClientRect().bottom) * 10) / 10),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  };

  await page.getByRole("button", { name: "Неделя", exact: true }).click();
  await page.locator(".week-view").waitFor();
  await page.screenshot({ path: path.join(outputDir, "04-week-430x932.png"), fullPage: false });

  await page.setViewportSize({ width: 874, height: 402 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, "05-week-landscape-874x402.png"), fullPage: false });
  const landscape = {
    nav: await rect(page, ".bottom-nav"),
    content: await rect(page, ".content-scroll"),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  };

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, "06-week-desktop-1280x800.png"), fullPage: false });
  const desktop = {
    frame: await rect(page, ".phone-frame"),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  };

  const result = {
    firstRun,
    mobile402,
    mobile430,
    landscape,
    desktop,
    weekDayCards: await page.locator(".day-block").count(),
    consoleIssues,
    apiResponses
  };
  fs.writeFileSync(path.join(outputDir, "metrics.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await browser?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
