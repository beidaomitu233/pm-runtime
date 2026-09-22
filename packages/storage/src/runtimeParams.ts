import Database from "better-sqlite3";
import { accessSync, constants as fsConstants, existsSync, mkdirSync, statSync } from "node:fs";
import { isAbsolute, dirname, join, resolve } from "node:path";

/**
 * DB-002 SQLite runtime parameters.
 *
 * These values are locked here rather than at each call site so that WAL,
 * foreign keys and the busy timeout cannot drift between the daemon, the
 * migration runner and the tests. `readRuntimeParams` is the single reader
 * used both for diagnostics and for tests that assert the values really took
 * effect on the live connection.
 */

export const SQLITE_RUNTIME_PARAMS = Object.freeze({
  /** SQLite defaults this off; the schema uses FKs for every parent relation. */
  foreignKeys: true,
  /**
   * WAL is required for the reader-during-write behaviour the API relies on:
   * a list query must not block behind an import or a render.
   */
  journalMode: "WAL" as const,
  /** A writer waits for a competing writer instead of failing immediately. */
  busyTimeoutMs: 5_000,
  /**
   * With WAL, NORMAL is durable across an application crash or a killed
   * process. It is *not* durable across a power loss or a hard reset; that
   * would need FULL. See docs/decisions/DB-002-sqlite-runtime-params.md.
   */
  synchronous: "NORMAL" as const,
  /** Bounds WAL growth without an explicit checkpoint after every write. */
  walAutocheckpointPages: 1_000,
  /** PDF-free desktop app: 16 MiB of page cache is cheap and cuts re-reads. */
  cacheSizeKib: 16 * 1024
});

export type CheckpointMode = "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE";

export type RuntimeParamsErrorCode =
  | "DATA_DIR_NOT_LOCAL"
  | "DATA_DIR_INVALID"
  | "DATA_DIR_NOT_WRITABLE"
  | "DATABASE_OPEN_FAILED"
  | "PRAGMA_FAILED";

export class RuntimeParamsError extends Error {
  readonly code: RuntimeParamsErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: RuntimeParamsErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "RuntimeParamsError";
    this.code = code;
    this.details = details;
  }
}

function reject(code: RuntimeParamsErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new RuntimeParamsError(code, message, details);
}

export interface RuntimePaths {
  /** Absolute runtime directory; everything below it belongs to this install. */
  root: string;
  /** `<root>/data/pm.db` (DATABASE_PLAN section 2). */
  databasePath: string;
  /** `<root>/backups`; DB-006 writes consistent copies here. */
  backupsDirectory: string;
  /** `<root>/projects`; file store root for meeting and revision files. */
  projectsDirectory: string;
  /** `<root>/.tmp`; staging area for atomic renames. */
  tempDirectory: string;
}

/**
 * Accepts only a local, absolute, writable directory.
 *
 * A UNC path is rejected outright because SQLite locking over SMB is not
 * reliable enough to be the single writer of a local-first database. A mapped
 * network drive is indistinguishable from a local one by path alone, so that
 * case is documented as a known limit rather than silently accepted
 * (docs/decisions/DB-002-sqlite-runtime-params.md).
 */
export function assertLocalDataDirectory(dataDir: string): string {
  if (typeof dataDir !== "string" || dataDir.trim().length === 0) {
    reject("DATA_DIR_NOT_LOCAL", "data directory must be a non-empty string");
  }
  if (dataDir.startsWith("\\\\") || dataDir.startsWith("//")) {
    reject("DATA_DIR_NOT_LOCAL", "a UNC data directory is not supported", { dataDir });
  }
  if (!isAbsolute(dataDir)) {
    reject("DATA_DIR_NOT_LOCAL", "data directory must be absolute", { dataDir });
  }

  const absolute = resolve(dataDir);
  if (existsSync(absolute)) {
    if (!statSync(absolute).isDirectory()) {
      reject("DATA_DIR_INVALID", "data directory path exists and is not a directory", { dataDir: absolute });
    }
  } else {
    try {
      mkdirSync(absolute, { recursive: true });
    } catch (error) {
      reject("DATA_DIR_NOT_WRITABLE", `creating the data directory failed: ${describe(error)}`, {
        dataDir: absolute
      });
    }
  }

  try {
    accessSync(absolute, fsConstants.W_OK);
  } catch {
    reject("DATA_DIR_NOT_WRITABLE", "data directory is not writable", { dataDir: absolute });
  }
  return absolute;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Pure path computation; call `assertLocalDataDirectory` before relying on it. */
export function resolveRuntimePaths(dataDir: string): RuntimePaths {
  const root = resolve(dataDir);
  return {
    root,
    databasePath: join(root, "data", "pm.db"),
    backupsDirectory: join(root, "backups"),
    projectsDirectory: join(root, "projects"),
    tempDirectory: join(root, ".tmp")
  };
}

/**
 * Creates the directories the documented layout needs. Kept separate from
 * `resolveRuntimePaths` so path arithmetic stays side-effect free and a test
 * can assert the layout without touching the filesystem. Idempotent.
 */
export function ensureRuntimeDirectories(paths: RuntimePaths): RuntimePaths {
  for (const directory of [
    dirname(paths.databasePath),
    paths.backupsDirectory,
    paths.projectsDirectory,
    paths.tempDirectory
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  return paths;
}

export interface SqliteRuntimeParams {
  sqliteVersion: string;
  pageSize: number;
  foreignKeysEnabled: boolean;
  /** Lower-cased, as SQLite reports it: `wal`, `delete`, `memory`. */
  journalMode: string;
  /** milliseconds */
  busyTimeoutMs: number;
  /** Raw pragma value: 0=OFF 1=NORMAL 2=FULL 3=EXTRA. */
  synchronous: number;
  walAutocheckpointPages: number;
  /** Negative: KiB of cache rather than a page count. */
  cacheSize: number;
}

export interface OpenSqliteOptions {
  busyTimeoutMs?: number;
  fileMustExist?: boolean;
  /** Diagnostics only. WAL cannot be enabled on a read-only connection. */
  readonly?: boolean;
}

/** Applies the locked parameters and verifies the two that silently do nothing. */
export function applyRuntimePragmas(
  database: Database.Database,
  overrides: { busyTimeoutMs?: number } = {}
): void {
  const busyTimeoutMs = overrides.busyTimeoutMs ?? SQLITE_RUNTIME_PARAMS.busyTimeoutMs;

  database.pragma("foreign_keys = ON");
  database.pragma(`busy_timeout = ${Math.trunc(busyTimeoutMs)}`);
  database.pragma(`synchronous = ${SQLITE_RUNTIME_PARAMS.synchronous}`);
  database.pragma(`wal_autocheckpoint = ${SQLITE_RUNTIME_PARAMS.walAutocheckpointPages}`);
  database.pragma(`cache_size = ${-SQLITE_RUNTIME_PARAMS.cacheSizeKib}`);
  // journal_mode is the one setting SQLite may refuse to change: it is a
  // no-op inside a transaction and cannot be set on a read-only connection.
  const journalMode = String(database.pragma(`journal_mode = ${SQLITE_RUNTIME_PARAMS.journalMode}`, {
    simple: true
  })).toLowerCase();
  if (journalMode !== SQLITE_RUNTIME_PARAMS.journalMode.toLowerCase()) {
    reject("PRAGMA_FAILED", `SQLite refused journal_mode=${SQLITE_RUNTIME_PARAMS.journalMode}`, {
      reported: journalMode
    });
  }

  const params = readRuntimeParams(database);
  if (!params.foreignKeysEnabled) {
    reject("PRAGMA_FAILED", "foreign_keys did not stay enabled");
  }
}

export function readRuntimeParams(database: Database.Database): SqliteRuntimeParams {
  return {
    sqliteVersion: String(
      (database.prepare("SELECT sqlite_version() AS version").get() as { version: string }).version
    ),
    pageSize: Number(database.pragma("page_size", { simple: true })),
    foreignKeysEnabled: Number(database.pragma("foreign_keys", { simple: true })) === 1,
    journalMode: String(database.pragma("journal_mode", { simple: true })).toLowerCase(),
    busyTimeoutMs: Number(database.pragma("busy_timeout", { simple: true })),
    synchronous: Number(database.pragma("synchronous", { simple: true })),
    walAutocheckpointPages: Number(database.pragma("wal_autocheckpoint", { simple: true })),
    cacheSize: Number(database.pragma("cache_size", { simple: true }))
  };
}

export function openSqliteDatabase(databasePath: string, options: OpenSqliteOptions = {}): Database.Database {
  let database: Database.Database;
  try {
    database = new Database(databasePath, {
      timeout: options.busyTimeoutMs ?? SQLITE_RUNTIME_PARAMS.busyTimeoutMs,
      fileMustExist: options.fileMustExist ?? false,
      readonly: options.readonly ?? false
    });
  } catch (error) {
    reject("DATABASE_OPEN_FAILED", `opening the database failed: ${describe(error)}`, { databasePath });
  }

  if (!options.readonly) {
    try {
      applyRuntimePragmas(database, { busyTimeoutMs: options.busyTimeoutMs });
    } catch (error) {
      database.close();
      throw error;
    }
  }
  return database;
}

export interface CheckpointResult {
  /** 1 when a reader or writer blocked the checkpoint. */
  busy: number;
  logFrames: number;
  checkpointedFrames: number;
}

/**
 * Folds the WAL back into the main database file. TRUNCATE also empties the
 * `-wal` file, which is what a pre-backup or pre-close checkpoint wants.
 */
export function checkpointWal(database: Database.Database, mode: CheckpointMode = "TRUNCATE"): CheckpointResult {
  const rows = database.pragma(`wal_checkpoint(${mode})`) as Array<{
    busy: number;
    log: number;
    checkpointed: number;
  }>;
  const row = rows[0] ?? { busy: 0, log: 0, checkpointed: 0 };
  return { busy: row.busy, logFrames: row.log, checkpointedFrames: row.checkpointed };
}

export interface IntegrityReport {
  ok: boolean;
  problems: string[];
}

/**
 * Full `integrity_check` rather than `quick_check`: it also verifies index
 * contents, which is what makes it usable as the DB-006 backup acceptance
 * gate and the DB-015 audit primitive.
 */
export function integrityCheck(database: Database.Database): IntegrityReport {
  const rows = database.pragma("integrity_check") as Array<{ integrity_check: string }>;
  const problems = rows.map((row) => String(row.integrity_check)).filter((value) => value !== "ok");
  return { ok: problems.length === 0, problems };
}

/**
 * Converts a database file out of WAL into the plain rollback journal.
 *
 * A WAL-mode database is only complete together with its `-wal` and `-shm`
 * companions, which is exactly what a single-file backup must not depend on.
 * The mode change checkpoints the WAL into the main file and removes the
 * companions, so the result is one self-contained file.
 */
export function convertToRollbackJournal(databasePath: string): void {
  const database = new Database(databasePath);
  try {
    database.pragma("journal_mode = DELETE");
  } finally {
    database.close();
  }
}

/**
 * Closing with a TRUNCATE checkpoint keeps the next start from having to
 * replay a large WAL. It is best effort: a busy checkpoint still closes
 * cleanly, and the WAL is simply recovered on the next open.
 */
export function closeSqliteDatabase(
  database: Database.Database,
  options: { checkpoint?: boolean } = {}
): CheckpointResult | null {
  let result: CheckpointResult | null = null;
  if (options.checkpoint ?? true) {
    try {
      result = checkpointWal(database, "TRUNCATE");
    } catch {
      result = null;
    }
  }
  database.close();
  return result;
}
