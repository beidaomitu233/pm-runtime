import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteGate } from "./sqliteGate.js";
import {
  applyMigrations,
  checksumMigration,
  defaultMigrationsDirectory,
  inspectSchema,
  loadMigrationsFromDirectory,
  MigrationError,
  parseMigrationFileName,
  planMigrations,
  readAppliedMigrations,
  type Migration
} from "./migrationRunner.js";

const APP_VERSION = "0.1.0-test";

function migration(version: number, sql: string, name = `m${version}`): Migration {
  return { version, name, sql };
}

describe("migration runner", () => {
  let directory: string;
  let dbPath: string;
  let gate: SqliteGate;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pm-migrations-"));
    dbPath = join(directory, "pm.db");
    gate = new SqliteGate(dbPath);
  });

  afterEach(() => {
    gate.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function open() {
    return gate.open();
  }

  it("creates the schema from an empty database and records every version", () => {
    const database = open();
    const result = applyMigrations(
      database,
      [migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);"), migration(2, "CREATE TABLE b (id INTEGER PRIMARY KEY);")],
      { appVersion: APP_VERSION }
    );

    expect(result.previousVersion).toBe(0);
    expect(result.version).toBe(2);
    expect(result.applied.map((entry) => entry.version)).toEqual([1, 2]);
    expect(result.history).toHaveLength(2);
    expect(result.history[0].appVersion).toBe(APP_VERSION);
    expect(result.history[0].appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result.history[0].checksumSha256).toHaveLength(64);
  });

  it("applies nothing on a repeated run and leaves the history untouched", () => {
    const database = open();
    const migrations = [migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);")];
    const first = applyMigrations(database, migrations, { appVersion: APP_VERSION });
    const second = applyMigrations(database, migrations, { appVersion: APP_VERSION });

    expect(second.previousVersion).toBe(1);
    expect(second.applied).toHaveLength(0);
    expect(second.history).toEqual(first.history);
  });

  it("upgrades one version at a time when new migrations appear later", () => {
    const database = open();
    const first = applyMigrations(database, [migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);")], {
      appVersion: "0.1.0"
    });
    const second = applyMigrations(
      database,
      [
        migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);"),
        migration(2, "CREATE TABLE b (id INTEGER PRIMARY KEY);"),
        migration(3, "CREATE TABLE c (id INTEGER PRIMARY KEY);")
      ],
      { appVersion: "0.2.0" }
    );

    expect(first.version).toBe(1);
    expect(second.previousVersion).toBe(1);
    expect(second.applied.map((entry) => entry.version)).toEqual([2, 3]);
    expect(second.history.map((entry) => entry.appVersion)).toEqual(["0.1.0", "0.2.0", "0.2.0"]);
  });

  it("refuses to write when an applied migration was rewritten", () => {
    const database = open();
    const migrations = [migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);")];
    applyMigrations(database, migrations, { appVersion: APP_VERSION });

    database.prepare("UPDATE schema_migrations SET checksum_sha256 = ? WHERE version = 1").run("f".repeat(64));

    const plan = planMigrations(database, migrations);
    expect(plan.kind).toBe("blocked");
    if (plan.kind === "blocked") {
      expect(plan.error.code).toBe("MIGRATION_CHECKSUM_MISMATCH");
      expect(plan.error.details).toMatchObject({ version: 1, recorded: "f".repeat(64) });
    }

    expect(() => applyMigrations(database, migrations, { appVersion: APP_VERSION })).toThrow(MigrationError);
    expect(readAppliedMigrations(database)).toHaveLength(1);
  });

  it("reports read-only diagnostics when the database is newer than the application", () => {
    const database = open();
    applyMigrations(
      database,
      [migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);"), migration(2, "CREATE TABLE b (id INTEGER PRIMARY KEY);")],
      { appVersion: APP_VERSION }
    );

    const inspection = inspectSchema(database, [migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);")]);
    expect(inspection.status).toBe("read-only");
    expect(inspection.code).toBe("MIGRATION_VERSION_REGRESSION");
    expect(inspection.databaseVersion).toBe(2);
    expect(inspection.targetVersion).toBe(1);
  });

  it("rolls a failing migration back and keeps the previous version readable", () => {
    const database = open();
    const good = migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);");
    const broken = migration(2, "CREATE TABLE partial (id INTEGER PRIMARY KEY); THIS IS NOT SQL;");

    expect(() => applyMigrations(database, [good, broken], { appVersion: APP_VERSION })).toThrow(MigrationError);

    expect(readAppliedMigrations(database).map((entry) => entry.version)).toEqual([1]);
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).not.toContain("partial");
    expect(tables.map((row) => row.name)).toContain("a");
  });

  it("surfaces the failing version in the error details", () => {
    const database = open();
    try {
      applyMigrations(database, [migration(7, "NOT SQL;")], { appVersion: APP_VERSION });
      expect.unreachable("a broken migration must not be applied");
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError);
      const failure = error as MigrationError;
      expect(failure.code).toBe("MIGRATION_APPLY_FAILED");
      expect(failure.details).toMatchObject({ version: 7, name: "m7" });
    }
  });

  it("detects a gap in the applied history", () => {
    const database = open();
    applyMigrations(
      database,
      [migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);"), migration(2, "CREATE TABLE b (id INTEGER PRIMARY KEY);")],
      { appVersion: APP_VERSION }
    );
    database.prepare("DELETE FROM schema_migrations WHERE version = 1").run();

    const inspection = inspectSchema(database, [
      migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);"),
      migration(2, "CREATE TABLE b (id INTEGER PRIMARY KEY);")
    ]);
    expect(inspection.status).toBe("read-only");
    expect(inspection.code).toBe("MIGRATION_HISTORY_CORRUPT");
  });

  it("rejects duplicate or non-increasing migration versions", () => {
    const database = open();
    expect(() => applyMigrations(database, [migration(1, "CREATE TABLE a (x INTEGER);"), migration(1, "CREATE TABLE b (x INTEGER);")], { appVersion: APP_VERSION })).toThrow(
      /strictly increase/
    );
    expect(() => applyMigrations(database, [migration(0, "CREATE TABLE a (x INTEGER);")], { appVersion: APP_VERSION })).toThrow(
      /positive integer/
    );
  });

  it("checksums CRLF and LF copies of the same migration identically", () => {
    const unix = migration(1, "CREATE TABLE a (x INTEGER);\nCREATE TABLE b (x INTEGER);\n");
    const windows = migration(1, "CREATE TABLE a (x INTEGER);\r\nCREATE TABLE b (x INTEGER);\r\n");
    expect(checksumMigration(unix)).toBe(checksumMigration(windows));
  });

  it("reports pending versions before they are applied", () => {
    const database = open();
    const migrations = [migration(1, "CREATE TABLE a (id INTEGER PRIMARY KEY);")];
    const before = inspectSchema(database, migrations);
    expect(before).toMatchObject({ status: "pending", pendingVersions: [1], databaseVersion: 0, targetVersion: 1 });

    applyMigrations(database, migrations, { appVersion: APP_VERSION });
    expect(inspectSchema(database, migrations).status).toBe("current");
  });
});

describe("migration file loading", () => {
  it("parses NNNN_name.sql and rejects anything else", () => {
    expect(parseMigrationFileName("0001_initial.sql")).toEqual({ version: 1, name: "initial" });
    expect(parseMigrationFileName("0002_add_settings_key.sql")).toEqual({ version: 2, name: "add_settings_key" });
    expect(parseMigrationFileName("initial.sql")).toBeNull();
    expect(parseMigrationFileName("1_initial.sql")).toBeNull();
    expect(parseMigrationFileName("0001 initial.sql")).toBeNull();
  });

  it("loads the packaged migrations and applies the initial schema", () => {
    const migrations = loadMigrationsFromDirectory(defaultMigrationsDirectory());
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0].version).toBe(1);

    const directory = mkdtempSync(join(tmpdir(), "pm-schema-"));
    const gate = new SqliteGate(join(directory, "pm.db"));
    try {
      const database = gate.open();
      const result = applyMigrations(database, migrations, { appVersion: APP_VERSION });

      expect(result.version).toBe(migrations[migrations.length - 1].version);
      const tables = (database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>).map((row) => row.name);
      for (const expected of [
        "projects",
        "meetings",
        "diagrams",
        "diagram_revisions",
        "diagram_source_refs",
        "agent_adapters",
        "settings",
        "idempotency_records"
      ]) {
        expect(tables).toContain(expected);
      }
    } finally {
      gate.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
