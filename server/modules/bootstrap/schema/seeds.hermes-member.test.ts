import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { applyBaseSchema } from "./base-schema.ts";
import { applyDefaultSeeds } from "./seeds.ts";

describe("default agent seed lifecycle", () => {
  it("does not recreate deleted default agents after a Notion-linked roster is installed", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyBaseSchema(db);
      applyDefaultSeeds(db);
      db.exec("DELETE FROM agents");

      const insert = db.prepare(`
        INSERT INTO agents (id, name, department_id, role, personality)
        VALUES (?, ?, 'dev', 'senior', ?)
      `);
      for (const [index, name] of ["Apollo", "Argus", "Athena", "Daedalus", "Iris", "Metis"].entries()) {
        insert.run(`linked-${index}`, name, `hermes-member:${String(index).padStart(64, "0")}`);
      }

      applyDefaultSeeds(db);

      const rows = db.prepare("SELECT name, personality FROM agents ORDER BY name").all() as Array<{
        name: string;
        personality: string;
      }>;
      expect(rows.map((row) => row.name)).toEqual(["Apollo", "Argus", "Athena", "Daedalus", "Iris", "Metis"]);
      expect(rows.every((row) => row.personality.startsWith("hermes-member:"))).toBe(true);
    } finally {
      db.close();
    }
  });

  it("preserves the Notion-managed department order across restarts", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyBaseSchema(db);
      applyDefaultSeeds(db);
      db.exec("DELETE FROM agents");
      db.prepare(`
        INSERT INTO agents (id, name, department_id, role, personality)
        VALUES ('linked-athena', 'Athena', 'dev', 'team_leader', ?)
      `).run(`hermes-member:${"1".repeat(64)}`);

      db.exec("DROP INDEX IF EXISTS idx_departments_sort_order");
      db.prepare("UPDATE departments SET sort_order = 106 WHERE id = 'dev'").run();
      const insert = db.prepare(`
        INSERT INTO departments (id, name, name_ko, name_ja, name_zh, icon, color, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [id, name, icon, color, sortOrder] of [
        ["representative", "代表", "👤", "#ef4444", 101],
        ["secretariat", "秘書室", "🧑‍💼", "#8b5cf6", 102],
        ["marketing", "マーケティング部門", "📊", "#f59e0b", 103],
        ["social", "SNS運用部門", "🌏", "#92400e", 104],
        ["sales", "営業部門", "💸", "#10b981", 105],
        ["backoffice", "バックオフィス部門", "⚙️", "#6b7280", 107],
      ] as const) {
        insert.run(id, name, name, name, name, icon, color, sortOrder);
      }
      db.exec("CREATE UNIQUE INDEX idx_departments_sort_order ON departments(sort_order)");

      applyDefaultSeeds(db);

      const rows = db.prepare(`
        SELECT id, sort_order
        FROM departments
        WHERE id IN ('representative', 'secretariat', 'marketing', 'social', 'sales', 'dev', 'backoffice')
        ORDER BY sort_order
      `).all();
      expect(rows).toEqual([
        { id: "representative", sort_order: 101 },
        { id: "secretariat", sort_order: 102 },
        { id: "marketing", sort_order: 103 },
        { id: "social", sort_order: 104 },
        { id: "sales", sort_order: 105 },
        { id: "dev", sort_order: 106 },
        { id: "backoffice", sort_order: 107 },
      ]);
    } finally {
      db.close();
    }
  });
});
