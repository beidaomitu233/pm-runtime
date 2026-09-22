import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertLocalDataDirectory,
  checkpointWal,
  closeSqliteDatabase,
  integrityCheck,
  openSqliteDatabase,
  readRuntimeParams,
  resolveRuntimePaths,
  RuntimeParamsError,
  SQLITE_RUNTIME_PARAMS
} from "./runtimeParams.js";

describe("sqlite runtime parameters", () => {
  let directory: string;
  const open: BetterSqlite3.Database[] = [];

  function track(database: BetterSqlite3.Database): BetterSqlite3.Database {
    open.push(database);
    return database;
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pm-params-"));
  });

  afterEach(() => {
    while (open.length > 0) {
      const database = open.pop();
      try {
        database?.close();
      } catch {
        /* already closed */
      }
    }
    rmSync(directory, { recursive: true, force: true });
  });

  function dbPath(name = "pm.db"): string {
    return join(directory, name);
  }

  it("rejects a relative data directory, a UNC path and a path that is a file", () => {
    expect(() => assertLocalDataDirectory("relative/data")).toThrowError(
      expect.objectContaining({ code: "DATA_DIR_NOT_LOCAL" })
    );
    expect(() => assertLocalDataDirectory("\\\\server\\share\\PMRuntime")).toThrowError(
      expect.objectContaining({ code: "DATA_DIR_NOT_LOCAL" })
    );

    const filePath = join(directory, "not-a-directory");
    writeFileSync(filePath, "x");
    expect(() => assertLocalDataDirectory(filePath)).toThrowError(
      expect.objectContaining({ code: "DATA_DIR_INVALID" })
    );

    expect(() => assertLocalDataDirectory("")).toThrow(RuntimeParamsError);
  });

  it("creates the runtime directory tree and derives the documented paths", () => {
    const root = assertLocalDataDirectory(join(directory, "PMRuntime"));
    const paths = resolveRuntimePaths(root);

    expect(existsSync(root)).toBe(true);
    expect(paths.databasePath).toBe(join(root, "data", "pm.db"));
    expect(paths.backupsDirectory).toBe(join(root, "backups"));
    expect(paths.tempDirectory).toBe(join(root, ".tmp"));
  });

  it("applies every locked parameter to the live connection", () => {
    const database = track(openSqliteDatabase(dbPath()));
    const params = readRuntimeParams(database);

    expect(params.foreignKeysEnabled).toBe(true);
    expect(params.journalMode).toBe("wal");
    expect(params.busyTimeoutMs).toBe(SQLITE_RUNTIME_PARAMS.busyTimeoutMs);
    // 1 = NORMAL; 2 = FULL would be required for power-loss durability.
    expect(params.synchronous).toBe(1);
    expect(params.walAutocheckpointPages).toBe(SQLITE_RUNTIME_PARAMS.walAutocheckpointPages);
    expect(params.cacheSize).toBe(-SQLITE_RUNTIME_PARAMS.cacheSizeKib);
    expect(params.sqliteVersion).toMatch(/^3\./);
  });

  it("honours a per-connection busy timeout override", () => {
    const database = track(openSqliteDatabase(dbPath(), { busyTimeoutMs: 250 }));
    expect(readRuntimeParams(database).busyTimeoutMs).toBe(250);
  });

  it("keeps WAL enabled for a connection that never sets the pragma", () => {
    const first = track(openSqliteDatabase(dbPath()));
    first.exec("CREATE TABLE marker (id INTEGER PRIMARY KEY)");
    first.close();

    // WAL is recorded in the database header, so a later open inherits it.
    const plain = track(openSqliteDatabase(dbPath()));
    expect(readRuntimeParams(plain).journalMode).toBe("wal");
  });

  it("lets a reader proceed while a writer holds the write lock, and makes a second writer wait", () => {
    const path = dbPath();
    const writer = track(openSqliteDatabase(path));
    writer.exec("CREATE TABLE events (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
    writer.prepare("INSERT INTO events (id, label) VALUES (?, ?)").run(1, "committed");

    const reader = track(openSqliteDatabase(path, { busyTimeoutMs: 250 }));

    writer.exec("BEGIN IMMEDIATE");
    writer.prepare("INSERT INTO events (id, label) VALUES (?, ?)").run(2, "uncommitted");

    // A second writer is refused rather than silently interleaving.
    expect(() => reader.prepare("INSERT INTO events (id, label) VALUES (?, ?)").run(3, "blocked")).toThrowError(
      expect.objectContaining({ code: "SQLITE_BUSY" })
    );

    // The reader still sees the last committed snapshot and is not blocked.
    const visible = reader.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
    expect(visible.count).toBe(1);

    writer.exec("COMMIT");
    reader.prepare("INSERT INTO events (id, label) VALUES (?, ?)").run(4, "after-commit");
    const total = reader.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
    expect(total.count).toBe(3);
  });

  it("truncates the write-ahead log on a TRUNCATE checkpoint", () => {
    const path = dbPath();
    const database = track(openSqliteDatabase(path));
    database.exec("CREATE TABLE payload (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
    const insert = database.prepare("INSERT INTO payload (id, body) VALUES (?, ?)");
    database.transaction(() => {
      for (let index = 1; index <= 400; index += 1) {
        insert.run(index, "x".repeat(512));
      }
    })();

    const walPath = `${path}-wal`;
    expect(statSync(walPath).size).toBeGreaterThan(0);

    const result = checkpointWal(database, "TRUNCATE");
    expect(result.busy).toBe(0);
    expect(statSync(walPath).size).toBe(0);
    expect(integrityCheck(database).ok).toBe(true);

    closeSqliteDatabase(database, { checkpoint: false });
    open.length = 0;
  });

  describe("abnormal termination", () => {
    function runChildScript(script: string): void {
      const result = spawnSync(process.execPath, ["-e", script], {
        cwd: process.cwd(),
        encoding: "utf8"
      });
      // SIGKILL on Windows surfaces as a non-zero exit status or a signal.
      expect(result.error).toBeUndefined();
    }

    it("keeps committed rows when the process is killed without closing", () => {
      const path = dbPath("crash-committed.db");
      runChildScript(`
        const Database = require('better-sqlite3');
        const db = new Database(${JSON.stringify(path)});
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
        const insert = db.prepare('INSERT INTO notes (id, body) VALUES (?, ?)');
        db.transaction(() => { for (let i = 1; i <= 25; i += 1) insert.run(i, 'row-' + i); })();
        process.kill(process.pid, 'SIGKILL');
      `);

      const database = track(openSqliteDatabase(path));
      expect(integrityCheck(database).ok).toBe(true);
      const count = database.prepare("SELECT COUNT(*) AS count FROM notes").get() as { count: number };
      expect(count.count).toBe(25);
    });

    it("discards an uncommitted transaction after the writer is killed", () => {
      const path = dbPath("crash-uncommitted.db");
      runChildScript(`
        const Database = require('better-sqlite3');
        const db = new Database(${JSON.stringify(path)});
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
        db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
        db.prepare('INSERT INTO notes (id, body) VALUES (?, ?)').run(1, 'committed');
        db.exec('BEGIN IMMEDIATE');
        db.prepare('INSERT INTO notes (id, body) VALUES (?, ?)').run(2, 'never-committed');
        process.kill(process.pid, 'SIGKILL');
      `);

      const database = track(openSqliteDatabase(path));
      expect(integrityCheck(database).ok).toBe(true);
      const rows = database.prepare("SELECT id FROM notes ORDER BY id").all() as Array<{ id: number }>;
      expect(rows.map((row) => row.id)).toEqual([1]);
    });
  });
});
