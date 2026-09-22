import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { restoreDatabaseBackup, verifyDatabaseBackup } from "./backup.js";
import { defaultMigrationsDirectory, loadMigrationsFromDirectory, type Migration } from "./migrationRunner.js";
import { inspectRuntimeDatabase, openRuntimeDatabase, type RuntimeDatabaseHandle } from "./runtimeDatabase.js";

const APP_VERSION = "0.1.0-test";
const BASE_TIME = Date.parse("2026-09-22T02:00:00.000Z");

describe("runtime database entry point", () => {
  let directory: string;
  let dataDir: string;
  let migrations: Migration[];
  const handles: RuntimeDatabaseHandle[] = [];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pm-runtime-db-"));
    dataDir = join(directory, "PMRuntime");
    migrations = loadMigrationsFromDirectory(defaultMigrationsDirectory());
  });

  afterEach(() => {
    while (handles.length > 0) {
      const handle = handles.pop();
      try {
        handle?.close();
      } catch {
        /* already closed */
      }
    }
    rmSync(directory, { recursive: true, force: true });
  });

  async function open(overrides: { migrations?: readonly Migration[] } = {}): Promise<RuntimeDatabaseHandle> {
    const handle = await openRuntimeDatabase({
      dataDir,
      appVersion: APP_VERSION,
      now: () => BASE_TIME,
      ...overrides
    });
    handles.push(handle);
    return handle;
  }

  function insertProject(handle: RuntimeDatabaseHandle, name: string): void {
    handle.database
      .prepare(
        `INSERT INTO projects (id, name, description, created_at, updated_at, deleted_at)
         VALUES (:id, :name, NULL, :at, :at, NULL)`
      )
      .run({ id: newId(), name, at: "2026-09-22T02:00:00.000Z" });
  }

  let counter = 0;
  /** 4 + 16 + 6 = 26 characters, digits and Z only, so the schema accepts it. */
  function newId(): string {
    counter += 1;
    return `01J8${"Z".repeat(16)}${String(counter).padStart(6, "0")}`;
  }

  it("prepares the runtime layout and brings a fresh database to the current schema", async () => {
    const handle = await open();

    expect(handle.appliedMigrations).toEqual([1]);
    expect(handle.schema.status).toBe("current");
    expect(handle.schema.databaseVersion).toBe(1);
    expect(handle.schema.targetVersion).toBe(1);
    expect(handle.params.journalMode).toBe("wal");
    expect(handle.params.foreignKeysEnabled).toBe(true);
    expect(handle.startupBackup).toBeNull();

    expect(existsSync(handle.paths.databasePath)).toBe(true);
    expect(existsSync(handle.paths.backupsDirectory)).toBe(true);
    expect(existsSync(handle.paths.projectsDirectory)).toBe(true);
    expect(existsSync(handle.paths.tempDirectory)).toBe(true);

    const tables = handle.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toContain("projects");
    expect(tables.map((row) => row.name)).toContain("schema_migrations");
  });

  it("is idempotent on the second start and does not back up an unchanged schema", async () => {
    const first = await open();
    insertProject(first, "first");
    first.close();

    const second = await open();
    expect(second.appliedMigrations).toEqual([]);
    expect(second.startupBackup).toBeNull();
    expect(second.schema.status).toBe("current");
    expect(second.schema.databaseVersion).toBe(1);

    const count = second.database.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number };
    expect(count.count).toBe(1);
  });

  it("takes a durable copy before applying a pending migration", async () => {
    const first = await open();
    insertProject(first, "first");
    first.close();

    const extended: Migration[] = [
      ...migrations,
      { version: 2, name: "add_notes", sql: "CREATE TABLE notes (id TEXT NOT NULL PRIMARY KEY) STRICT;" }
    ];
    const second = await open({ migrations: extended });

    expect(second.appliedMigrations).toEqual([2]);
    expect(second.schema.databaseVersion).toBe(2);
    expect(second.startupBackup).not.toBeNull();

    const backup = second.startupBackup;
    expect(backup?.fileName).toContain("pre-migration");
    expect(backup?.schemaVersion).toBe(1);
    expect(backup?.entityCounts.projects).toBe(1);
    // The copy must describe the pre-migration schema, not the new one.
    const verification = verifyDatabaseBackup(backup?.absolutePath ?? "");
    expect(verification.ok).toBe(true);
    expect(verification.entityCounts.notes).toBeUndefined();
  });

  it("refuses to write when the database is ahead of the application", async () => {
    const extended: Migration[] = [
      ...migrations,
      { version: 2, name: "add_notes", sql: "CREATE TABLE notes (id TEXT NOT NULL PRIMARY KEY) STRICT;" }
    ];
    const first = await open({ migrations: extended });
    insertProject(first, "first");
    first.close();

    await expect(open()).rejects.toMatchObject({ code: "MIGRATION_VERSION_REGRESSION" });

    // Diagnostics still work and say why, without touching the schema.
    const inspection = inspectRuntimeDatabase({ dataDir, migrations });
    expect(inspection.databasePresent).toBe(true);
    expect(inspection.schema.status).toBe("read-only");
    expect(inspection.schema.code).toBe("MIGRATION_VERSION_REGRESSION");
    expect(inspection.schema.databaseVersion).toBe(2);
  });

  it("does not create a database while inspecting a directory that has none", () => {
    const inspection = inspectRuntimeDatabase({ dataDir, migrations });

    expect(inspection.databasePresent).toBe(false);
    expect(inspection.params).toBeNull();
    expect(inspection.schema.status).toBe("pending");
    expect(inspection.schema.pendingVersions).toEqual([1]);
    expect(existsSync(inspection.paths.databasePath)).toBe(false);
  });

  it("rejects a data directory that is not a local absolute path", async () => {
    await expect(
      openRuntimeDatabase({ dataDir: "relative/PMRuntime", appVersion: APP_VERSION })
    ).rejects.toMatchObject({ code: "DATA_DIR_NOT_LOCAL" });

    await expect(
      openRuntimeDatabase({ dataDir: "\\\\server\\share\\PMRuntime", appVersion: APP_VERSION })
    ).rejects.toMatchObject({ code: "DATA_DIR_NOT_LOCAL" });
  });

  it("folds the write-ahead log back on close", async () => {
    const handle = await open();
    insertProject(handle, "wal");

    const walPath = `${handle.paths.databasePath}-wal`;
    expect(statSync(walPath).size).toBeGreaterThan(0);

    handle.close();
    expect(existsSync(walPath) ? statSync(walPath).size : 0).toBe(0);
  });

  it("restores the pre-migration copy over the migrated database", async () => {
    const first = await open();
    insertProject(first, "first");
    first.close();

    const extended: Migration[] = [
      ...migrations,
      { version: 2, name: "add_notes", sql: "CREATE TABLE notes (id TEXT NOT NULL PRIMARY KEY) STRICT;" }
    ];
    const second = await open({ migrations: extended });
    const backupPath = second.startupBackup?.absolutePath ?? "";
    expect(backupPath).not.toBe("");
    second.close();

    const restored = restoreDatabaseBackup({ backupPath, targetDatabasePath: second.paths.databasePath });
    expect(restored.verification.ok).toBe(true);

    const reopened = await open();
    expect(reopened.schema.databaseVersion).toBe(1);
    expect(reopened.appliedMigrations).toEqual([]);
    const count = reopened.database.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number };
    expect(count.count).toBe(1);
    const noteTable = reopened.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes'")
      .get();
    expect(noteTable).toBeUndefined();
  });
});
