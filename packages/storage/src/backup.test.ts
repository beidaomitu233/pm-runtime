import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BACKUP_TEMP_DIRECTORY,
  createDatabaseBackup,
  listDatabaseBackups,
  pruneDatabaseBackups,
  readDatabaseInventory,
  restoreDatabaseBackup,
  verifyDatabaseBackup
} from "./backup.js";
import { applyMigrations, defaultMigrationsDirectory, loadMigrationsFromDirectory } from "./migrationRunner.js";
import {
  assertLocalDataDirectory,
  closeSqliteDatabase,
  ensureRuntimeDirectories,
  openSqliteDatabase,
  resolveRuntimePaths
} from "./runtimeParams.js";
import { RepositoryContext } from "./repository.js";

const APP_VERSION = "0.1.0-test";
const BASE_TIME = Date.parse("2026-09-22T01:00:00.000Z");

describe("database backup", () => {
  let directory: string;
  let databasePath: string;
  let backupsDirectory: string;
  let database: BetterSqlite3.Database;
  let context: RepositoryContext;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pm-backup-"));
    // Use the real runtime layout so the tests cover the documented paths.
    const paths = ensureRuntimeDirectories(
      resolveRuntimePaths(assertLocalDataDirectory(join(directory, "PMRuntime")))
    );
    databasePath = paths.databasePath;
    backupsDirectory = paths.backupsDirectory;
    database = openSqliteDatabase(databasePath);
    applyMigrations(database, loadMigrationsFromDirectory(defaultMigrationsDirectory()), {
      appVersion: APP_VERSION
    });
    context = new RepositoryContext({ database, now: () => BASE_TIME });
  });

  afterEach(() => {
    if (database) {
      closeSqliteDatabase(database, { checkpoint: false });
    }
    rmSync(directory, { recursive: true, force: true });
  });

  function insertProjects(count: number): void {
    context.transaction(() => {
      for (let index = 0; index < count; index += 1) {
        database
          .prepare(
            `INSERT INTO projects (id, name, description, created_at, updated_at, deleted_at)
             VALUES (:id, :name, NULL, :at, :at, NULL)`
          )
          .run({
            id: context.newId(),
            name: `project-${index}-${context.newId().slice(-6)}`,
            at: context.now()
          });
      }
    });
  }

  it("publishes a verified backup and leaves no staging file behind", async () => {
    insertProjects(3);

    const record = await createDatabaseBackup({ database, backupsDirectory, now: () => BASE_TIME });

    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.byteLength).toBeGreaterThan(0);
    expect(record.schemaVersion).toBe(1);
    expect(record.entityCounts.projects).toBe(3);
    expect(existsSync(record.absolutePath)).toBe(true);
    expect(readdirSync(join(backupsDirectory, BACKUP_TEMP_DIRECTORY))).toEqual([]);

    const verification = verifyDatabaseBackup(record.absolutePath);
    expect(verification.ok).toBe(true);
    expect(verification.sha256).toBe(record.sha256);
  });

  it("captures the committed state at backup time rather than the current file", async () => {
    insertProjects(2);
    const first = await createDatabaseBackup({ database, backupsDirectory, now: () => BASE_TIME });

    insertProjects(3);
    const second = await createDatabaseBackup({
      database,
      backupsDirectory,
      now: () => BASE_TIME + 1_000
    });

    expect(verifyDatabaseBackup(first.absolutePath).entityCounts.projects).toBe(2);
    expect(verifyDatabaseBackup(second.absolutePath).entityCounts.projects).toBe(5);
    expect(readDatabaseInventory(database).entityCounts.projects).toBe(5);
  });

  it("excludes uncommitted rows when another connection is mid-transaction", async () => {
    insertProjects(1);
    const other = openSqliteDatabase(databasePath, { busyTimeoutMs: 250 });
    try {
      other.exec("BEGIN IMMEDIATE");
      other
        .prepare(
          `INSERT INTO projects (id, name, description, created_at, updated_at, deleted_at)
           VALUES (:id, :name, NULL, :at, :at, NULL)`
        )
        .run({ id: context.newId(), name: "not-committed", at: context.now() });

      const record = await createDatabaseBackup({ database, backupsDirectory, now: () => BASE_TIME });
      expect(record.entityCounts.projects).toBe(1);

      other.exec("ROLLBACK");
    } finally {
      closeSqliteDatabase(other, { checkpoint: false });
    }

    const afterRollback = await createDatabaseBackup({
      database,
      backupsDirectory,
      now: () => BASE_TIME + 1_000
    });
    expect(afterRollback.entityCounts.projects).toBe(1);
  });

  it("reports a damaged backup as unusable instead of throwing", async () => {
    insertProjects(1);
    const record = await createDatabaseBackup({ database, backupsDirectory, now: () => BASE_TIME });

    const wiped = readFileSync(record.absolutePath);
    wiped.fill(0, 0, 16);
    writeFileSync(record.absolutePath, wiped);

    const headerDamage = verifyDatabaseBackup(record.absolutePath);
    expect(headerDamage.ok).toBe(false);
    expect(headerDamage.problem).toBeDefined();

    const second = await createDatabaseBackup({
      database,
      backupsDirectory,
      now: () => BASE_TIME + 1_000
    });
    writeFileSync(second.absolutePath, readFileSync(second.absolutePath).subarray(0, 2_048));

    const truncated = verifyDatabaseBackup(second.absolutePath);
    expect(truncated.ok).toBe(false);
    expect(truncated.problem).toBeDefined();
  });

  it("restores a backup into a fresh location with matching entity counts", async () => {
    insertProjects(4);
    const record = await createDatabaseBackup({ database, backupsDirectory, now: () => BASE_TIME });

    const targetPath = join(directory, "restored", "pm.db");
    const result = restoreDatabaseBackup({ backupPath: record.absolutePath, targetDatabasePath: targetPath });

    expect(result.verification.ok).toBe(true);
    expect(result.verification.entityCounts.projects).toBe(4);
    expect(result.restoredAt).toBeTruthy();

    const restored = openSqliteDatabase(targetPath, { fileMustExist: true });
    try {
      const count = restored.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number };
      expect(count.count).toBe(4);
      // The restored copy must still be a working database, not just readable.
      restored
        .prepare(
          `INSERT INTO projects (id, name, description, created_at, updated_at, deleted_at)
           VALUES (:id, :name, NULL, :at, :at, NULL)`
        )
        .run({ id: context.newId(), name: "after-restore", at: context.now() });
      expect((restored.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number }).count).toBe(5);
    } finally {
      closeSqliteDatabase(restored, { checkpoint: false });
    }
  });

  it("drops the write-ahead log of the database it replaces", async () => {
    insertProjects(1);
    const record = await createDatabaseBackup({ database, backupsDirectory, now: () => BASE_TIME });

    const targetPath = join(directory, "replaced.db");
    writeFileSync(targetPath, "not-a-database");
    writeFileSync(`${targetPath}-wal`, "stale");
    writeFileSync(`${targetPath}-shm`, "stale");

    const result = restoreDatabaseBackup({ backupPath: record.absolutePath, targetDatabasePath: targetPath });

    expect(result.verification.ok).toBe(true);
    expect(existsSync(`${targetPath}-wal`)).toBe(false);
    expect(existsSync(`${targetPath}-shm`)).toBe(false);
  });

  it("refuses to restore a backup that does not verify", async () => {
    insertProjects(1);
    const record = await createDatabaseBackup({ database, backupsDirectory, now: () => BASE_TIME });
    writeFileSync(record.absolutePath, "definitely not a database");

    expect(() =>
      restoreDatabaseBackup({
        backupPath: record.absolutePath,
        targetDatabasePath: join(directory, "restored", "pm.db")
      })
    ).toThrowError(expect.objectContaining({ code: "BACKUP_VERIFY_FAILED" }));
  });

  it("lists newest first and prunes the oldest beyond the retention count", async () => {
    insertProjects(1);
    for (let index = 0; index < 4; index += 1) {
      await createDatabaseBackup({
        database,
        backupsDirectory,
        now: () => BASE_TIME + index * 60_000
      });
    }

    const listed = listDatabaseBackups(backupsDirectory);
    expect(listed).toHaveLength(4);
    expect([...listed].map((entry) => entry.fileName).sort().reverse()).toEqual(listed.map((e) => e.fileName));

    const removed = pruneDatabaseBackups(backupsDirectory, 2);
    expect(removed).toHaveLength(2);
    expect(removed).toEqual(listed.slice(2).map((entry) => entry.fileName));

    const remaining = listDatabaseBackups(backupsDirectory);
    expect(remaining.map((entry) => entry.fileName)).toEqual(listed.slice(0, 2).map((entry) => entry.fileName));
    expect(existsSync(join(backupsDirectory, BACKUP_TEMP_DIRECTORY))).toBe(true);
  });

  it("keeps a label in the file name and strips anything unsafe", async () => {
    insertProjects(1);
    const record = await createDatabaseBackup({
      database,
      backupsDirectory,
      now: () => BASE_TIME,
      label: "pre-migration ../etc"
    });
    expect(record.fileName).toContain("pre-migration");
    expect(record.fileName).not.toContain("..");
    expect(record.fileName).not.toContain("/");
  });
});
