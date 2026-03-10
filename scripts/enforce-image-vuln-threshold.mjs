#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const reportArg = process.argv[2] || process.env.IMAGE_VULN_REPORT || "";
const imageRef = process.argv[3] || process.env.IMAGE_REF || "unknown-image";
const sbomArg = process.argv[4] || process.env.IMAGE_VULN_SBOM_PATH || "";
const reportPath = reportArg ? path.resolve(reportArg) : "";
const sbomPath = sbomArg ? path.resolve(sbomArg) : "";
const maxCriticalRaw = process.env.IMAGE_VULN_MAX_CRITICAL || "0";
const maxHighRaw = process.env.IMAGE_VULN_MAX_HIGH || "0";

const maxCritical = Number(maxCriticalRaw);
const maxHigh = Number(maxHighRaw);
if (!Number.isFinite(maxCritical) || maxCritical < 0) {
  console.error(`Invalid IMAGE_VULN_MAX_CRITICAL: ${maxCriticalRaw}`);
  process.exit(1);
}
if (!Number.isFinite(maxHigh) || maxHigh < 0) {
  console.error(`Invalid IMAGE_VULN_MAX_HIGH: ${maxHighRaw}`);
  process.exit(1);
}

if (!reportPath) {
  console.error("Usage: node scripts/enforce-image-vuln-threshold.mjs <trivy-json-report> [image-ref]");
  process.exit(1);
}
if (!fs.existsSync(reportPath)) {
  console.error(`Report not found: ${reportPath}`);
  process.exit(1);
}

const reportRaw = fs.readFileSync(reportPath, "utf8");
let report;
try {
  report = JSON.parse(reportRaw);
} catch (error) {
  console.error(`Failed to parse JSON report: ${reportPath}`);
  console.error(String(error));
  process.exit(1);
}

const counters = {
  CRITICAL: 0,
  HIGH: 0,
  MEDIUM: 0,
  LOW: 0,
  UNKNOWN: 0,
};

let sbomSha256 = "";
if (sbomPath && fs.existsSync(sbomPath)) {
  sbomSha256 = crypto.createHash("sha256").update(fs.readFileSync(sbomPath)).digest("hex");
}

function addSeverity(value) {
  const key = String(value || "UNKNOWN").toUpperCase();
  if (Object.prototype.hasOwnProperty.call(counters, key)) {
    counters[key] += 1;
    return;
  }
  counters.UNKNOWN += 1;
}

const allResults = [];
if (Array.isArray(report?.Results)) allResults.push(...report.Results);
if (Array.isArray(report)) allResults.push(...report);

for (const result of allResults) {
  const vulns = Array.isArray(result?.Vulnerabilities) ? result.Vulnerabilities : [];
  for (const vuln of vulns) {
    addSeverity(vuln?.Severity);
  }
}

const allowDeploy = counters.CRITICAL <= maxCritical && counters.HIGH <= maxHigh;
const checkedAt = new Date().toISOString();
const timestamp = checkedAt.replace(/[-:]/g, "").replace(/\./g, "");
const uniqueSuffix = crypto.randomUUID().slice(0, 8);
const logDir = path.resolve(process.env.IMAGE_VULN_DECISION_DIR || path.join(process.cwd(), "logs"));
const decisionLog = path.resolve(
  process.env.IMAGE_VULN_DECISION_LOG || path.join(logDir, `image-vuln-decision-${timestamp}-${uniqueSuffix}.log`),
);

fs.mkdirSync(logDir, { recursive: true });
try {
  fs.chmodSync(logDir, 0o700);
} catch {
  // Best effort only; CI filesystems may not honor chmod on all runners.
}

const decisionLines = [
  `[EVIDENCE] checked_at_utc=${checkedAt}`,
  `[EVIDENCE] image_ref=${imageRef}`,
  `[EVIDENCE] report_path=${reportPath}`,
  `[EVIDENCE] sbom_path=${sbomPath || "n/a"}`,
  `[EVIDENCE] sbom_sha256=${sbomSha256 || "n/a"}`,
  `[EVIDENCE] threshold_critical=${maxCritical}`,
  `[EVIDENCE] threshold_high=${maxHigh}`,
  `[EVIDENCE] found_critical=${counters.CRITICAL}`,
  `[EVIDENCE] found_high=${counters.HIGH}`,
  `[EVIDENCE] found_medium=${counters.MEDIUM}`,
  `[EVIDENCE] found_low=${counters.LOW}`,
  `[EVIDENCE] found_unknown=${counters.UNKNOWN}`,
  `[EVIDENCE] decision=${allowDeploy ? "allow_deploy" : "block_deploy"}`,
];
fs.writeFileSync(decisionLog, `${decisionLines.join("\n")}\n`, { mode: 0o600 });

const summary = {
  checked_at_utc: checkedAt,
  image_ref: imageRef,
  report_path: reportPath,
  sbom_path: sbomPath || null,
  sbom_sha256: sbomSha256 || null,
  decision_log: decisionLog,
  threshold: {
    critical: maxCritical,
    high: maxHigh,
  },
  found: counters,
  decision: allowDeploy ? "allow_deploy" : "block_deploy",
};

console.log(JSON.stringify(summary, null, 2));
process.exit(allowDeploy ? 0 : 1);
