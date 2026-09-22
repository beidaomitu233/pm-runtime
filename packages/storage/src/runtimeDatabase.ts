import { existsSync } from "node:fs";

import type BetterSqlite3 from "better-sqlite3";

import { createDatabaseBackup, pruneDatabaseBackups, type BackupRecord } from "./backup.js";
import {
  applyMigrations,
  defaultMigrationsDirectory,
  inspectSchema,
  loadMigrationsFromDirectory,
  planMigrations,
  type Migration,
  type SchemaInspection
} from "./migrationRunner.js";
import {
  assertLocalDataDirectory,
  closeSqliteDatabase,
  ensureRuntimeDirectories,
  openSqliteDatabase,
  readRuntimeParams,
  resolveRuntimePaths,
  type RuntimePaths,
  type SqliteRuntimeParams
} from "./runtimeParams.js";

/**
 * Startup entry point shared by every service that needs the database.
 *
 * It exists so that the order of operations is decided once: validate the
 * data directory, open with the locked parameters, decide what the schema
 * needs, take a durable copy *before* changing anything, then migrate. A
 * caller that assembled those steps itself would eventually get one of them
 * out of order, and the failure modes are silent - a backup taken after the
 * migration, or a write attempted on a database that is ahead of the app.
 */

export interface OpenRuntimeDatabaseOptions {
  dataDir: string;
  /** Recorded against every migration this process applies. */
  appVersion: string;
  /** Defaults to the migrations shipped with `@pm/storage`. */
  migrations?: readonly Migration[];
  migrationsDirectory?: string;
  busyTimeoutMs?: number;
  /** Injected clock in milliseconds; defaults to `Date.now`. */
  now?: () => number;
  /** Default true. Only a database that already has a schema is backed up. */
  backupBeforeMigration?: boolean;
  backupKeepCount?: number;
}

export interface RuntimeDatabaseHandle {
  database: BetterSqlite3.Database;
  paths: RuntimePaths;
  params: SqliteRuntimeParams;
  schema: SchemaInspection;
  /** Versions applied by this call; empty when the schema was current. */
  appliedMigrations: number[];
  /** Set only when a pending migration was preceded by a durable copy. */
  startupBackup: BackupRecord | null;
  close(): void;
}

export async function openRuntimeDatabase(
  options: OpenRuntimeDatabaseOptions
): Promise<RuntimeDatabaseHandle> {
  const root = assertLocalDataDirectory(options.dataDir);
  const paths = ensureRuntimeDirectories(resolveRuntimePaths(root));
  const migrations =
    options.migrations ??
    loadMigrationsFromDirectory(options.migrationsDirectory ?? defaultMigrationsDirectory());

  const database = openSqliteDatabase(paths.databasePath, { busyTimeoutMs: options.busyTimeoutMs });

  try {
    // Read the plan before writing anything: a database that is newer than
    // this application must be refused, not silently migrated or written to.
    const plan = planMigrations(database, migrations);
    if (plan.kind === "blocked") {
      throw plan.error;
    }

    let startupBackup: BackupRecord | null = null;
    const hasExistingSchema = plan.databaseVersion > 0;
    if (plan.pending.length > 0 && hasExistingSchema && (options.backupBeforeMigration ?? true)) {
      startupBackup = await createDatabaseBackup({
        database,
        backupsDirectory: paths.backupsDirectory,
        now: options.now,
        label: "pre-migration"
      });
      pruneDatabaseBackups(paths.backupsDirectory, options.backupKeepCount);
    }

    const clock = options.now;
    const result = applyMigrations(database, migrations, {
      appVersion: options.appVersion,
      now: clock ? () => new Date(clock()).toISOString() : undefined
    });

    const handle: RuntimeDatabaseHandle = {
      database,
      paths,
      params: readRuntimeParams(database),
      schema: inspectSchema(database, migrations),
      appliedMigrations: result.applied.map((migration) => migration.version),
      startupBackup,
      close: () => {
        closeSqliteDatabase(database);
      }
    };
    return handle;
  } catch (error) {
    // Never leak an open handle: a second open of the same file would hit the
    // write lock, and the caller is about to fall back to diagnostics.
    try {
      closeSqliteDatabase(database, { checkpoint: false });
    } catch {
      /* the failure below is the one worth reporting */
    }
    throw error;
  }
}

export interface InspectRuntimeDatabaseOptions {
  dataDir: string;
  migrations?: readonly Migration[];
  migrationsDirectory?: string;
}

export interface RuntimeDatabaseInspection {
  paths: RuntimePaths;
  /** False when no database file exists yet; nothing is created by inspecting. */
  databasePresent: boolean;
  params: SqliteRuntimeParams | null;
  schema: SchemaInspection;
}

/**
 * Non-throwing diagnostic used when startup refused to continue. It reports
 * the schema status and the reason instead of the caller trying to interpret
 * a thrown error, and it never creates or migrates anything.
 */
export function inspectRuntimeDatabase(
  options: InspectRuntimeDatabaseOptions
): RuntimeDatabaseInspection {
  const root = assertLocalDataDirectory(options.dataDir);
  const paths = resolveRuntimePaths(root);
  const migrations =
    options.migrations ??
    loadMigrationsFromDirectory(options.migrationsDirectory ?? defaultMigrationsDirectory());
  const targetVersion =
    migrations.length > 0 ? Math.max(...migrations.map((migration) => migration.version)) : 0;

  if (!existsSync(paths.databasePath)) {
    return {
      paths,
      databasePresent: false,
      params: null,
      schema: {
        databaseVersion: 0,
        targetVersion,
        pendingVersions: migrations.map((migration) => migration.version),
        status: "pending"
      }
    };
  }

  const database = openSqliteDatabase(paths.databasePath);
  try {
    return {
      paths,
      databasePresent: true,
      params: readRuntimeParams(database),
      schema: inspectSchema(database, migrations)
    };
  } finally {
    closeSqliteDatabase(database, { checkpoint: false });
  }
}
