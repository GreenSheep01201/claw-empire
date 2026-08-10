import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import {
  readNotionManagedDevelopmentDepartmentIds,
  readNotionManagedDevelopmentScope,
} from "./notion-managed-development.ts";

function setupDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      department_id TEXT,
      workflow_pack_key TEXT,
      personality TEXT
    );
  `);
  return db;
}

describe("Notion managed development scope", () => {
  it("returns the complete Notion department catalog when development-pack Hermes members exist", () => {
    const db = setupDb();
    try {
      const marker = (hex: string) => `hermes-member:${hex.repeat(64)}\n\nprofile`;
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?)").run("athena", "dev", "development", marker("a"));
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?)").run("hermes", "secretariat", null, marker("b"));
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?)").run("foreign", "qa", "report", marker("c"));
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?)").run("default", "planning", "development", "default agent");

      expect(readNotionManagedDevelopmentScope(db as any)).toEqual({
        agentIds: ["athena", "hermes"],
        departmentIds: [
          "representative",
          "secretariat",
          "marketing",
          "social",
          "sales",
          "dev",
          "backoffice",
        ],
      });
      expect(readNotionManagedDevelopmentDepartmentIds(db as any)).toEqual([
        "representative",
        "secretariat",
        "marketing",
        "social",
        "sales",
        "dev",
        "backoffice",
      ]);
    } finally {
      db.close();
    }
  });

  it("returns null to preserve vanilla development behavior when no valid marker exists", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?)").run("default", "planning", "development", "default agent");
      db.prepare("INSERT INTO agents VALUES (?, ?, ?, ?)").run("invalid", "dev", "development", `hermes-member:${"z".repeat(64)}`);
      expect(readNotionManagedDevelopmentDepartmentIds(db as any)).toBeNull();
    } finally {
      db.close();
    }
  });
});
