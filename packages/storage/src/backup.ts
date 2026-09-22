import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs";
import { dirname, join } from "node:path";

import type BetterSqlite3 from "better-sqlite3";

import { convertToRollbackJournal, integrityCheck, openSqliteDatabase } from "./runtimeParams.js";

/**
 * DB-006 backup and restore baseline.
 *
 * A backup of a live database cannot be a file copy: with WAL enabled the
 * newest committed pages live in `pm.db-wal`, so copying `pm.db` alone yields
 * a database that is missing data or will not open. The SQLite online backup
 * API reads a consistent snapshot through the same connection, which is why
 * it is the only method used here.
 *
 * Every backup is verified before it is published: it is written under a
 * temporary name, opened, checked with `integrity_check` and only then
 * renamed into place. A backup that fails verification is deleted rather than
 * left behind looking usable.
 */

export const BACKUP_FILE_PREFIX = "pm";
export const BACKUP_TEMP_DIRECTORY = ".tmp";
export const DEFAULT_BACKUP_KEEP = 5;

export type BackupErrorCode =
  | "BACKUP_FAILED"
  | "BACKUP_VERIFY_FAILED"
  | "BACKUP_NOT_FOUND"
  | "BACKUP_DIRECTORY_INVALID";

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: BackupErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "BackupError";
    this.code = code;
    this.details = details;
  }
}

function reject(code: BackupErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new BackupError(code, message, details);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** UTC ISO 8601 with milliseconds, or null when the value is not an instant. */
function formatUtcIso(milliseconds: number): string | null {
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface BackupRecord {
  /** Stable identifier derived from the file name. */
  backupId: string;
  fileName: string;
  absolutePath: string;
  sha256: string;
  byteLength: number;
  createdAt: string;
  /** Highest applied migration version, 0 for a database with no history. */
  schemaVersion: number;
  entityCounts: Record<string, number>;
}

export interface CreateBackupOptions {
  database: BetterSqlite3.Database;
  backupsDirectory: string;
  /** Milliseconds since the epoch; injected in tests. */
  now?: () => number;
  /** Optional marker, reduced to `[A-Za-z0-9._-]`, e.g. `pre-migration`. */
  label?: string;
}

function ensureBackupsDirectory(backupsDirectory: string): string {
  if (typeof backupsDirectory !== "string" || backupsDirectory.trim().length === 0) {
    reject("BACKUP_DIRECTORY_INVALID", "backups directory must be a non-empty string");
  }
  try {
    mkdirSync(backupsDirectory, { recursive: true });
    const temp = join(backupsDirectory, BACKUP_TEMP_DIRECTORY);
    mkdirSync(temp, { recursive: true });
    return temp;
  } catch (error) {
    reject("BACKUP_DIRECTORY_INVALID", `preparing the backups directory failed: ${describe(error)}`, {
      backupsDirectory
    });
  }
}

function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** `2026-09-22T01:02:03.456Z` -> `20260922T010203456Z`, usable in a file name. */
function fileNameTimestamp(createdAt: string): string {
  return createdAt.replace(/[-:.]/g, "");
}

function sanitizeLabel(label: string | undefined): string {
  if (!label) {
    return "";
  }
  // Dots are allowed inside a label, but a run of them is collapsed and the
  // edges are trimmed so a label can never contribute `..` to the file name.
  const cleaned = label
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40)
    .replace(/^\.+|\.+$/g, "");
  return cleaned.length > 0 ? `-${cleaned}` : "";
}

export interface DatabaseInventory {
  schemaVersion: number;
  entityCounts: Record<string, number>;
}

/**
 * Table list and row counts excluding SQLite internal tables. This is the
 * "entity counts match" half of the DB-006 acceptance criterion.
 */
export function readDatabaseInventory(database: BetterSqlite3.Database): DatabaseInventory {
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;

  const entityCounts: Record<string, number> = {};
  for (const table of tables) {
    const quoted = `"${table.name.replace(/"/g, '""')}"`;
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get() as { count: number };
    entityCounts[table.name] = Number(row.count);
  }

  let schemaVersion = 0;
  if ("schema_migrations" in entityCounts) {
    const row = database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as {
      version: number;
    };
    schemaVersion = Number(row.version);
  }

  return { schemaVersion, entityCounts };
}

export interface BackupVerification {
  ok: boolean;
  /** Empty when the database is intact. */
  integrity: string[];
  byteLength: number;
  sha256: string;
  schemaVersion: number;
  entityCounts: Record<string, number>;
  /** Set when the file could not be read as a database at all. */
  problem?: string;
}

/**
 * Opens a backup read-only and checks it. A file that is truncated, not a
 * database, or has a broken page is reported as `ok: false` rather than
 * thrown, because the caller is usually deciding whether to trust it.
 */
export function verifyDatabaseBackup(backupPath: string): BackupVerification {
  const empty: BackupVerification = {
    ok: false,
    integrity: [],
    byteLength: 0,
    sha256: "",
    schemaVersion: 0,
    entityCounts: {}
  };

  if (!existsSync(backupPath)) {
    return { ...empty, problem: "backup file does not exist" };
  }

  const byteLength = statSync(backupPath).size;
  const sha256 = sha256OfFile(backupPath);

  let database: BetterSqlite3.Database | undefined;
  try {
    database = openSqliteDatabase(backupPath, { readonly: true, fileMustExist: true });
    // A corrupt file only fails once a page is actually read, so the check
    // has to touch the schema rather than just open the handle.
    const inventory = readDatabaseInventory(database);
    const integrity = integrityCheck(database);
    return {
      ok: integrity.ok,
      integrity: integrity.problems,
      byteLength,
      sha256,
      schemaVersion: inventory.schemaVersion,
      entityCounts: inventory.entityCounts,
      ...(integrity.ok ? {} : { problem: "integrity_check reported problems" })
    };
  } catch (error) {
    return { ...empty, byteLength, sha256, problem: describe(error) };
  } finally {
    database?.close();
  }
}

export async function createDatabaseBackup(options: CreateBackupOptions): Promise<BackupRecord> {
  const temp = ensureBackupsDirectory(options.backupsDirectory);
  const createdAt = formatUtcIso(options.now ? options.now() : Date.now());
  if (createdAt === null) {
    reject("BACKUP_FAILED", "backup timestamp is not a valid instant");
  }

  const tempPath = join(temp, `${randomUUID()}.part`);
  try {
    await options.database.backup(tempPath);
    // The online backup copies the source header, so the destination comes
    // out in WAL mode: the pages it just wrote can sit in a `-wal` companion
    // that a single-file backup would leave behind. Folding it back is what
    // makes the published file complete on its own.
    convertToRollbackJournal(tempPath);
    rmSync(`${tempPath}-wal`, { force: true });
    rmSync(`${tempPath}-shm`, { force: true });
  } catch (error) {
    rmSync(tempPath, { force: true });
    rmSync(`${tempPath}-wal`, { force: true });
    rmSync(`${tempPath}-shm`, { force: true });
    reject("BACKUP_FAILED", `the online backup failed: ${describe(error)}`, { tempPath });
  }

  const verification = verifyDatabaseBackup(tempPath);
  if (!verification.ok) {
    rmSync(tempPath, { force: true });
    reject("BACKUP_VERIFY_FAILED", "the freshly written backup did not pass verification", {
      problem: verification.problem ?? "",
      integrity: verification.integrity
    });
  }

  const fileName = `${BACKUP_FILE_PREFIX}-${fileNameTimestamp(createdAt)}${sanitizeLabel(options.label)}-${randomUUID().slice(0, 8)}.db`;
  const absolutePath = join(options.backupsDirectory, fileName);
  try {
    renameSync(tempPath, absolutePath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    reject("BACKUP_FAILED", `publishing the backup failed: ${describe(error)}`, { fileName });
  }

  return {
    backupId: fileName.replace(/\.db$/, ""),
    fileName,
    absolutePath,
    sha256: verification.sha256,
    byteLength: verification.byteLength,
    createdAt,
    schemaVersion: verification.schemaVersion,
    entityCounts: verification.entityCounts
  };
}

export interface BackupFile {
  backupId: string;
  fileName: string;
  absolutePath: string;
  byteLength: number;
}

/** Newest first. Only published files, never the staging directory. */
export function listDatabaseBackups(backupsDirectory: string): BackupFile[] {
  if (!existsSync(backupsDirectory)) {
    return [];
  }
  return readdirSync(backupsDirectory)
    .filter((entry) => entry.startsWith(`${BACKUP_FILE_PREFIX}-`) && entry.endsWith(".db"))
    .sort()
    .reverse()
    .map((fileName) => {
      const absolutePath = join(backupsDirectory, fileName);
      return {
        backupId: fileName.replace(/\.db$/, ""),
        fileName,
        absolutePath,
        byteLength: statSync(absolutePath).size
      };
    });
}

/** Removes the oldest backups beyond `keep`. Returns the removed file names. */
export function pruneDatabaseBackups(backupsDirectory: string, keep = DEFAULT_BACKUP_KEEP): string[] {
  if (!Number.isInteger(keep) || keep < 1) {
    reject("BACKUP_DIRECTORY_INVALID", "keep must be a positive integer", { keep });
  }
  const removed: string[] = [];
  for (const backup of listDatabaseBackups(backupsDirectory).slice(keep)) {
    rmSync(backup.absolutePath, { force: true });
    removed.push(backup.fileName);
  }
  return removed;
}

export interface RestoreBackupOptions {
  backupPath: string;
  targetDatabasePath: string;
  /** Default true; set false to refuse replacing an existing database. */
  overwrite?: boolean;
  now?: () => number;
}

export interface RestoreResult {
  restoredPath: string;
  restoredAt: string;
  verification: BackupVerification;
}

/**
 * Replaces a database file with a backup.
 *
 * The stale `-wal` and `-shm` files are removed first: they belong to the
 * database being replaced, and leaving them behind makes a freshly restored
 * file read as corrupt. The copy itself goes through a temporary name so a
 * failed restore cannot leave a half-written database in place.
 */
export function restoreDatabaseBackup(options: RestoreBackupOptions): RestoreResult {
  const source = verifyDatabaseBackup(options.backupPath);
  if (!source.ok) {
    reject("BACKUP_VERIFY_FAILED", "refusing to restore a backup that does not verify", {
      backupPath: options.backupPath,
      problem: source.problem ?? "",
      integrity: source.integrity
    });
  }
  if (options.overwrite === false && existsSync(options.targetDatabasePath)) {
    reject("BACKUP_FAILED", "target database already exists and overwrite is disabled", {
      targetDatabasePath: options.targetDatabasePath
    });
  }

  mkdirSync(dirname(options.targetDatabasePath), { recursive: true });
  const stagingPath = `${options.targetDatabasePath}.restore-part`;
  try {
    copyFileSync(options.backupPath, stagingPath);
    rmSync(`${options.targetDatabasePath}-wal`, { force: true });
    rmSync(`${options.targetDatabasePath}-shm`, { force: true });
    renameSync(stagingPath, options.targetDatabasePath);
  } catch (error) {
    rmSync(stagingPath, { force: true });
    reject("BACKUP_FAILED", `restoring the backup failed: ${describe(error)}`, {
      targetDatabasePath: options.targetDatabasePath
    });
  }

  const restored = verifyDatabaseBackup(options.targetDatabasePath);
  if (!restored.ok) {
    reject("BACKUP_VERIFY_FAILED", "the restored database did not pass verification", {
      targetDatabasePath: options.targetDatabasePath,
      integrity: restored.integrity
    });
  }

  return {
    restoredPath: options.targetDatabasePath,
    restoredAt: formatUtcIso(options.now ? options.now() : Date.now()) ?? "",
    verification: restored
  };
}
