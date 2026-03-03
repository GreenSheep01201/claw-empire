#!/usr/bin/env node

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:9100";
const DEFAULT_DURATION_MS = 30_000;
const DEFAULT_MIN_AVG_FPS = 55;
const DEFAULT_MAX_AVG_JS_HEAP_MIB = 120;

const baseUrl = process.env.QA_BASE_URL ?? DEFAULT_BASE_URL;
const durationMs = Number.parseInt(process.env.QA_DURATION_MS ?? `${DEFAULT_DURATION_MS}`, 10);
const minAvgFps = Number.parseFloat(process.env.QA_MIN_AVG_FPS ?? `${DEFAULT_MIN_AVG_FPS}`);
const maxAvgJsHeapMiB = Number.parseFloat(process.env.QA_MAX_AVG_JS_HEAP_MIB ?? `${DEFAULT_MAX_AVG_JS_HEAP_MIB}`);
const enableTrace = /^(1|true|yes)$/i.test(String(process.env.QA_ENABLE_TRACE ?? "0"));
const runHeadless = !/^(0|false|no)$/i.test(String(process.env.QA_HEADLESS ?? "1"));
const runLabel = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = process.env.QA_OUT_DIR ?? path.join("docs", "reports", "qa", "office-performance-baseline", runLabel);

const traceCategories = [
  "-*",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-memory-infra",
  "disabled-by-default-gpu.service",
  "disabled-by-default-v8.gc",
].join(",");

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toMiB(bytes) {
  return bytes / (1024 * 1024);
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function evaluateThresholds({ avgFps, avgJsHeapMiB, minFps, maxJsHeapMiB }) {
  const checks = {
    avg_fps: {
      actual: avgFps,
      op: ">=",
      expected: minFps,
      pass: avgFps != null && Number.isFinite(avgFps) ? avgFps >= minFps : false,
    },
    avg_js_heap_mib: {
      actual: avgJsHeapMiB,
      op: "<=",
      expected: maxJsHeapMiB,
      pass: avgJsHeapMiB != null && Number.isFinite(avgJsHeapMiB) ? avgJsHeapMiB <= maxJsHeapMiB : false,
    },
  };
  return {
    pass: Object.values(checks).every((check) => check.pass),
    checks,
  };
}

async function readCdpStream(cdp, handle) {
  let output = "";
  while (true) {
    const chunk = await cdp.send("IO.read", { handle });
    if (chunk.data) output += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle });
  return output;
}

function buildSummary({
  startedAt,
  endedAt,
  sampling,
  gpuBytes,
  traceEnabled,
  baseUrl: runBaseUrl,
  durationMs: runDurationMs,
  outDir: runOutDir,
  minFps,
  maxJsHeapMiB,
}) {
  const fpsValues = sampling.samples.map((sample) => sample.fps).filter((value) => Number.isFinite(value));
  const heapValues = sampling.samples
    .map((sample) => sample.js_heap_used_bytes)
    .filter((value) => Number.isFinite(value));
  const gpuValues = gpuBytes.filter((value) => Number.isFinite(value));

  const avgFps = mean(fpsValues);
  const avgHeapBytes = mean(heapValues);
  const avgGpuBytes = mean(gpuValues);
  const avgJsHeapMiB = avgHeapBytes == null ? null : toMiB(avgHeapBytes);
  const gates = evaluateThresholds({
    avgFps,
    avgJsHeapMiB,
    minFps,
    maxJsHeapMiB,
  });

  return {
    meta: {
      started_at: startedAt,
      ended_at: endedAt,
      base_url: runBaseUrl,
      headless: runHeadless,
      duration_ms_requested: runDurationMs,
      duration_ms_actual: sampling.duration_ms,
      output_dir: runOutDir,
    },
    metrics: {
      avg_fps: round(avgFps, 2),
      avg_js_heap_mib: round(avgJsHeapMiB, 2),
      avg_gpu_memory_mib: round(avgGpuBytes == null ? null : toMiB(avgGpuBytes), 2),
      max_gpu_memory_mib: round(gpuValues.length ? toMiB(Math.max(...gpuValues)) : null, 2),
      sample_count: {
        fps: fpsValues.length,
        js_heap: heapValues.length,
        gpu_memory: gpuValues.length,
      },
    },
    notes: {
      memory_api_available: sampling.memory_api_available,
      gpu_metric_source: traceEnabled
        ? "CDP trace event `GPUTask.args.data.used_bytes` sampled from devtools timeline"
        : "disabled (set QA_ENABLE_TRACE=1 to collect GPU memory trace samples)",
    },
    gates: {
      pass: gates.pass,
      checks: {
        avg_fps: {
          ...gates.checks.avg_fps,
          actual: round(gates.checks.avg_fps.actual, 2),
          expected: round(gates.checks.avg_fps.expected, 2),
        },
        avg_js_heap_mib: {
          ...gates.checks.avg_js_heap_mib,
          actual: round(gates.checks.avg_js_heap_mib.actual, 2),
          expected: round(gates.checks.avg_js_heap_mib.expected, 2),
        },
      },
    },
    samples: {
      timeline: sampling.samples,
      gpu_memory_bytes: gpuValues,
    },
    artifacts: {
      office_screenshot: path.join(runOutDir, "office-tab.png"),
      metrics_overlay_screenshot: path.join(runOutDir, "office-metrics-overlay.png"),
      summary_json: path.join(runOutDir, "summary.json"),
    },
  };
}

async function run() {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(`QA_DURATION_MS must be a positive integer, got: ${durationMs}`);
  }
  if (!Number.isFinite(minAvgFps) || minAvgFps <= 0) {
    throw new Error(`QA_MIN_AVG_FPS must be a positive number, got: ${minAvgFps}`);
  }
  if (!Number.isFinite(maxAvgJsHeapMiB) || maxAvgJsHeapMiB <= 0) {
    throw new Error(`QA_MAX_AVG_JS_HEAP_MIB must be a positive number, got: ${maxAvgJsHeapMiB}`);
  }

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: runHeadless,
    args: [
      "--enable-precise-memory-info",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1728, height: 1080 },
  });
  const page = await context.newPage();
  let cdp = null;
  if (enableTrace) {
    cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Tracing.start", {
      transferMode: "ReturnAsStream",
      categories: traceCategories,
    });
  }

  const startedAt = new Date().toISOString();

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  const officeButton = page.getByRole("button", { name: /Office|오피스|オフィス|办公室/i }).first();
  if (await officeButton.isVisible().catch(() => false)) {
    await officeButton.click();
    await page.waitForLoadState("networkidle");
  }
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(5_000);
  await page.screenshot({
    path: path.join(outDir, "office-tab.png"),
    fullPage: true,
  });

  const sampling = await page.evaluate(
    async ({ runDurationMs }) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const hasMemoryApi = typeof performance !== "undefined" && "memory" in performance && performance.memory != null;

      const readHeap = () => {
        if (!hasMemoryApi) return { used: null, total: null };
        const memory = performance.memory;
        return {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
        };
      };

      let frameCount = 0;
      let rafId = 0;
      const onFrame = () => {
        frameCount += 1;
        rafId = window.requestAnimationFrame(onFrame);
      };
      rafId = window.requestAnimationFrame(onFrame);

      const samples = [];
      const start = performance.now();
      let prevSampleAt = start;
      let prevFrameCount = 0;

      while (performance.now() - start < runDurationMs) {
        await sleep(1_000);
        const now = performance.now();
        const elapsedSec = Math.max((now - prevSampleAt) / 1_000, 0.001);
        const framesDelta = frameCount - prevFrameCount;
        const heap = readHeap();

        samples.push({
          t_ms: Math.round(now - start),
          fps: framesDelta / elapsedSec,
          js_heap_used_bytes: heap.used,
          js_heap_total_bytes: heap.total,
        });

        prevSampleAt = now;
        prevFrameCount = frameCount;
      }

      window.cancelAnimationFrame(rafId);

      return {
        duration_ms: Math.round(performance.now() - start),
        total_frames: frameCount,
        memory_api_available: hasMemoryApi,
        samples,
      };
    },
    { runDurationMs: durationMs },
  );

  let gpuBytes = [];
  if (enableTrace && cdp) {
    const tracingComplete = new Promise((resolve) => {
      cdp.once("Tracing.tracingComplete", resolve);
    });
    await cdp.send("Tracing.end");
    const { stream } = await tracingComplete;
    const trace = await readCdpStream(cdp, stream);
    const traceJson = JSON.parse(trace);
    const traceEvents = Array.isArray(traceJson.traceEvents) ? traceJson.traceEvents : [];

    gpuBytes = traceEvents
      .filter((event) => event?.name === "GPUTask")
      .map((event) => event?.args?.data?.used_bytes)
      .filter((value) => Number.isFinite(value));
  }

  const endedAt = new Date().toISOString();
  const summary = buildSummary({
    startedAt,
    endedAt,
    sampling,
    gpuBytes,
    traceEnabled: enableTrace,
    baseUrl,
    durationMs,
    outDir,
    minFps: minAvgFps,
    maxJsHeapMiB: maxAvgJsHeapMiB,
  });

  await page.evaluate((metrics) => {
    const overlayId = "__qa_metrics_overlay__";
    const existing = document.getElementById(overlayId);
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.style.position = "fixed";
    overlay.style.top = "16px";
    overlay.style.right = "16px";
    overlay.style.zIndex = "2147483647";
    overlay.style.maxWidth = "380px";
    overlay.style.background = "rgba(15, 23, 42, 0.88)";
    overlay.style.border = "1px solid rgba(148, 163, 184, 0.35)";
    overlay.style.borderRadius = "12px";
    overlay.style.padding = "12px 14px";
    overlay.style.color = "#e2e8f0";
    overlay.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    overlay.style.fontSize = "12px";
    overlay.style.lineHeight = "1.45";
    overlay.style.backdropFilter = "blur(4px)";

    const lines = [
      "Office Baseline (30s)",
      `avg FPS: ${metrics.avg_fps ?? "N/A"}`,
      `avg GPU MiB: ${metrics.avg_gpu_memory_mib ?? "N/A"}`,
      `avg JS Heap MiB: ${metrics.avg_js_heap_mib ?? "N/A"}`,
      `samples (fps/heap/gpu): ${metrics.sample_count.fps}/${metrics.sample_count.js_heap}/${metrics.sample_count.gpu_memory}`,
    ];

    overlay.innerText = lines.join("\n");
    document.body.appendChild(overlay);
  }, summary.metrics);

  await page.screenshot({
    path: path.join(outDir, "office-metrics-overlay.png"),
    fullPage: true,
  });

  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  await browser.close();

  process.stdout.write(
    `${JSON.stringify(
      {
        out_dir: outDir,
        gates_pass: summary.gates.pass,
        avg_fps: summary.metrics.avg_fps,
        avg_gpu_memory_mib: summary.metrics.avg_gpu_memory_mib,
        avg_js_heap_mib: summary.metrics.avg_js_heap_mib,
        thresholds: {
          min_avg_fps: minAvgFps,
          max_avg_js_heap_mib: maxAvgJsHeapMiB,
        },
        sample_count: summary.metrics.sample_count,
      },
      null,
      2,
    )}\n`,
  );

  if (!summary.gates.pass) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  process.stderr.write(`[office-performance-baseline] ${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
