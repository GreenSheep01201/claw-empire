#!/usr/bin/env node

import { chromium } from "playwright";
import sharp from "sharp";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:8810";
const runHeadless = !/^(0|false|no)$/i.test(String(process.env.QA_HEADLESS ?? "1"));
const runLabel = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = process.env.QA_OUT_DIR ?? path.join("docs", "reports", "qa", "office-theme-requirements", runLabel);

const officeManagerNameRe = /Office Manager|사무실 관리|オフィス管理|办公室管理/i;
const themeSignalRe = /theme|mode|dark|light|sun|moon|라이트|다크|테마|햇님|달님|☀|🌙/i;
const themeStorageRe = /theme|mode/i;
const themeValueRe = /dark|light|night|day|라이트|다크|낮|심야/i;
const tasksViewLabelRe = /업무 관리|Tasks|タスク管理|任务管理/i;
const dashboardViewLabelRe = /대시보드|Dashboard|ダッシュボード|仪表盘/i;
const terminalOutputButtonRe = /터미널 출력 보기|View terminal output|ターミナル出力を見る|查看终端输出/i;
const terminalTabLabelRe = /터미널|Terminal|ターミナル|终端/i;
const TERMINAL_PANEL_CONTAINER_SELECTOR = "div.fixed.inset-0.z-50";
const THEME_STORAGE_KEY = "climpire_theme";
const WCAG_AA_MIN_CONTRAST = 4.5;
const MAX_TEXT_ELEMENTS_PER_VIEW = 1800;
const MAX_DOM_ELEMENTS_PER_VIEW = 6000;
const SIDEBAR_VIEW_SCAN_LIMIT = 5;
const UI_REACTION_DELTA_MIN = 8;
const CRITICAL_CONTRAST_MIN = 3;

function buildCheck(id, pass, details = {}) {
  return { id, pass, details };
}

function classifyContrastSeverity(minContrastRatio) {
  if (typeof minContrastRatio !== "number") return "HIGH";
  if (minContrastRatio < CRITICAL_CONTRAST_MIN) return "CRITICAL";
  if (minContrastRatio < WCAG_AA_MIN_CONTRAST) return "HIGH";
  return "LOW";
}

function resolveCheckSeverity(check) {
  if (check.pass) return "PASS";

  if (
    check.id === "wcag_aa_contrast_45_dark_theme_all_text" ||
    check.id === "wcag_aa_contrast_45_light_theme_all_text" ||
    check.id === "dashboard_light_mode_contrast_focus" ||
    check.id === "terminal_panel_light_mode_contrast"
  ) {
    return classifyContrastSeverity(check.details?.min_contrast_ratio);
  }

  if (
    check.id === "office_manager_button_visible" ||
    check.id === "theme_toggle_right_of_office_manager" ||
    check.id === "theme_toggle_changes_theme_state" ||
    check.id === "theme_persisted_to_localstorage" ||
    check.id === "theme_persists_after_hard_refresh"
  ) {
    return "CRITICAL";
  }

  if (
    check.id === "theme_toggle_uses_sun_moon_representation" ||
    check.id === "global_ui_reacts_to_theme_toggle" ||
    check.id === "office_manager_button_reacts_to_theme_toggle" ||
    check.id === "office_canvas_tone_changes_between_dark_and_light" ||
    check.id === "terminal_panel_reacts_to_dark_light"
  ) {
    return "HIGH";
  }

  return "MEDIUM";
}

function buildSeverityCounts(checks) {
  return checks.reduce(
    (acc, check) => {
      const key = check.severity;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, PASS: 0 },
  );
}

function renderFindingLine(check) {
  if (
    check.id === "wcag_aa_contrast_45_dark_theme_all_text" ||
    check.id === "wcag_aa_contrast_45_light_theme_all_text" ||
    check.id === "dashboard_light_mode_contrast_focus" ||
    check.id === "terminal_panel_light_mode_contrast"
  ) {
    return [
      `- [${check.severity}] ${check.id}`,
      `  - min_ratio: ${check.details?.min_contrast_ratio ?? "n/a"}`,
      `  - failing/sampled: ${check.details?.failing_text_nodes ?? "n/a"}/${check.details?.sampled_text_nodes ?? "n/a"}`,
    ].join("\n");
  }
  if (check.id === "office_manager_button_reacts_to_theme_toggle") {
    return [
      `- [${check.severity}] ${check.id}`,
      `  - background_delta: ${check.details?.office_button_background_delta ?? "n/a"}`,
      `  - color_delta: ${check.details?.office_button_color_delta ?? "n/a"}`,
    ].join("\n");
  }
  if (check.id === "terminal_panel_reacts_to_dark_light") {
    return [
      `- [${check.severity}] ${check.id}`,
      `  - background_delta: ${check.details?.panel_background_delta ?? "n/a"}`,
      `  - color_delta: ${check.details?.panel_text_color_delta ?? "n/a"}`,
    ].join("\n");
  }
  return `- [${check.severity}] ${check.id}`;
}

function buildMarkdownReport(summary) {
  const criticalHigh = summary.failed_checks.filter(
    (check) => check.severity === "CRITICAL" || check.severity === "HIGH",
  );
  const mediumLow = summary.failed_checks.filter((check) => check.severity === "MEDIUM" || check.severity === "LOW");

  const criticalHighLines =
    criticalHigh.length > 0 ? criticalHigh.map((check) => renderFindingLine(check)).join("\n") : "- none";
  const mediumLowLines =
    mediumLow.length > 0 ? mediumLow.map((check) => renderFindingLine(check)).join("\n") : "- none";

  return [
    "# Office Theme QA Report",
    "",
    `- Generated at: ${summary.generated_at}`,
    `- Base URL: ${summary.base_url}`,
    `- Result: ${summary.execution.result}`,
    `- Checks: ${summary.check_counts.passed}/${summary.check_counts.total} passed`,
    "",
    "## Immediate Fix (CRITICAL/HIGH)",
    criticalHighLines,
    "",
    "## Warning Only (MEDIUM/LOW)",
    mediumLowLines,
    "",
    "## Severity Counts",
    `- CRITICAL: ${summary.severity_counts.CRITICAL}`,
    `- HIGH: ${summary.severity_counts.HIGH}`,
    `- MEDIUM: ${summary.severity_counts.MEDIUM}`,
    `- LOW: ${summary.severity_counts.LOW}`,
    `- PASS: ${summary.severity_counts.PASS}`,
    "",
    "## Artifacts",
    `- summary_json: ${summary.artifacts.summary_json}`,
    `- pre_toggle_screenshot: ${summary.artifacts.pre_toggle_screenshot}`,
    `- post_toggle_screenshot: ${summary.artifacts.post_toggle_screenshot}`,
    `- post_reload_screenshot: ${summary.artifacts.post_reload_screenshot}`,
  ].join("\n");
}

function parseRgb(color) {
  if (typeof color !== "string") return null;
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

function colorDistance(a, b) {
  const p1 = parseRgb(a);
  const p2 = parseRgb(b);
  if (!p1 || !p2) return 0;
  return Math.sqrt((p1.r - p2.r) ** 2 + (p1.g - p2.g) ** 2 + (p1.b - p2.b) ** 2);
}

function extractThemeStorage(storage) {
  return Object.fromEntries(
    Object.entries(storage ?? {}).filter(([key, value]) => {
      if (themeStorageRe.test(key)) return true;
      return typeof value === "string" && themeValueRe.test(value);
    }),
  );
}

function hasThemePersistValue(storageEntries) {
  return Object.entries(storageEntries).some(([key, value]) => {
    if (themeStorageRe.test(key) && typeof value === "string" && themeValueRe.test(value)) return true;
    return false;
  });
}

function hasStorageChanged(before, after) {
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);
  if (beforeKeys.length !== afterKeys.length) return true;
  const keySet = new Set([...beforeKeys, ...afterKeys]);
  for (const key of keySet) {
    if ((before[key] ?? null) !== (after[key] ?? null)) return true;
  }
  return false;
}

function normalizeThemeValue(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "dark") return "dark";
  if (normalized === "light") return "light";
  return null;
}

function resolveStoredTheme(storageEntries) {
  for (const [key, value] of Object.entries(storageEntries ?? {})) {
    if (!themeStorageRe.test(key) || typeof value !== "string") continue;
    const normalized = normalizeThemeValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function computeLuminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function analyzeRegionTone(imagePath, box) {
  if (!box) return null;
  const meta = await sharp(imagePath).metadata();
  const imageW = meta.width ?? 0;
  const imageH = meta.height ?? 0;
  if (!imageW || !imageH) return null;

  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const maxWidth = Math.max(0, imageW - left);
  const maxHeight = Math.max(0, imageH - top);
  const width = Math.max(1, Math.min(maxWidth, Math.floor(box.width)));
  const height = Math.max(1, Math.min(maxHeight, Math.floor(box.height)));
  if (!width || !height) return null;

  const stats = await sharp(imagePath).extract({ left, top, width, height }).stats();

  const [red, green, blue] = stats.channels.map((ch) => ch.mean);
  return {
    red,
    green,
    blue,
    luminance: computeLuminance(red, green, blue),
    region: { left, top, width, height },
  };
}

async function collectHeaderButtons(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("header button")).map((button, idx) => {
      const rect = button.getBoundingClientRect();
      return {
        idx,
        text: (button.textContent ?? "").trim(),
        ariaLabel: button.getAttribute("aria-label") ?? "",
        html: (button.innerHTML ?? "").slice(0, 180),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    });
  });
}

async function collectUiState(page) {
  return page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const header = document.querySelector("header");
    const officeButton = Array.from(document.querySelectorAll("header button")).find((button) =>
      /Office Manager|사무실 관리|オフィス管理|办公室管理/i.test(button.textContent ?? ""),
    );

    const readStyles = (el) => {
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        background: style.backgroundColor,
        color: style.color,
        border: style.borderColor,
      };
    };

    const storage = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        storage[key] = localStorage.getItem(key) ?? "";
      }
    } catch {
      // ignore storage read errors
    }

    return {
      attrs: {
        htmlClass: html.className,
        bodyClass: body.className,
        htmlDataTheme: html.getAttribute("data-theme"),
        bodyDataTheme: body.getAttribute("data-theme"),
        rootDataTheme: document.querySelector("#root")?.getAttribute("data-theme") ?? null,
      },
      styles: {
        body: readStyles(body),
        header: readStyles(header),
        officeButton: readStyles(officeButton),
      },
      storage,
    };
  });
}

async function ensureTheme(page, desiredTheme, toggleLocator, onTrace = null) {
  if (onTrace) await onTrace(`ensureTheme:start:${desiredTheme}`);
  let finalTheme = normalizeThemeValue(await page.evaluate(() => document.documentElement.getAttribute("data-theme")));
  let togglesUsed = 0;

  while (finalTheme !== desiredTheme && toggleLocator && togglesUsed < 2) {
    await toggleLocator.click({ timeout: 5_000 });
    await waitForAppSettled(page);
    togglesUsed += 1;
    if (onTrace) await onTrace(`ensureTheme:toggle:${desiredTheme}:attempt=${togglesUsed}`);
    finalTheme = normalizeThemeValue(await page.evaluate(() => document.documentElement.getAttribute("data-theme")));
  }

  if (onTrace) await onTrace(`ensureTheme:done:${desiredTheme}:final=${finalTheme ?? "null"}`);
  return {
    requested_theme: desiredTheme,
    final_theme: finalTheme,
    toggles_used: togglesUsed,
    matched: finalTheme === desiredTheme,
  };
}

async function collectCurrentViewContrast(page, minimumContrast, maxSamplesPerView) {
  return page.evaluate(
    ({ minContrast, maxSamples, maxDomElements }) => {
      const textSignalRe = /[A-Za-z0-9가-힣ぁ-んァ-ヶ一-龯]/;
      const skipTagSet = new Set(["script", "style", "noscript"]);

      const parseColor = (raw) => {
        if (typeof raw !== "string") return null;
        const value = raw.trim().toLowerCase();
        if (!value) return null;
        if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

        const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/);
        if (rgbMatch) {
          const parts = rgbMatch[1].split(",").map((part) => part.trim());
          if (parts.length < 3) return null;
          return {
            r: Number(parts[0]),
            g: Number(parts[1]),
            b: Number(parts[2]),
            a: parts[3] === undefined ? 1 : Number(parts[3]),
          };
        }

        const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
        if (!hexMatch) return null;
        const hex = hexMatch[1];
        if (hex.length === 3) {
          return {
            r: Number.parseInt(`${hex[0]}${hex[0]}`, 16),
            g: Number.parseInt(`${hex[1]}${hex[1]}`, 16),
            b: Number.parseInt(`${hex[2]}${hex[2]}`, 16),
            a: 1,
          };
        }
        if (hex.length === 6 || hex.length === 8) {
          return {
            r: Number.parseInt(hex.slice(0, 2), 16),
            g: Number.parseInt(hex.slice(2, 4), 16),
            b: Number.parseInt(hex.slice(4, 6), 16),
            a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
          };
        }
        return null;
      };

      const clamp = (num, min, max) => Math.max(min, Math.min(max, num));
      const normalizedChannel = (value) => clamp(Number.isFinite(value) ? value : 0, 0, 255);
      const normalizedAlpha = (value) => clamp(Number.isFinite(value) ? value : 1, 0, 1);

      const blend = (foreground, background) => {
        const fgA = normalizedAlpha(foreground.a);
        const bgA = normalizedAlpha(background.a);
        const outA = fgA + bgA * (1 - fgA);
        if (outA <= 0) return { r: 0, g: 0, b: 0, a: 0 };

        return {
          r: (normalizedChannel(foreground.r) * fgA + normalizedChannel(background.r) * bgA * (1 - fgA)) / outA,
          g: (normalizedChannel(foreground.g) * fgA + normalizedChannel(background.g) * bgA * (1 - fgA)) / outA,
          b: (normalizedChannel(foreground.b) * fgA + normalizedChannel(background.b) * bgA * (1 - fgA)) / outA,
          a: outA,
        };
      };

      const srgbToLinear = (channel) => {
        const c = normalizedChannel(channel) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };

      const luminance = (color) =>
        0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b);

      const contrastRatio = (fg, bg) => {
        const fgLum = luminance(fg);
        const bgLum = luminance(bg);
        const bright = Math.max(fgLum, bgLum);
        const dark = Math.min(fgLum, bgLum);
        return (bright + 0.05) / (dark + 0.05);
      };

      const toColorText = (color) =>
        `rgba(${Math.round(normalizedChannel(color.r))},` +
        `${Math.round(normalizedChannel(color.g))},` +
        `${Math.round(normalizedChannel(color.b))},` +
        `${normalizedAlpha(color.a).toFixed(3)})`;

      const isVisible = (el) => {
        let node = el;
        while (node && node instanceof Element) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
            return false;
          }
          node = node.parentElement;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const fallbackBackground = (() => {
        const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
        if (bodyBg && bodyBg.a > 0) return bodyBg;
        const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
        if (htmlBg && htmlBg.a > 0) return htmlBg;
        return { r: 255, g: 255, b: 255, a: 1 };
      })();

      const getEffectiveBackground = (el) => {
        const layers = [];
        let node = el;
        while (node && node instanceof Element) {
          const bg = parseColor(getComputedStyle(node).backgroundColor);
          if (bg && bg.a > 0) layers.push(bg);
          node = node.parentElement;
        }
        let composite = fallbackBackground;
        for (let idx = layers.length - 1; idx >= 0; idx -= 1) {
          composite = blend(layers[idx], composite);
        }
        return composite;
      };

      const violations = [];
      let sampledCount = 0;
      let failingCount = 0;
      let minRatio = Number.POSITIVE_INFINITY;
      let worstViolation = null;
      let truncated = false;
      let processedElements = 0;

      const elements = Array.from(document.querySelectorAll("body *"));
      for (const el of elements) {
        processedElements += 1;
        if (processedElements > maxDomElements) {
          truncated = true;
          break;
        }

        if (!(el instanceof HTMLElement)) continue;
        if (skipTagSet.has(el.tagName.toLowerCase())) continue;
        if (!isVisible(el)) continue;
        if (el.getClientRects().length === 0) continue;

        const directText = Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        if (!directText || !textSignalRe.test(directText)) continue;

        const fg = parseColor(getComputedStyle(el).color);
        if (!fg) continue;
        const bg = getEffectiveBackground(el);
        const ratio = contrastRatio(fg, bg);
        const roundedRatio = Number(ratio.toFixed(3));

        sampledCount += 1;
        if (sampledCount >= maxSamples) {
          truncated = true;
          break;
        }

        if (ratio < minRatio) {
          minRatio = ratio;
          worstViolation = {
            text: directText.slice(0, 140),
            ratio: roundedRatio,
            tag: el.tagName.toLowerCase(),
            class_name: (el.className ?? "").toString().slice(0, 140),
            fg: toColorText(fg),
            bg: toColorText(bg),
          };
        }

        if (ratio < minContrast) {
          failingCount += 1;
          if (violations.length < 40) {
            violations.push({
              text: directText.slice(0, 140),
              ratio: roundedRatio,
              tag: el.tagName.toLowerCase(),
              class_name: (el.className ?? "").toString().slice(0, 140),
              fg: toColorText(fg),
              bg: toColorText(bg),
            });
          }
        }
      }

      return {
        theme: document.documentElement.getAttribute("data-theme"),
        sampled_text_nodes: sampledCount,
        failing_text_nodes: failingCount,
        min_contrast_ratio: Number.isFinite(minRatio) ? Number(minRatio.toFixed(3)) : null,
        truncated,
        processed_elements: processedElements,
        max_dom_elements: maxDomElements,
        max_samples: maxSamples,
        worst_violation: worstViolation,
        violations,
      };
    },
    {
      minContrast: minimumContrast,
      maxSamples: maxSamplesPerView,
      maxDomElements: MAX_DOM_ELEMENTS_PER_VIEW,
    },
  );
}

async function collectThemeContrastAcrossViews(page, desiredTheme, toggleLocator, onTrace = null) {
  const themeReady = await ensureTheme(page, desiredTheme, toggleLocator, onTrace);
  const navButtons = page.locator("aside nav button");
  const navCount = await navButtons.count().catch(() => 0);
  const scanCount = Math.min(navCount, SIDEBAR_VIEW_SCAN_LIMIT);
  const viewAudits = [];
  if (onTrace) await onTrace(`contrast:start:${desiredTheme}:navCount=${navCount}:scanCount=${scanCount}`);

  if (scanCount > 0) {
    for (let idx = 0; idx < scanCount; idx += 1) {
      const navButton = navButtons.nth(idx);
      const viewLabel =
        ((await navButton.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim() || `nav-${idx + 1}`;

      await navButton.click({ timeout: 5_000 }).catch(() => {});
      await waitForAppSettled(page, 1_500, 300);
      const viewContrast = await collectCurrentViewContrast(page, WCAG_AA_MIN_CONTRAST, MAX_TEXT_ELEMENTS_PER_VIEW);
      if (onTrace) {
        await onTrace(
          `contrast:view:${desiredTheme}:idx=${idx}:sampled=${viewContrast.sampled_text_nodes}:failed=${viewContrast.failing_text_nodes}:truncated=${viewContrast.truncated}`,
        );
      }
      viewAudits.push({
        view_index: idx,
        view_label: viewLabel,
        ...viewContrast,
      });
    }
  } else {
    const fallbackViewContrast = await collectCurrentViewContrast(
      page,
      WCAG_AA_MIN_CONTRAST,
      MAX_TEXT_ELEMENTS_PER_VIEW,
    );
    viewAudits.push({
      view_index: 0,
      view_label: "default-view",
      ...fallbackViewContrast,
    });
    if (onTrace) {
      await onTrace(
        `contrast:view:${desiredTheme}:idx=0:sampled=${fallbackViewContrast.sampled_text_nodes}:failed=${fallbackViewContrast.failing_text_nodes}:truncated=${fallbackViewContrast.truncated}`,
      );
    }
  }

  const sampledTextNodes = viewAudits.reduce((sum, view) => sum + view.sampled_text_nodes, 0);
  const failingTextNodes = viewAudits.reduce((sum, view) => sum + view.failing_text_nodes, 0);
  const isTruncated = viewAudits.some((view) => view.truncated);
  const minContrastValues = viewAudits
    .map((view) => view.min_contrast_ratio)
    .filter((ratio) => typeof ratio === "number");
  const minContrastRatio = minContrastValues.length > 0 ? Number(Math.min(...minContrastValues).toFixed(3)) : null;

  const violations = viewAudits
    .flatMap((view) =>
      view.violations.map((violation) => ({
        ...violation,
        view_label: view.view_label,
        view_index: view.view_index,
      })),
    )
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 25);

  const pass =
    Boolean(themeReady.matched) &&
    !isTruncated &&
    sampledTextNodes > 0 &&
    failingTextNodes === 0 &&
    (minContrastRatio ?? 0) >= WCAG_AA_MIN_CONTRAST;

  return {
    requested_theme: desiredTheme,
    minimum_required_ratio: WCAG_AA_MIN_CONTRAST,
    theme_ready: themeReady,
    sampled_text_nodes: sampledTextNodes,
    failing_text_nodes: failingTextNodes,
    min_contrast_ratio: minContrastRatio,
    truncated: isTruncated,
    max_samples_per_view: MAX_TEXT_ELEMENTS_PER_VIEW,
    max_dom_elements_per_view: MAX_DOM_ELEMENTS_PER_VIEW,
    views_scanned: viewAudits.length,
    per_view: viewAudits,
    violations,
    pass,
  };
}

async function clickSidebarViewByLabel(page, labelRe, onTrace = null) {
  const navButtons = page.locator("aside nav button");
  const navCount = await navButtons.count().catch(() => 0);
  if (navCount === 0) return { clicked: false, nav_count: 0, matched_label: null, matched_index: -1 };

  for (let idx = 0; idx < navCount; idx += 1) {
    const navButton = navButtons.nth(idx);
    const label = ((await navButton.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    if (!labelRe.test(label)) continue;
    await navButton.click({ timeout: 5_000 }).catch(() => {});
    await waitForAppSettled(page, 1_600, 320);
    if (onTrace) await onTrace(`nav:clicked:${label}:idx=${idx}`);
    return { clicked: true, nav_count: navCount, matched_label: label, matched_index: idx };
  }

  if (onTrace) await onTrace(`nav:not_found:${String(labelRe)}`);
  return { clicked: false, nav_count: navCount, matched_label: null, matched_index: -1 };
}

async function openTerminalPanelInTasks(page, onTrace = null) {
  const navResult = await clickSidebarViewByLabel(page, tasksViewLabelRe, onTrace);
  const terminalButtons = page.locator("button[title]");
  const titledButtonCount = await terminalButtons.count().catch(() => 0);
  let terminalButtonMatchCount = 0;
  let clickedTerminalButton = false;
  let matchedTerminalButtonTitle = null;

  if (titledButtonCount > 0) {
    for (let idx = 0; idx < titledButtonCount; idx += 1) {
      const candidate = terminalButtons.nth(idx);
      const title = (await candidate.getAttribute("title").catch(() => "")) ?? "";
      if (!terminalOutputButtonRe.test(title)) continue;
      terminalButtonMatchCount += 1;
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) continue;
      await candidate.click({ timeout: 5_000 }).catch(() => {});
      clickedTerminalButton = true;
      matchedTerminalButtonTitle = title;
      break;
    }
  }

  await waitForAppSettled(page, 1_800, 360);
  const panelLocator = page.locator(TERMINAL_PANEL_CONTAINER_SELECTOR).filter({ hasText: terminalTabLabelRe }).first();
  const panelVisible = await panelLocator.isVisible().catch(() => false);
  const terminalTabVisible = await panelLocator
    .locator("button")
    .filter({ hasText: terminalTabLabelRe })
    .first()
    .isVisible()
    .catch(() => false);
  const panelHandle = panelVisible ? await panelLocator.elementHandle() : null;

  if (onTrace) {
    await onTrace(
      `terminal:open:tasks=${navResult.clicked}:buttons=${terminalButtonMatchCount}:clicked=${clickedTerminalButton}:panel=${panelVisible}:tab=${terminalTabVisible}`,
    );
  }

  return {
    nav_result: navResult,
    titled_button_count: titledButtonCount,
    terminal_button_count: terminalButtonMatchCount,
    clicked_terminal_button: clickedTerminalButton,
    matched_terminal_button_title: matchedTerminalButtonTitle,
    panel_visible: panelVisible,
    terminal_tab_visible: terminalTabVisible,
    panel_handle: panelHandle,
  };
}

async function closeTerminalPanel(page, onTrace = null) {
  await page.keyboard.press("Escape").catch(() => {});
  await waitForAppSettled(page, 1_200, 260);
  const panelStillVisible = await page
    .locator(TERMINAL_PANEL_CONTAINER_SELECTOR)
    .filter({ hasText: terminalTabLabelRe })
    .first()
    .isVisible()
    .catch(() => false);
  if (onTrace) await onTrace(`terminal:close:still_visible=${panelStillVisible}`);
  return !panelStillVisible;
}

async function collectScopedContrastFromRoot(rootHandle, minimumContrast, maxSamplesPerView) {
  if (!rootHandle) {
    return {
      sampled_text_nodes: 0,
      failing_text_nodes: 0,
      min_contrast_ratio: null,
      truncated: false,
      processed_elements: 0,
      max_dom_elements: MAX_DOM_ELEMENTS_PER_VIEW,
      max_samples: maxSamplesPerView,
      root_found: false,
      violations: [],
    };
  }

  return rootHandle.evaluate(
    (root, payload) => {
      const { minContrast, maxSamples, maxDomElements } = payload;
      const textSignalRe = /[A-Za-z0-9가-힣ぁ-んァ-ヶ一-龯]/;
      const skipTagSet = new Set(["script", "style", "noscript"]);

      const parseColor = (raw) => {
        if (typeof raw !== "string") return null;
        const value = raw.trim().toLowerCase();
        if (!value) return null;
        if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

        const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/);
        if (rgbMatch) {
          const parts = rgbMatch[1].split(",").map((part) => part.trim());
          if (parts.length < 3) return null;
          return {
            r: Number(parts[0]),
            g: Number(parts[1]),
            b: Number(parts[2]),
            a: parts[3] === undefined ? 1 : Number(parts[3]),
          };
        }

        const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
        if (!hexMatch) return null;
        const hex = hexMatch[1];
        if (hex.length === 3) {
          return {
            r: Number.parseInt(`${hex[0]}${hex[0]}`, 16),
            g: Number.parseInt(`${hex[1]}${hex[1]}`, 16),
            b: Number.parseInt(`${hex[2]}${hex[2]}`, 16),
            a: 1,
          };
        }
        if (hex.length === 6 || hex.length === 8) {
          return {
            r: Number.parseInt(hex.slice(0, 2), 16),
            g: Number.parseInt(hex.slice(2, 4), 16),
            b: Number.parseInt(hex.slice(4, 6), 16),
            a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
          };
        }
        return null;
      };

      const clamp = (num, min, max) => Math.max(min, Math.min(max, num));
      const normalizedChannel = (value) => clamp(Number.isFinite(value) ? value : 0, 0, 255);
      const normalizedAlpha = (value) => clamp(Number.isFinite(value) ? value : 1, 0, 1);

      const blend = (foreground, background) => {
        const fgA = normalizedAlpha(foreground.a);
        const bgA = normalizedAlpha(background.a);
        const outA = fgA + bgA * (1 - fgA);
        if (outA <= 0) return { r: 0, g: 0, b: 0, a: 0 };

        return {
          r: (normalizedChannel(foreground.r) * fgA + normalizedChannel(background.r) * bgA * (1 - fgA)) / outA,
          g: (normalizedChannel(foreground.g) * fgA + normalizedChannel(background.g) * bgA * (1 - fgA)) / outA,
          b: (normalizedChannel(foreground.b) * fgA + normalizedChannel(background.b) * bgA * (1 - fgA)) / outA,
          a: outA,
        };
      };

      const srgbToLinear = (channel) => {
        const c = normalizedChannel(channel) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };

      const luminance = (color) =>
        0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b);

      const contrastRatio = (fg, bg) => {
        const fgLum = luminance(fg);
        const bgLum = luminance(bg);
        const bright = Math.max(fgLum, bgLum);
        const dark = Math.min(fgLum, bgLum);
        return (bright + 0.05) / (dark + 0.05);
      };

      const toColorText = (color) =>
        `rgba(${Math.round(normalizedChannel(color.r))},` +
        `${Math.round(normalizedChannel(color.g))},` +
        `${Math.round(normalizedChannel(color.b))},` +
        `${normalizedAlpha(color.a).toFixed(3)})`;

      const fallbackBackground = (() => {
        const rootBg = parseColor(getComputedStyle(root).backgroundColor);
        if (rootBg && rootBg.a > 0) return rootBg;
        const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
        if (bodyBg && bodyBg.a > 0) return bodyBg;
        const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
        if (htmlBg && htmlBg.a > 0) return htmlBg;
        return { r: 255, g: 255, b: 255, a: 1 };
      })();

      const rootRect = root.getBoundingClientRect();
      const isVisible = (el) => {
        let node = el;
        while (node && node instanceof Element) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
            return false;
          }
          if (node === root) break;
          node = node.parentElement;
        }
        if (!root.contains(el)) return false;
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= rootRect.top &&
          rect.top <= rootRect.bottom &&
          rect.right >= rootRect.left &&
          rect.left <= rootRect.right
        );
      };

      const getEffectiveBackground = (el) => {
        const layers = [];
        let node = el;
        while (node && node instanceof Element) {
          const bg = parseColor(getComputedStyle(node).backgroundColor);
          if (bg && bg.a > 0) layers.push(bg);
          if (node === root) break;
          node = node.parentElement;
        }
        let composite = fallbackBackground;
        for (let idx = layers.length - 1; idx >= 0; idx -= 1) {
          composite = blend(layers[idx], composite);
        }
        return composite;
      };

      const violations = [];
      let sampledCount = 0;
      let failingCount = 0;
      let minRatio = Number.POSITIVE_INFINITY;
      let worstViolation = null;
      let truncated = false;
      let processedElements = 0;

      const elements = Array.from(root.querySelectorAll("*"));
      for (const el of elements) {
        processedElements += 1;
        if (processedElements > maxDomElements) {
          truncated = true;
          break;
        }

        if (!(el instanceof HTMLElement)) continue;
        if (skipTagSet.has(el.tagName.toLowerCase())) continue;
        if (!isVisible(el)) continue;
        if (el.getClientRects().length === 0) continue;

        const directText = Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        if (!directText || !textSignalRe.test(directText)) continue;

        const fg = parseColor(getComputedStyle(el).color);
        if (!fg) continue;
        const bg = getEffectiveBackground(el);
        const ratio = contrastRatio(fg, bg);
        const roundedRatio = Number(ratio.toFixed(3));

        sampledCount += 1;
        if (sampledCount >= maxSamples) {
          truncated = true;
          break;
        }

        if (ratio < minRatio) {
          minRatio = ratio;
          worstViolation = {
            text: directText.slice(0, 140),
            ratio: roundedRatio,
            tag: el.tagName.toLowerCase(),
            class_name: (el.className ?? "").toString().slice(0, 140),
            fg: toColorText(fg),
            bg: toColorText(bg),
          };
        }

        if (ratio < minContrast) {
          failingCount += 1;
          if (violations.length < 40) {
            violations.push({
              text: directText.slice(0, 140),
              ratio: roundedRatio,
              tag: el.tagName.toLowerCase(),
              class_name: (el.className ?? "").toString().slice(0, 140),
              fg: toColorText(fg),
              bg: toColorText(bg),
            });
          }
        }
      }

      return {
        theme: document.documentElement.getAttribute("data-theme"),
        root_found: true,
        sampled_text_nodes: sampledCount,
        failing_text_nodes: failingCount,
        min_contrast_ratio: Number.isFinite(minRatio) ? Number(minRatio.toFixed(3)) : null,
        truncated,
        processed_elements: processedElements,
        max_dom_elements: maxDomElements,
        max_samples: maxSamples,
        worst_violation: worstViolation,
        violations,
      };
    },
    {
      minContrast: minimumContrast,
      maxSamples: maxSamplesPerView,
      maxDomElements: MAX_DOM_ELEMENTS_PER_VIEW,
    },
  );
}

async function collectTerminalPanelStyles(panelHandle) {
  if (!panelHandle) return null;
  return panelHandle.evaluate((root) => {
    if (!(root instanceof HTMLElement)) return null;
    const style = getComputedStyle(root);
    return {
      background: style.backgroundColor,
      color: style.color,
      border: style.borderColor,
      class_name: root.className,
      data_theme: document.documentElement.getAttribute("data-theme"),
    };
  });
}

async function waitForAppSettled(page, networkTimeoutMs = 2_000, settleDelayMs = 350) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: networkTimeoutMs }).catch(() => {});
  if (settleDelayMs > 0) {
    await page.waitForTimeout(settleDelayMs);
  }
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const traceLogPath = path.join(outDir, "trace.log");
  const trace = async (message) => {
    await appendFile(traceLogPath, `${new Date().toISOString()} ${message}\n`, "utf8");
  };
  await trace("run:start");

  const checks = [];
  const consoleIssues = [];
  const pageErrors = [];
  const artifacts = {
    pre_toggle_screenshot: path.join(outDir, "pre-toggle.png"),
    post_toggle_screenshot: path.join(outDir, "post-toggle.png"),
    post_reload_screenshot: path.join(outDir, "post-reload.png"),
    summary_json: path.join(outDir, "summary.json"),
    findings_markdown: path.join(outDir, "findings.md"),
  };

  const browser = await chromium.launch({ headless: runHeadless });
  const context = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "warning" || msg.type() === "error") {
      consoleIssues.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push({ message: err.message, stack: err.stack ?? null });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page, 2_000, 500);
  await trace("phase:initial_loaded");

  await page.screenshot({ path: artifacts.pre_toggle_screenshot, fullPage: true });

  const officeManagerButton = page.getByRole("button", { name: officeManagerNameRe }).first();
  const officeManagerVisible = await officeManagerButton.isVisible().catch(() => false);
  checks.push(
    buildCheck("office_manager_button_visible", officeManagerVisible, {
      expected: "Office Manager button is visible in top controls.",
    }),
  );

  let officeButtonIdx = -1;
  let rightButton = null;
  let rightButtonLocator = null;
  let rightButtonIsThemeLike = false;
  let rightButtonDistancePx = null;

  if (officeManagerVisible) {
    const headerButtons = await collectHeaderButtons(page);
    officeButtonIdx = headerButtons.findIndex((button) =>
      officeManagerNameRe.test(`${button.text} ${button.ariaLabel}`),
    );
    if (officeButtonIdx >= 0) {
      const office = headerButtons[officeButtonIdx];
      const candidates = headerButtons
        .filter((button) => button.idx !== office.idx)
        .map((button) => ({
          ...button,
          dx: button.x - (office.x + office.width),
          dy: Math.abs(button.y - office.y),
        }))
        .filter((button) => button.dx >= -2 && button.dx <= 220 && button.dy <= 26)
        .sort((a, b) => a.dx - b.dx);
      rightButton = candidates[0] ?? null;
      if (rightButton) {
        rightButtonLocator = page.locator("header button").nth(rightButton.idx);
        rightButtonDistancePx = rightButton.dx;
        const labelBlob = `${rightButton.text} ${rightButton.ariaLabel} ${rightButton.html}`;
        rightButtonIsThemeLike = themeSignalRe.test(labelBlob);
      }
    }
  }

  checks.push(
    buildCheck("theme_toggle_right_of_office_manager", Boolean(rightButton), {
      expected: "Theme toggle button exists at the immediate right of Office Manager button.",
      office_button_index: officeButtonIdx,
      right_button: rightButton,
      distance_px: rightButtonDistancePx,
    }),
  );

  checks.push(
    buildCheck("theme_toggle_uses_sun_moon_representation", rightButtonIsThemeLike, {
      expected: "Theme toggle expresses sun/moon (icon or accessible name).",
      detected_text: rightButton ? rightButton.text : "",
      detected_aria_label: rightButton ? rightButton.ariaLabel : "",
    }),
  );

  const beforeState = await collectUiState(page);
  const beforeThemeStorage = extractThemeStorage(beforeState.storage);
  await trace("phase:before_state_collected");

  const canvasLocator = page.locator("canvas").first();
  const canvasVisible = await canvasLocator.isVisible().catch(() => false);
  const beforeCanvasBox = canvasVisible ? await canvasLocator.boundingBox() : null;
  const beforeCanvasTone = beforeCanvasBox
    ? await analyzeRegionTone(artifacts.pre_toggle_screenshot, beforeCanvasBox)
    : null;

  let toggleClicked = false;
  if (rightButtonLocator) {
    await rightButtonLocator.click({ timeout: 5_000 });
    await waitForAppSettled(page, 2_000, 450);
    toggleClicked = true;
    await page.screenshot({ path: artifacts.post_toggle_screenshot, fullPage: true });
  }
  await trace(`phase:toggle_done:clicked=${toggleClicked}`);

  const afterState = await collectUiState(page);
  const afterThemeStorage = extractThemeStorage(afterState.storage);

  const themeAttrChanged =
    beforeState.attrs.htmlClass !== afterState.attrs.htmlClass ||
    beforeState.attrs.bodyClass !== afterState.attrs.bodyClass ||
    beforeState.attrs.htmlDataTheme !== afterState.attrs.htmlDataTheme ||
    beforeState.attrs.bodyDataTheme !== afterState.attrs.bodyDataTheme ||
    beforeState.attrs.rootDataTheme !== afterState.attrs.rootDataTheme;
  const themeStorageChanged = hasStorageChanged(beforeThemeStorage, afterThemeStorage);
  const themeStateChanged = toggleClicked && (themeAttrChanged || themeStorageChanged);

  checks.push(
    buildCheck("theme_toggle_changes_theme_state", themeStateChanged, {
      expected: "After toggle click, theme-related DOM attrs/classes or localStorage entries should change.",
      toggle_clicked: toggleClicked,
      attrs_before: beforeState.attrs,
      attrs_after: afterState.attrs,
      theme_storage_before: beforeThemeStorage,
      theme_storage_after: afterThemeStorage,
    }),
  );

  const styleDeltaSignals = [
    {
      target: "body.background",
      delta: colorDistance(beforeState.styles.body?.background, afterState.styles.body?.background),
    },
    {
      target: "header.background",
      delta: colorDistance(beforeState.styles.header?.background, afterState.styles.header?.background),
    },
    {
      target: "office_button.background",
      delta: colorDistance(beforeState.styles.officeButton?.background, afterState.styles.officeButton?.background),
    },
    {
      target: "office_button.color",
      delta: colorDistance(beforeState.styles.officeButton?.color, afterState.styles.officeButton?.color),
    },
  ];
  const changedSignalCount = styleDeltaSignals.filter((signal) => signal.delta >= UI_REACTION_DELTA_MIN).length;
  checks.push(
    buildCheck("global_ui_reacts_to_theme_toggle", toggleClicked && changedSignalCount >= 2, {
      expected: "At least two major UI color signals should change after theme toggle.",
      toggle_clicked: toggleClicked,
      changed_signal_count: changedSignalCount,
      style_delta_signals: styleDeltaSignals,
    }),
  );

  const officeButtonBackgroundDelta =
    styleDeltaSignals.find((signal) => signal.target === "office_button.background")?.delta ?? 0;
  const officeButtonColorDelta =
    styleDeltaSignals.find((signal) => signal.target === "office_button.color")?.delta ?? 0;
  const officeButtonReactive =
    toggleClicked &&
    (officeButtonBackgroundDelta >= UI_REACTION_DELTA_MIN || officeButtonColorDelta >= UI_REACTION_DELTA_MIN);
  checks.push(
    buildCheck("office_manager_button_reacts_to_theme_toggle", officeButtonReactive, {
      expected: "Office Manager button should also react to dark/light theme changes.",
      toggle_clicked: toggleClicked,
      office_button_background_delta: officeButtonBackgroundDelta,
      office_button_color_delta: officeButtonColorDelta,
      delta_threshold: UI_REACTION_DELTA_MIN,
      office_button_style_before: beforeState.styles.officeButton,
      office_button_style_after: afterState.styles.officeButton,
    }),
  );

  checks.push(
    buildCheck("theme_persisted_to_localstorage", hasThemePersistValue(afterThemeStorage), {
      expected: "localStorage stores explicit dark/light theme preference.",
      theme_storage_after: afterThemeStorage,
    }),
  );

  const expectedPersistedTheme = resolveStoredTheme(afterThemeStorage);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppSettled(page, 2_000, 450);
  await page.screenshot({ path: artifacts.post_reload_screenshot, fullPage: true });
  await trace("phase:post_reload_collected");

  const reloadedState = await collectUiState(page);
  const reloadedThemeStorage = extractThemeStorage(reloadedState.storage);
  const reloadedAttrTheme =
    normalizeThemeValue(reloadedState.attrs.htmlDataTheme) ??
    normalizeThemeValue(reloadedState.attrs.bodyDataTheme) ??
    normalizeThemeValue(reloadedState.attrs.rootDataTheme);
  const reloadedStoredTheme = resolveStoredTheme(reloadedThemeStorage);
  const hardRefreshPass = Boolean(
    expectedPersistedTheme &&
    reloadedAttrTheme === expectedPersistedTheme &&
    reloadedStoredTheme === expectedPersistedTheme,
  );

  checks.push(
    buildCheck("theme_persists_after_hard_refresh", hardRefreshPass, {
      expected: "Chosen theme remains identical after hard refresh and localStorage still matches.",
      expected_theme: expectedPersistedTheme,
      reloaded_attr_theme: reloadedAttrTheme,
      reloaded_storage_theme: reloadedStoredTheme,
      attrs_after_reload: reloadedState.attrs,
      theme_storage_after_reload: reloadedThemeStorage,
    }),
  );

  const darkContrastAudit = await collectThemeContrastAcrossViews(page, "dark", rightButtonLocator, trace);
  await trace("phase:dark_contrast_done");
  checks.push(
    buildCheck("wcag_aa_contrast_45_dark_theme_all_text", darkContrastAudit.pass, {
      expected: "All visible text elements satisfy WCAG AA 4.5:1 in dark theme across major views.",
      minimum_required_ratio: WCAG_AA_MIN_CONTRAST,
      sampled_text_nodes: darkContrastAudit.sampled_text_nodes,
      failing_text_nodes: darkContrastAudit.failing_text_nodes,
      min_contrast_ratio: darkContrastAudit.min_contrast_ratio,
      views_scanned: darkContrastAudit.views_scanned,
      top_violations: darkContrastAudit.violations,
    }),
  );

  const lightContrastAudit = await collectThemeContrastAcrossViews(page, "light", rightButtonLocator, trace);
  await trace("phase:light_contrast_done");
  checks.push(
    buildCheck("wcag_aa_contrast_45_light_theme_all_text", lightContrastAudit.pass, {
      expected: "All visible text elements satisfy WCAG AA 4.5:1 in light theme across major views.",
      minimum_required_ratio: WCAG_AA_MIN_CONTRAST,
      sampled_text_nodes: lightContrastAudit.sampled_text_nodes,
      failing_text_nodes: lightContrastAudit.failing_text_nodes,
      min_contrast_ratio: lightContrastAudit.min_contrast_ratio,
      views_scanned: lightContrastAudit.views_scanned,
      top_violations: lightContrastAudit.violations,
    }),
  );

  const dashboardLightView = lightContrastAudit.per_view.find((view) => dashboardViewLabelRe.test(view.view_label));
  const dashboardFocusPass = Boolean(
    dashboardLightView &&
    !dashboardLightView.truncated &&
    dashboardLightView.sampled_text_nodes > 0 &&
    dashboardLightView.failing_text_nodes === 0 &&
    (dashboardLightView.min_contrast_ratio ?? 0) >= WCAG_AA_MIN_CONTRAST,
  );
  checks.push(
    buildCheck("dashboard_light_mode_contrast_focus", dashboardFocusPass, {
      expected: "Dashboard view should be individually readable in light mode (WCAG AA 4.5:1).",
      minimum_required_ratio: WCAG_AA_MIN_CONTRAST,
      view_label: dashboardLightView?.view_label ?? null,
      sampled_text_nodes: dashboardLightView?.sampled_text_nodes ?? 0,
      failing_text_nodes: dashboardLightView?.failing_text_nodes ?? 0,
      min_contrast_ratio: dashboardLightView?.min_contrast_ratio ?? null,
      top_violations: (dashboardLightView?.violations ?? []).slice(0, 15),
    }),
  );
  await trace("phase:dashboard_focus_done");

  const darkThemeReadyForTerminal = await ensureTheme(page, "dark", rightButtonLocator, trace);
  const darkTerminalOpen = await openTerminalPanelInTasks(page, trace);
  const darkTerminalStyles = darkTerminalOpen.panel_visible
    ? await collectTerminalPanelStyles(darkTerminalOpen.panel_handle)
    : null;
  if (darkTerminalOpen.panel_visible) {
    await closeTerminalPanel(page, trace);
  }

  const lightThemeReadyForTerminal = await ensureTheme(page, "light", rightButtonLocator, trace);
  const lightTerminalOpen = await openTerminalPanelInTasks(page, trace);
  const lightTerminalStyles = lightTerminalOpen.panel_visible
    ? await collectTerminalPanelStyles(lightTerminalOpen.panel_handle)
    : null;
  const terminalLightContrastAudit = lightTerminalOpen.panel_visible
    ? await collectScopedContrastFromRoot(
        lightTerminalOpen.panel_handle,
        WCAG_AA_MIN_CONTRAST,
        MAX_TEXT_ELEMENTS_PER_VIEW,
      )
    : {
        root_found: false,
        sampled_text_nodes: 0,
        failing_text_nodes: 0,
        min_contrast_ratio: null,
        truncated: false,
        violations: [],
        max_samples: MAX_TEXT_ELEMENTS_PER_VIEW,
        max_dom_elements: MAX_DOM_ELEMENTS_PER_VIEW,
      };

  const terminalPanelBackgroundDelta = colorDistance(darkTerminalStyles?.background, lightTerminalStyles?.background);
  const terminalPanelTextDelta = colorDistance(darkTerminalStyles?.color, lightTerminalStyles?.color);
  const terminalPanelReactive = Boolean(
    darkThemeReadyForTerminal.matched &&
    lightThemeReadyForTerminal.matched &&
    darkTerminalOpen.panel_visible &&
    lightTerminalOpen.panel_visible &&
    (terminalPanelBackgroundDelta >= UI_REACTION_DELTA_MIN || terminalPanelTextDelta >= UI_REACTION_DELTA_MIN),
  );
  checks.push(
    buildCheck("terminal_panel_reacts_to_dark_light", terminalPanelReactive, {
      expected: "Terminal panel itself should change visual tone between dark and light themes.",
      dark_theme_ready: darkThemeReadyForTerminal,
      light_theme_ready: lightThemeReadyForTerminal,
      dark_panel_open: {
        nav_result: darkTerminalOpen.nav_result,
        titled_button_count: darkTerminalOpen.titled_button_count,
        terminal_button_count: darkTerminalOpen.terminal_button_count,
        clicked_terminal_button: darkTerminalOpen.clicked_terminal_button,
        matched_terminal_button_title: darkTerminalOpen.matched_terminal_button_title,
        panel_visible: darkTerminalOpen.panel_visible,
      },
      light_panel_open: {
        nav_result: lightTerminalOpen.nav_result,
        titled_button_count: lightTerminalOpen.titled_button_count,
        terminal_button_count: lightTerminalOpen.terminal_button_count,
        clicked_terminal_button: lightTerminalOpen.clicked_terminal_button,
        matched_terminal_button_title: lightTerminalOpen.matched_terminal_button_title,
        panel_visible: lightTerminalOpen.panel_visible,
      },
      dark_panel_style: darkTerminalStyles,
      light_panel_style: lightTerminalStyles,
      panel_background_delta: terminalPanelBackgroundDelta,
      panel_text_color_delta: terminalPanelTextDelta,
      delta_threshold: UI_REACTION_DELTA_MIN,
    }),
  );

  const terminalLightContrastPass = Boolean(
    lightThemeReadyForTerminal.matched &&
    lightTerminalOpen.panel_visible &&
    terminalLightContrastAudit.root_found &&
    !terminalLightContrastAudit.truncated &&
    terminalLightContrastAudit.sampled_text_nodes > 0 &&
    terminalLightContrastAudit.failing_text_nodes === 0 &&
    (terminalLightContrastAudit.min_contrast_ratio ?? 0) >= WCAG_AA_MIN_CONTRAST,
  );
  checks.push(
    buildCheck("terminal_panel_light_mode_contrast", terminalLightContrastPass, {
      expected: "Terminal panel text should satisfy WCAG AA 4.5:1 in light mode.",
      minimum_required_ratio: WCAG_AA_MIN_CONTRAST,
      panel_selector: TERMINAL_PANEL_CONTAINER_SELECTOR,
      panel_opened: lightTerminalOpen.panel_visible,
      sampled_text_nodes: terminalLightContrastAudit.sampled_text_nodes,
      failing_text_nodes: terminalLightContrastAudit.failing_text_nodes,
      min_contrast_ratio: terminalLightContrastAudit.min_contrast_ratio,
      top_violations: terminalLightContrastAudit.violations.slice(0, 20),
      panel_style: lightTerminalStyles,
    }),
  );
  if (lightTerminalOpen.panel_visible) {
    await closeTerminalPanel(page, trace);
  }
  await trace("phase:terminal_focus_done");

  let afterCanvasTone = null;
  if (toggleClicked && beforeCanvasBox) {
    afterCanvasTone = await analyzeRegionTone(artifacts.post_toggle_screenshot, beforeCanvasBox);
  }

  const canvasToneDelta =
    beforeCanvasTone && afterCanvasTone ? Math.abs(beforeCanvasTone.luminance - afterCanvasTone.luminance) : 0;
  checks.push(
    buildCheck("office_canvas_tone_changes_between_dark_and_light", toggleClicked && canvasToneDelta >= 0.06, {
      expected: "Office visual tone should noticeably change between dark/light modes.",
      toggle_clicked: toggleClicked,
      luminance_delta: canvasToneDelta,
      before_canvas_tone: beforeCanvasTone,
      after_canvas_tone: afterCanvasTone,
    }),
  );

  const checksWithSeverity = checks.map((check) => ({
    ...check,
    severity: resolveCheckSeverity(check),
  }));
  const failedChecks = checksWithSeverity.filter((check) => !check.pass);
  const failedCriticalHighChecks = failedChecks.filter(
    (check) => check.severity === "CRITICAL" || check.severity === "HIGH",
  );
  const failedMediumLowChecks = failedChecks.filter((check) => check.severity === "MEDIUM" || check.severity === "LOW");
  const severityCounts = buildSeverityCounts(checksWithSeverity);

  const summary = {
    base_url: baseUrl,
    generated_at: new Date().toISOString(),
    out_dir: outDir,
    check_counts: {
      total: checksWithSeverity.length,
      passed: checksWithSeverity.length - failedChecks.length,
      failed: failedChecks.length,
    },
    severity_counts: severityCounts,
    checks: checksWithSeverity,
    failed_checks: failedChecks,
    failed_checks_critical_high: failedCriticalHighChecks,
    failed_checks_medium_low: failedMediumLowChecks,
    diagnostics: {
      console_issues: consoleIssues,
      page_errors: pageErrors,
    },
    wcag_audit: {
      dark: darkContrastAudit,
      light: lightContrastAudit,
    },
    targeted_audit: {
      dashboard_light: dashboardLightView ?? null,
      terminal_light: terminalLightContrastAudit,
      terminal_theme_reactivity: {
        dark_style: darkTerminalStyles,
        light_style: lightTerminalStyles,
        background_delta: terminalPanelBackgroundDelta,
        text_delta: terminalPanelTextDelta,
      },
    },
    artifacts,
    execution: {
      failed_critical_high_count: failedCriticalHighChecks.length,
      failed_medium_low_count: failedMediumLowChecks.length,
      page_error_count: pageErrors.length,
      result: failedCriticalHighChecks.length > 0 || pageErrors.length > 0 ? "FAIL" : "PASS",
    },
  };

  await writeFile(artifacts.summary_json, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(artifacts.findings_markdown, `${buildMarkdownReport(summary)}\n`, "utf8");
  await trace("phase:summary_written");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  await context.close();
  await browser.close();
  await trace("phase:browser_closed");

  if (failedCriticalHighChecks.length > 0 || pageErrors.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  process.stderr.write(`[office-theme-requirements] ${error?.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
