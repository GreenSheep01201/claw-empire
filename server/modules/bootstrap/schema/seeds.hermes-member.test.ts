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
});
