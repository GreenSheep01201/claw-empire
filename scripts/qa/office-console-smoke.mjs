#!/usr/bin/env node

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:9100";
const runLabel = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = process.env.QA_OUT_DIR ?? path.join("docs", "reports", "qa", "office-smoke", runLabel);

const consoleIssues = [];
const pageErrors = [];
const requestIssues = [];
const knownConsoleNoisePatterns = [
  /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i,
  /No available adapters\./i,
  /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/i,
];

function isKnownConsoleNoise(issueText) {
  return knownConsoleNoisePatterns.some((pattern) => pattern.test(issueText));
}

function maybeTrackRequestFailure(req) {
  const type = req.resourceType();
  const url = req.url();
  if (type === "image" && /favicon\.ico$/i.test(url)) return;
  requestIssues.push({
    type,
    url,
    error: req.failure()?.errorText ?? "unknown",
  });
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1728, height: 1080 } });

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleIssues.push({ type: msg.type(), text: msg.text() });
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push({ message: err.message, stack: err.stack ?? null });
  });

  page.on("requestfailed", maybeTrackRequestFailure);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const officeButton = page.getByRole("button", { name: /Office|오피스|オフィス|办公室/i }).first();
  if (await officeButton.isVisible().catch(() => false)) {
    await officeButton.click();
    await page.waitForLoadState("networkidle");
  }

  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(2000);

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

  const screenshotPath = path.join(outDir, "office-smoke.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const ignoredConsoleIssues = consoleIssues.filter((issue) => isKnownConsoleNoise(issue.text));
  const unexpectedConsoleIssues = consoleIssues.filter((issue) => !isKnownConsoleNoise(issue.text));

  const summary = {
    out_dir: outDir,
    base_url: baseUrl,
    canvas: canvasInfo,
    counts: {
      console_issues_total: consoleIssues.length,
      console_issues_unexpected: unexpectedConsoleIssues.length,
      console_issues_ignored: ignoredConsoleIssues.length,
      page_errors: pageErrors.length,
      request_failures: requestIssues.length,
    },
    console_issues_unexpected: unexpectedConsoleIssues,
    console_issues_ignored: ignoredConsoleIssues,
    page_errors: pageErrors,
    request_failures: requestIssues,
    artifacts: {
      screenshot: screenshotPath,
      summary_json: path.join(outDir, "summary.json"),
    },
  };

  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  await browser.close();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (
    summary.counts.console_issues_unexpected > 0 ||
    summary.counts.page_errors > 0 ||
    summary.counts.request_failures > 0
  ) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  process.stderr.write(`[office-smoke] ${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
