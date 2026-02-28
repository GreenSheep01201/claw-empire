import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type DbLike = Pick<DatabaseSync, "exec" | "prepare">;

type OAuthRuntimeDeps = {
  db: DbLike;
  nowMs: () => number;
  runInTransaction: (fn: () => void) => void;
};

export type OAuthRuntimeHelpers = {
  ensureOAuthActiveAccount: (provider: string) => void;
  getActiveOAuthAccountIds: (provider: string) => string[];
  setActiveOAuthAccount: (provider: string, accountId: string) => void;
  setOAuthActiveAccounts: (provider: string, accountIds: string[]) => void;
  removeActiveOAuthAccount: (provider: string, accountId: string) => void;
  oauthProviderPrefix: (provider: string) => string;
  normalizeOAuthProvider: (provider: string) => "github" | "google_antigravity" | null;
  getNextOAuthLabel: (provider: string) => string;
};

export function initializeOAuthRuntime(deps: OAuthRuntimeDeps): OAuthRuntimeHelpers {
  const { db, nowMs, runInTransaction } = deps;

  // Add columns to oauth_credentials for web-oauth tokens (safe to run repeatedly)
  try {
    db.exec("ALTER TABLE oauth_credentials ADD COLUMN access_token_enc TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE oauth_credentials ADD COLUMN refresh_token_enc TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE agents ADD COLUMN oauth_account_id TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE agents ADD COLUMN api_provider_id TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE agents ADD COLUMN api_model TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE agents ADD COLUMN cli_model TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE agents ADD COLUMN cli_reasoning_level TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE agents ADD COLUMN sprite_number INTEGER");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE agents ADD COLUMN name_ja TEXT NOT NULL DEFAULT ''");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE agents ADD COLUMN name_zh TEXT NOT NULL DEFAULT ''");
  } catch {
    /* already exists */
  }
  // 부서 다국어 + 프롬프트 컬럼 추가
  try {
    db.exec("ALTER TABLE departments ADD COLUMN name_ja TEXT NOT NULL DEFAULT ''");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE departments ADD COLUMN name_zh TEXT NOT NULL DEFAULT ''");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE departments ADD COLUMN prompt TEXT");
  } catch {
    /* already exists */
  }
  // 기존 부서 다국어 이름 백필 (빈 값인 경우만)
  try {
    db.exec(`
    UPDATE departments SET name_ja = '企画チーム',              name_zh = '企划组'    WHERE id = 'planning' AND (name_ja = '' OR name_ja IS NULL);
    UPDATE departments SET name_ja = '開発チーム',              name_zh = '开发组'    WHERE id = 'dev' AND (name_ja = '' OR name_ja IS NULL);
    UPDATE departments SET name_ja = 'デザインチーム',          name_zh = '设计组'    WHERE id = 'design' AND (name_ja = '' OR name_ja IS NULL);
    UPDATE departments SET name_ja = '品質管理チーム',          name_zh = '质量管理组' WHERE id = 'qa' AND (name_ja = '' OR name_ja IS NULL);
    UPDATE departments SET name_ja = 'インフラセキュリティチーム', name_zh = '基础安全组' WHERE id = 'devsecops' AND (name_ja = '' OR name_ja IS NULL);
    UPDATE departments SET name_ja = '運営チーム',              name_zh = '运营组'    WHERE id = 'operations' AND (name_ja = '' OR name_ja IS NULL);
  `);
  } catch {
    /* already backfilled */
  }
  // sort_order 중복 방지 UNIQUE 인덱스
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_sort_order ON departments(sort_order)");
  } catch {
    /* already exists or duplicate data */
  }
  // 기존 DB의 cli_provider CHECK 제약 확장 (SQLite는 ALTER CHECK 미지원이므로 새 행만 해당)
  try {
    const hasApiCheck = (
      db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agents'").get() as any
    )?.sql?.includes("'api'");
    if (!hasApiCheck) {
      db.exec(`
      CREATE TABLE IF NOT EXISTS agents_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_ko TEXT NOT NULL DEFAULT '',
        name_ja TEXT NOT NULL DEFAULT '',
        name_zh TEXT NOT NULL DEFAULT '',
        department_id TEXT REFERENCES departments(id),
        role TEXT NOT NULL CHECK(role IN ('team_leader','senior','junior','intern')),
        cli_provider TEXT CHECK(cli_provider IN ('claude','codex','gemini','opencode','copilot','antigravity','cursor','api')),
        oauth_account_id TEXT,
        api_provider_id TEXT,
        api_model TEXT,
        cli_model TEXT,
        cli_reasoning_level TEXT,
        avatar_emoji TEXT NOT NULL DEFAULT '🤖',
        sprite_number INTEGER,
        personality TEXT,
        status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','working','break','offline')),
        current_task_id TEXT,
        stats_tasks_done INTEGER DEFAULT 0,
        stats_xp INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()*1000)
      );
      INSERT INTO agents_new SELECT id, name, name_ko, '', '', department_id, role, cli_provider, oauth_account_id, NULL, NULL, NULL, NULL, avatar_emoji, NULL, personality, status, current_task_id, stats_tasks_done, stats_xp, created_at FROM agents;
      DROP TABLE agents;
      ALTER TABLE agents_new RENAME TO agents;
    `);
    }
  } catch {
    /* migration already done or not needed */
  }
  // Extend agents cli_provider CHECK constraint: add 'cursor'
  try {
    const hasCursorCheck = (
      db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agents'").get() as any
    )?.sql?.includes("'cursor'");
    if (!hasCursorCheck) {
      db.exec(`
      CREATE TABLE IF NOT EXISTS agents_cursor_mig (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_ko TEXT NOT NULL DEFAULT '',
        name_ja TEXT NOT NULL DEFAULT '',
        name_zh TEXT NOT NULL DEFAULT '',
        department_id TEXT REFERENCES departments(id),
        role TEXT NOT NULL CHECK(role IN ('team_leader','senior','junior','intern')),
        cli_provider TEXT CHECK(cli_provider IN ('claude','codex','gemini','opencode','copilot','antigravity','cursor','api')),
        oauth_account_id TEXT,
        api_provider_id TEXT,
        api_model TEXT,
        cli_model TEXT,
        cli_reasoning_level TEXT,
        avatar_emoji TEXT NOT NULL DEFAULT '🤖',
        sprite_number INTEGER,
        personality TEXT,
        status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','working','break','offline')),
        current_task_id TEXT,
        stats_tasks_done INTEGER DEFAULT 0,
        stats_xp INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()*1000)
      );
      INSERT INTO agents_cursor_mig SELECT * FROM agents;
      DROP TABLE agents;
      ALTER TABLE agents_cursor_mig RENAME TO agents;
    `);
    }
  } catch {
    /* migration already done or not needed */
  }
  // Extend skill_learning_history provider CHECK constraint: add 'cursor'
  try {
    const skillSql = (
      db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='skill_learning_history'").get() as any
    )?.sql ?? "";
    if (skillSql && !skillSql.includes("'cursor'")) {
      db.exec(`
      CREATE TABLE IF NOT EXISTS skill_learning_history_cursor_mig (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('claude','codex','gemini','opencode','copilot','antigravity','cursor','api')),
        repo TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        skill_label TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
        command TEXT NOT NULL,
        error TEXT,
        run_started_at INTEGER,
        run_completed_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()*1000),
        updated_at INTEGER DEFAULT (unixepoch()*1000),
        UNIQUE(job_id, provider)
      );
      INSERT INTO skill_learning_history_cursor_mig SELECT * FROM skill_learning_history;
      DROP TABLE skill_learning_history;
      ALTER TABLE skill_learning_history_cursor_mig RENAME TO skill_learning_history;
    `);
    }
  } catch {
    /* migration already done or not needed */
  }
  // api_providers CHECK 제약 확장: cerebras 추가
  try {
    const apiProvSql =
      (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='api_providers'").get() as any)?.sql ?? "";
    if (apiProvSql && !apiProvSql.includes("'cerebras'")) {
      db.exec(`
      CREATE TABLE IF NOT EXISTS api_providers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'openai' CHECK(type IN ('openai','anthropic','google','ollama','openrouter','together','groq','cerebras','custom')),
        base_url TEXT NOT NULL,
        api_key_enc TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        models_cache TEXT,
        models_cached_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()*1000),
        updated_at INTEGER DEFAULT (unixepoch()*1000)
      );
      INSERT INTO api_providers_new SELECT * FROM api_providers;
      DROP TABLE api_providers;
      ALTER TABLE api_providers_new RENAME TO api_providers;
    `);
    }
  } catch {
    /* migration already done or not needed */
  }
  try {
    const apiProvSql2 =
      (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='api_providers'").get() as any)?.sql ?? "";
    if (apiProvSql2 && !apiProvSql2.includes("'cursor'")) {
      db.exec(`
      CREATE TABLE IF NOT EXISTS api_providers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'openai' CHECK(type IN ('openai','anthropic','google','ollama','openrouter','together','groq','cerebras','cursor','custom')),
        base_url TEXT NOT NULL,
        api_key_enc TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        models_cache TEXT,
        models_cached_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()*1000),
        updated_at INTEGER DEFAULT (unixepoch()*1000)
      );
      INSERT INTO api_providers_new SELECT * FROM api_providers;
      DROP TABLE api_providers;
      ALTER TABLE api_providers_new RENAME TO api_providers;
    `);
    }
  } catch {
    /* migration already done or not needed */
  }
  try {
    db.exec("ALTER TABLE oauth_accounts ADD COLUMN label TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE oauth_accounts ADD COLUMN model_override TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE oauth_accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE oauth_accounts ADD COLUMN priority INTEGER NOT NULL DEFAULT 100");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE oauth_accounts ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE oauth_accounts ADD COLUMN last_error TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE oauth_accounts ADD COLUMN last_error_at INTEGER");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE oauth_accounts ADD COLUMN last_success_at INTEGER");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE tasks ADD COLUMN base_branch TEXT");
  } catch {
    /* already exists */
  }
  try {
    db.exec("ALTER TABLE projects ADD COLUMN github_repo TEXT");
  } catch {
    /* already exists */
  }

  function migrateOAuthActiveAccountsTable(): void {
    const cols = db.prepare("PRAGMA table_info(oauth_active_accounts)").all() as Array<{
      name: string;
      pk: number;
    }>;
    if (cols.length === 0) return;
    const providerPk = cols.find((c) => c.name === "provider")?.pk ?? 0;
    const accountPk = cols.find((c) => c.name === "account_id")?.pk ?? 0;
    const hasCompositePk = providerPk === 1 && accountPk === 2;
    if (hasCompositePk) return;

    db.exec("BEGIN");
    try {
      db.exec("ALTER TABLE oauth_active_accounts RENAME TO oauth_active_accounts_legacy");
      db.exec(`
      CREATE TABLE oauth_active_accounts (
        provider TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES oauth_accounts(id) ON DELETE CASCADE,
        updated_at INTEGER DEFAULT (unixepoch()*1000),
        PRIMARY KEY (provider, account_id)
      )
    `);
      db.exec(`
      INSERT OR IGNORE INTO oauth_active_accounts (provider, account_id, updated_at)
      SELECT provider, account_id, COALESCE(updated_at, unixepoch() * 1000)
      FROM oauth_active_accounts_legacy
      WHERE provider IS NOT NULL AND account_id IS NOT NULL
    `);
      db.exec("DROP TABLE oauth_active_accounts_legacy");
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  migrateOAuthActiveAccountsTable();

  function getActiveOAuthAccountIds(provider: string): string[] {
    return (
      db
        .prepare(
          `
    SELECT oa.account_id
    FROM oauth_active_accounts oa
    JOIN oauth_accounts a ON a.id = oa.account_id
    WHERE oa.provider = ?
      AND a.provider = ?
      AND a.status = 'active'
    ORDER BY oa.updated_at DESC, a.priority ASC, a.updated_at DESC
  `,
        )
        .all(provider, provider) as Array<{ account_id: string }>
    ).map((r) => r.account_id);
  }

  function setActiveOAuthAccount(provider: string, accountId: string): void {
    db.prepare(
      `
    INSERT INTO oauth_active_accounts (provider, account_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(provider, account_id) DO UPDATE SET
      updated_at = excluded.updated_at
  `,
    ).run(provider, accountId, nowMs());
  }

  function removeActiveOAuthAccount(provider: string, accountId: string): void {
    db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ? AND account_id = ?").run(provider, accountId);
  }

  function setOAuthActiveAccounts(provider: string, accountIds: string[]): void {
    const cleaned = Array.from(new Set(accountIds.filter(Boolean)));
    runInTransaction(() => {
      db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
      if (cleaned.length === 0) return;
      const stmt = db.prepare(`
      INSERT INTO oauth_active_accounts (provider, account_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(provider, account_id) DO UPDATE SET
        updated_at = excluded.updated_at
    `);
      let stamp = nowMs();
      for (const id of cleaned) {
        stmt.run(provider, id, stamp);
        stamp += 1;
      }
    });
  }

  function oauthProviderPrefix(provider: string): string {
    return provider === "github" ? "Copi" : "Anti";
  }

  function normalizeOAuthProvider(provider: string): "github" | "google_antigravity" | null {
    if (provider === "github-copilot" || provider === "github" || provider === "copilot") return "github";
    if (provider === "antigravity" || provider === "google_antigravity") return "google_antigravity";
    return null;
  }

  function getNextOAuthLabel(provider: string): string {
    const normalizedProvider = normalizeOAuthProvider(provider) ?? provider;
    const prefix = oauthProviderPrefix(normalizedProvider);
    const rows = db.prepare("SELECT label FROM oauth_accounts WHERE provider = ?").all(normalizedProvider) as Array<{
      label: string | null;
    }>;
    let maxSeq = 0;
    for (const row of rows) {
      if (!row.label) continue;
      const m = row.label.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (!m) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
    return `${prefix}-${maxSeq + 1}`;
  }

  function ensureOAuthActiveAccount(provider: string): void {
    db.prepare(
      `
    DELETE FROM oauth_active_accounts
    WHERE provider = ?
      AND account_id NOT IN (
        SELECT id FROM oauth_accounts WHERE provider = ? AND status = 'active'
      )
  `,
    ).run(provider, provider);

    const activeIds = getActiveOAuthAccountIds(provider);
    if (activeIds.length > 0) return;

    const fallback = db
      .prepare(
        "SELECT id FROM oauth_accounts WHERE provider = ? AND status = 'active' ORDER BY priority ASC, updated_at DESC LIMIT 1",
      )
      .get(provider) as { id: string } | undefined;
    if (!fallback) {
      db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
      return;
    }
    setActiveOAuthAccount(provider, fallback.id);
  }

  function migrateLegacyOAuthCredentialsToAccounts(): void {
    const legacyRows = db
      .prepare(
        `
    SELECT provider, source, email, scope, expires_at, access_token_enc, refresh_token_enc, created_at, updated_at
    FROM oauth_credentials
    WHERE provider IN ('github','google_antigravity')
  `,
      )
      .all() as Array<{
      provider: string;
      source: string | null;
      email: string | null;
      scope: string | null;
      expires_at: number | null;
      access_token_enc: string | null;
      refresh_token_enc: string | null;
      created_at: number;
      updated_at: number;
    }>;

    for (const row of legacyRows) {
      const hasAccounts = db
        .prepare("SELECT COUNT(*) as cnt FROM oauth_accounts WHERE provider = ?")
        .get(row.provider) as {
        cnt: number;
      };
      if (hasAccounts.cnt > 0) continue;
      if (!row.access_token_enc && !row.refresh_token_enc) continue;
      const id = randomUUID();
      const label = getNextOAuthLabel(row.provider);
      db.prepare(
        `
      INSERT INTO oauth_accounts (
        id, provider, source, label, email, scope, expires_at,
        access_token_enc, refresh_token_enc, status, priority,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 100, ?, ?)
    `,
      ).run(
        id,
        row.provider,
        row.source,
        label,
        row.email,
        row.scope,
        row.expires_at,
        row.access_token_enc,
        row.refresh_token_enc,
        row.created_at || nowMs(),
        row.updated_at || nowMs(),
      );
    }

    ensureOAuthActiveAccount("github");
    ensureOAuthActiveAccount("google_antigravity");
  }

  migrateLegacyOAuthCredentialsToAccounts();

  return {
    ensureOAuthActiveAccount,
    getActiveOAuthAccountIds,
    setActiveOAuthAccount,
    setOAuthActiveAccounts,
    removeActiveOAuthAccount,
    oauthProviderPrefix,
    normalizeOAuthProvider,
    getNextOAuthLabel,
  };
}
