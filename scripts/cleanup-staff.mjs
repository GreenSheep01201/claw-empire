#!/usr/bin/env node
/**
 * cleanup-staff.mjs
 * ClawEmpire スタッフデータ整理スクリプト
 *
 * 使い方:
 *   node scripts/cleanup-staff.mjs [--dry-run] [--reset-break] [--show-duplicates] [--show-roles]
 *
 * オプション:
 *   --dry-run          実際の変更は行わず、変更内容のみ表示
 *   --reset-break      break 状態のエージェントを idle にリセット
 *   --show-duplicates  同名エージェントの一覧を表示
 *   --show-roles       ロール別の構成比を表示
 *   --all              全レポートを表示 + break → idle リセット
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB = resolve(__dirname, "../claw-empire.sqlite");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESET_BREAK = args.includes("--reset-break") || args.includes("--all");
const SHOW_DUPS = args.includes("--show-duplicates") || args.includes("--all");
const SHOW_ROLES = args.includes("--show-roles") || args.includes("--all");

const dbPath = process.env.DB_PATH ?? DEFAULT_DB;

if (!existsSync(dbPath)) {
  console.error(`❌ DB not found: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

// ─── ユーティリティ ───────────────────────────────────────────────

function isPackSeed(id) {
  // pack seed は "packname-seed-N" 形式の ID
  return /^[a-z_]+-seed-\d+$/.test(id);
}

// ─── break → idle リセット ─────────────────────────────────────────

function reportBreakAgents() {
  const breaks = db
    .prepare("SELECT id, name, role, cli_provider FROM agents WHERE status = 'break'")
    .all();

  if (breaks.length === 0) {
    console.log("✅ break 状態のエージェントはいません");
    return breaks;
  }

  console.log(`\n⚠️  break 状態のエージェント (${breaks.length}名):`);
  for (const a of breaks) {
    const seed = isPackSeed(a.id) ? " [パックシード]" : "";
    console.log(`  - ${a.name} (${a.role}, ${a.cli_provider})${seed}`);
  }
  return breaks;
}

function resetBreakAgents() {
  const breaks = reportBreakAgents();
  if (breaks.length === 0) return;

  if (DRY_RUN) {
    console.log(`  → [dry-run] ${breaks.length}名を idle にリセット (スキップ)`);
    return;
  }

  const result = db.prepare("UPDATE agents SET status = 'idle' WHERE status = 'break'").run();
  console.log(`  ✅ ${result.changes}名を idle にリセットしました`);
}

// ─── ロール構成レポート ────────────────────────────────────────────

function reportRoles() {
  const all = db.prepare("SELECT id, name, role, cli_provider, stats_tasks_done FROM agents").all();
  const core = all.filter((a) => !isPackSeed(a.id));
  const seeds = all.filter((a) => isPackSeed(a.id));

  const count = (arr, role) => arr.filter((a) => a.role === role).length;

  console.log(`\n📊 ロール構成 (全 ${all.length}名):`);
  console.log("  コアスタッフ (UUID エージェント):");
  console.log(`    team_leader: ${count(core, "team_leader")}`);
  console.log(`    senior:      ${count(core, "senior")}`);
  console.log(`    junior:      ${count(core, "junior")}`);
  console.log(`    intern:      ${count(core, "intern")}`);
  console.log(`    計:          ${core.length}名`);

  console.log("  パックシード:");
  console.log(`    team_leader: ${count(seeds, "team_leader")}`);
  console.log(`    senior:      ${count(seeds, "senior")}`);
  console.log(`    junior:      ${count(seeds, "junior")}`);
  console.log(`    計:          ${seeds.length}名`);

  // 要注意: コアスタッフで team_leader が過多
  const coreLeaders = count(core, "team_leader");
  if (coreLeaders > 5 && coreLeaders > core.length * 0.4) {
    console.log(
      `\n  ⚠️  コアスタッフの team_leader が ${coreLeaders}名と多め (${Math.round((coreLeaders / core.length) * 100)}%)`,
    );
    console.log(
      "     AgentManager でロールを senior/junior に変更するか、不要なエージェントを削除してください",
    );
  }

  // 実績トップ5
  const top5 = [...all].sort((a, b) => b.stats_tasks_done - a.stats_tasks_done).slice(0, 5);
  console.log("\n  🏆 タスク完了数 トップ5:");
  for (const a of top5) {
    console.log(`    ${a.name.padEnd(10)} ${a.stats_tasks_done}件 (${a.role})`);
  }
}

// ─── 重複名レポート ────────────────────────────────────────────────

function reportDuplicates() {
  const all = db.prepare("SELECT id, name, role, cli_provider FROM agents ORDER BY name").all();
  const byName = {};
  for (const a of all) {
    if (!byName[a.name]) byName[a.name] = [];
    byName[a.name].push(a);
  }

  const dups = Object.entries(byName).filter(([, agents]) => agents.length > 1);

  if (dups.length === 0) {
    console.log("\n✅ 重複名エージェントはいません");
    return;
  }

  console.log(`\n🔍 重複名エージェント (${dups.length}グループ):`);
  for (const [name, agents] of dups) {
    console.log(`  "${name}" (${agents.length}名):`);
    for (const a of agents) {
      const seed = isPackSeed(a.id) ? `[パックシード: ${a.id}]` : `[コア: ${a.id.slice(0, 8)}...]`;
      console.log(`    - ${a.role} / ${a.cli_provider}  ${seed}`);
    }
  }
  console.log(
    "\n  ℹ️  パックシードの重複は設計上正常です（別パック用エージェント）。",
  );
  console.log(
    "     コア同士で重複している場合は AgentManager で名前を変更してください。",
  );
}

// ─── メイン ──────────────────────────────────────────────────────

console.log("=".repeat(60));
console.log("  ClawEmpire スタッフ整理スクリプト");
if (DRY_RUN) console.log("  [DRY-RUN モード: 変更は行いません]");
console.log("=".repeat(60));

if (args.length === 0 || args.every((a) => a === "--dry-run")) {
  console.log("\n使い方: node scripts/cleanup-staff.mjs [オプション]");
  console.log("  --all              全レポート + break リセット");
  console.log("  --reset-break      break → idle リセット");
  console.log("  --show-roles       ロール構成レポート");
  console.log("  --show-duplicates  重複名レポート");
  console.log("  --dry-run          変更内容のみ表示 (DB 更新なし)");
  process.exit(0);
}

if (RESET_BREAK) resetBreakAgents();
if (SHOW_ROLES) reportRoles();
if (SHOW_DUPS) reportDuplicates();

console.log("\n✅ 完了");
