#!/usr/bin/env node

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:9100";
const runLabel = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = process.env.QA_OUT_DIR ?? path.join("docs", "reports", "qa", "office-resolution-compare", runLabel);

const knownConsoleNoisePatterns = [
  /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i,
  /No available adapters\./i,
  /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/i,
];

const viewportMatrix = [
  {
    id: "desktop-1280x720",
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    id: "desktop-1920x1080",
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    id: "mobile-375x812",
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
];

function isKnownConsoleNoise(issueText) {
  return knownConsoleNoisePatterns.some((pattern) => pattern.test(issueText));
}

function maybeTrackRequestFailure(store, req) {
  const type = req.resourceType();
  const url = req.url();
  if (type === "image" && /favicon\.ico$/i.test(url)) return;
  store.push({
    type,
    url,
    error: req.failure()?.errorText ?? "unknown",
  });
}

async function openOffice(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  const officeCanvas = page.locator("canvas").first();
  if (await officeCanvas.isVisible().catch(() => false)) {
    return;
  }
  const officeButton = page.getByRole("button", { name: /Office|오피스|オフィス|办公室/i }).first();
  if (await officeButton.isVisible().catch(() => false)) {
    await officeButton.click({ force: true });
    await page.waitForLoadState("networkidle");
  }
  await officeCanvas.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);
}

async function inspectViewport(browser, config) {
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.deviceScaleFactor,
    isMobile: config.isMobile,
    hasTouch: config.hasTouch,
  });
  const page = await context.newPage();

  const consoleIssues = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleIssues.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push({ message: err.message, stack: err.stack ?? null });
  });
  page.on("requestfailed", (req) => maybeTrackRequestFailure(requestFailures, req));

  await openOffice(page);

  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    return {
      width: canvas.width,
      height: canvas.height,
      css_width: canvas.clientWidth,
      css_height: canvas.clientHeight,
    };
  });

  const screenshotPath = path.join(outDir, `${config.id}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const consoleUnexpected = consoleIssues.filter((issue) => !isKnownConsoleNoise(issue.text));
  const consoleIgnored = consoleIssues.filter((issue) => isKnownConsoleNoise(issue.text));

  await context.close();

  return {
    id: config.id,
    viewport: {
      width: config.width,
      height: config.height,
      device_scale_factor: config.deviceScaleFactor,
      is_mobile: config.isMobile,
      has_touch: config.hasTouch,
    },
    canvas: canvasInfo,
    counts: {
      console_issues_total: consoleIssues.length,
      console_issues_unexpected: consoleUnexpected.length,
      console_issues_ignored: consoleIgnored.length,
      page_errors: pageErrors.length,
      request_failures: requestFailures.length,
    },
    console_issues_unexpected: consoleUnexpected,
    console_issues_ignored: consoleIgnored,
    page_errors: pageErrors,
    request_failures: requestFailures,
    artifacts: {
      screenshot: screenshotPath,
    },
  };
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const results = [];
  for (const config of viewportMatrix) {
    results.push(await inspectViewport(browser, config));
  }

  await browser.close();

  const aggregate = results.reduce(
    (acc, item) => {
      acc.console_issues_unexpected += item.counts.console_issues_unexpected;
      acc.page_errors += item.counts.page_errors;
      acc.request_failures += item.counts.request_failures;
      return acc;
    },
    { console_issues_unexpected: 0, page_errors: 0, request_failures: 0 },
  );

  const summary = {
    out_dir: outDir,
    base_url: baseUrl,
    generated_at: new Date().toISOString(),
    required_matrix: ["1280x720", "1920x1080", "375px mobile"],
    aggregate_counts: aggregate,
    viewports: results,
    artifacts: {
      summary_json: path.join(outDir, "summary.json"),
    },
  };

  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (aggregate.console_issues_unexpected > 0 || aggregate.page_errors > 0 || aggregate.request_failures > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  process.stderr.write(`[office-resolution-compare] ${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
