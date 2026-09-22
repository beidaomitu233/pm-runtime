import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type BetterSqlite3 from "better-sqlite3";

/**
 * BE-007 migration runner.
 *
 * The runner owns `schema_migrations` so that migration files never have to
 * create the table they are recorded in; this keeps a single DDL authority for
 * the history table. Every other table is created by a migration file.
 */

export const MIGRATIONS_TABLE = "schema_migrations";

export const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  version         INTEGER NOT NULL PRIMARY KEY CHECK (version > 0),
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64),
  applied_at      TEXT NOT NULL,
  app_version     TEXT NOT NULL CHECK (length(app_version) BETWEEN 1 AND 60)
) STRICT
`;

export interface Migration {
  /** Positive, strictly increasing across the whole migration set. */
  version: number;
  /** 1-120 characters, taken from the file name. */
  name: string;
  /** Migration body. Only DDL/DML; must not contain BEGIN or COMMIT. */
  sql: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksumSha256: string;
  appliedAt: string;
  appVersion: string;
}

export type MigrationErrorCode =
  | "MIGRATION_INVALID_DEFINITION"
  | "MIGRATION_HISTORY_CORRUPT"
  | "MIGRATION_CHECKSUM_MISMATCH"
  | "MIGRATION_VERSION_REGRESSION"
  | "MIGRATION_APPLY_FAILED";

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: MigrationErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Migration files are checked out with CRLF on Windows and LF elsewhere. The
 * checksum is computed over LF-normalised SQL so the same file yields the same
 * checksum on every machine; without this a Windows checkout would look like a
 * tampered migration.
 */
export function normalizeMigrationSql(sql: string): string {
  return sql.replace(/\r\n/g, "\n");
}

/** Covers version, name and body, so renaming or reordering is also detected. */
export function checksumMigration(migration: Migration): string {
  const material = `${migration.version}\n${migration.name}\n${normalizeMigrationSql(migration.sql)}`;
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function sortByVersion(migrations: readonly Migration[]): Migration[] {
  return [...migrations].sort((left, right) => left.version - right.version);
}

function validateDefinitions(migrations: readonly Migration[]): void {
  let previous = 0;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new MigrationError(
        "MIGRATION_INVALID_DEFINITION",
        `migration version must be a positive integer, received ${String(migration.version)}`
      );
    }
    if (migration.version <= previous) {
      throw new MigrationError(
        "MIGRATION_INVALID_DEFINITION",
        `migration versions must strictly increase, ${migration.version} follows ${previous}`
      );
    }
    previous = migration.version;

    if (typeof migration.name !== "string" || migration.name.length < 1 || migration.name.length > 120) {
      throw new MigrationError(
        "MIGRATION_INVALID_DEFINITION",
        `migration ${migration.version} name must be 1-120 characters`
      );
    }
    if (typeof migration.sql !== "string" || migration.sql.trim().length === 0) {
      throw new MigrationError("MIGRATION_INVALID_DEFINITION", `migration ${migration.version} has no SQL`);
    }
  }
}

export function migrationsTableExists(database: BetterSqlite3.Database): boolean {
  const row = database
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(MIGRATIONS_TABLE) as { present: number } | undefined;
  return row !== undefined;
}

/** Returns an empty list for a fresh database instead of throwing. */
export function readAppliedMigrations(database: BetterSqlite3.Database): AppliedMigration[] {
  if (!migrationsTableExists(database)) {
    return [];
  }
  const rows = database
    .prepare(
      `SELECT version, name, checksum_sha256, applied_at, app_version
         FROM ${MIGRATIONS_TABLE}
        ORDER BY version`
    )
    .all() as Array<{
    version: number;
    name: string;
    checksum_sha256: string;
    applied_at: string;
    app_version: string;
  }>;

  return rows.map((row) => ({
    version: row.version,
    name: row.name,
    checksumSha256: row.checksum_sha256,
    appliedAt: row.applied_at,
    appVersion: row.app_version
  }));
}

export type MigrationPlan =
  | { kind: "ok"; databaseVersion: number; targetVersion: number; pending: Migration[] }
  | { kind: "blocked"; databaseVersion: number; targetVersion: number; error: MigrationError };

/**
 * Decides what a startup should do without writing anything. A blocked plan is
 * how "enter read-only diagnostics and refuse writes" is expressed: the caller
 * keeps the reason instead of losing it in a thrown string.
 */
export function planMigrations(
  database: BetterSqlite3.Database,
  migrations: readonly Migration[]
): MigrationPlan {
  const definitions = sortByVersion(migrations);
  validateDefinitions(definitions);

  const history = readAppliedMigrations(database);
  const appliedVersions = history.map((entry) => entry.version);
  const databaseVersion = appliedVersions.length > 0 ? appliedVersions[appliedVersions.length - 1] : 0;
  const targetVersion = definitions.length > 0 ? definitions[definitions.length - 1].version : 0;

  const seen = new Set<number>();
  for (const version of appliedVersions) {
    if (seen.has(version)) {
      throw new MigrationError(
        "MIGRATION_HISTORY_CORRUPT",
        `${MIGRATIONS_TABLE} contains version ${version} more than once`,
        { version }
      );
    }
    seen.add(version);
  }
  for (let version = 1; version <= databaseVersion; version += 1) {
    if (!seen.has(version)) {
      throw new MigrationError(
        "MIGRATION_HISTORY_CORRUPT",
        `${MIGRATIONS_TABLE} is missing version ${version} although ${databaseVersion} is recorded`,
        { version, databaseVersion }
      );
    }
  }

  if (databaseVersion > targetVersion) {
    return {
      kind: "blocked",
      databaseVersion,
      targetVersion,
      error: new MigrationError(
        "MIGRATION_VERSION_REGRESSION",
        `database schema version ${databaseVersion} is newer than the application schema version ${targetVersion}; refusing to write`,
        { databaseVersion, targetVersion }
      )
    };
  }

  const definitionsByVersion = new Map(definitions.map((entry) => [entry.version, entry]));
  for (const applied of history) {
    const definition = definitionsByVersion.get(applied.version);
    if (!definition) {
      return {
        kind: "blocked",
        databaseVersion,
        targetVersion,
        error: new MigrationError(
          "MIGRATION_VERSION_REGRESSION",
          `database records migration ${applied.version} but the application does not define it`,
          { version: applied.version, targetVersion }
        )
      };
    }
    const expected = checksumMigration(definition);
    if (expected !== applied.checksumSha256) {
      return {
        kind: "blocked",
        databaseVersion,
        targetVersion,
        error: new MigrationError(
          "MIGRATION_CHECKSUM_MISMATCH",
          `migration ${applied.version} (${applied.name}) has been modified since it was applied`,
          { version: applied.version, expected, recorded: applied.checksumSha256 }
        )
      };
    }
  }

  return {
    kind: "ok",
    databaseVersion,
    targetVersion,
    pending: definitions.filter((entry) => !seen.has(entry.version))
  };
}

export interface ApplyMigrationsOptions {
  /** Sidecar version recorded against every migration it applies. */
  appVersion: string;
  /** Injectable clock; defaults to UTC ISO 8601 with millisecond precision. */
  now?: () => string;
}

export interface ApplyMigrationsResult {
  previousVersion: number;
  version: number;
  applied: Migration[];
  history: AppliedMigration[];
}

export function applyMigrations(
  database: BetterSqlite3.Database,
  migrations: readonly Migration[],
  options: ApplyMigrationsOptions
): ApplyMigrationsResult {
  const plan = planMigrations(database, migrations);
  if (plan.kind === "blocked") {
    throw plan.error;
  }

  database.exec(MIGRATIONS_TABLE_SQL);

  const now = options.now ?? (() => new Date().toISOString());
  const insert = database.prepare(
    `INSERT INTO ${MIGRATIONS_TABLE} (version, name, checksum_sha256, applied_at, app_version)
     VALUES (?, ?, ?, ?, ?)`
  );

  const applied: Migration[] = [];
  for (const migration of plan.pending) {
    const checksum = checksumMigration(migration);
    const sql = normalizeMigrationSql(migration.sql);
    const run = database.transaction(() => {
      database.exec(sql);
      insert.run(migration.version, migration.name, checksum, now(), options.appVersion);
    });

    try {
      run();
    } catch (error) {
      // SQLite DDL is transactional, so a failing migration leaves neither a
      // half-applied schema nor a history row behind.
      throw new MigrationError(
        "MIGRATION_APPLY_FAILED",
        `migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`,
        { version: migration.version, name: migration.name }
      );
    }
    applied.push(migration);
  }

  return {
    previousVersion: plan.databaseVersion,
    version: plan.targetVersion,
    applied,
    history: readAppliedMigrations(database)
  };
}

export type SchemaStatus = "current" | "pending" | "read-only";

export interface SchemaInspection {
  databaseVersion: number;
  targetVersion: number;
  pendingVersions: number[];
  status: SchemaStatus;
  /** Set when status is "read-only"; carries the reason for diagnostics. */
  code?: MigrationErrorCode;
  message?: string;
}

/** Non-throwing variant for /health and diagnostics. */
export function inspectSchema(
  database: BetterSqlite3.Database,
  migrations: readonly Migration[]
): SchemaInspection {
  try {
    const plan = planMigrations(database, migrations);
    if (plan.kind === "blocked") {
      return {
        databaseVersion: plan.databaseVersion,
        targetVersion: plan.targetVersion,
        pendingVersions: [],
        status: "read-only",
        code: plan.error.code,
        message: plan.error.message
      };
    }
    return {
      databaseVersion: plan.databaseVersion,
      targetVersion: plan.targetVersion,
      pendingVersions: plan.pending.map((entry) => entry.version),
      status: plan.pending.length === 0 ? "current" : "pending"
    };
  } catch (error) {
    if (error instanceof MigrationError) {
      return {
        databaseVersion: 0,
        targetVersion: 0,
        pendingVersions: [],
        status: "read-only",
        code: error.code,
        message: error.message
      };
    }
    throw error;
  }
}

const MIGRATION_FILE_PATTERN = /^(\d{4})_([A-Za-z0-9][A-Za-z0-9._-]*)\.sql$/;

export function parseMigrationFileName(fileName: string): { version: number; name: string } | null {
  const match = MIGRATION_FILE_PATTERN.exec(fileName);
  if (!match) {
    return null;
  }
  return { version: Number(match[1]), name: match[2] };
}

export function loadMigrationsFromDirectory(directory: string): Migration[] {
  const fileNames = readdirSync(directory)
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  const migrations: Migration[] = [];
  for (const fileName of fileNames) {
    const parsed = parseMigrationFileName(fileName);
    if (!parsed) {
      throw new MigrationError(
        "MIGRATION_INVALID_DEFINITION",
        `migration file name must match NNNN_name.sql, received ${fileName}`
      );
    }
    migrations.push({ ...parsed, sql: readFileSync(join(directory, fileName), "utf8") });
  }
  return sortByVersion(migrations);
}

/**
 * Location of the migration files inside this package. Packaging the sidecar
 * still has to decide whether the files are shipped next to the binary or
 * inlined at build time; see COMMUNICATION.md.
 */
export function defaultMigrationsDirectory(): string {
  return fileURLToPath(new URL("../migrations", import.meta.url));
}
