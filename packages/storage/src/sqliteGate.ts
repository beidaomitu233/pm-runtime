import Database from "better-sqlite3";

export const SQLITE_DRIVER_NAME = "better-sqlite3" as const;
export const SQLITE_DRIVER_VERSION = "11.10.0" as const;

export interface SqliteCapabilities {
  driver: typeof SQLITE_DRIVER_NAME;
  driverVersion: typeof SQLITE_DRIVER_VERSION;
  sqliteVersion: string;
  journalMode: string;
  foreignKeysEnabled: boolean;
  synchronous: string;
  transactionRollbackVerified: boolean;
  foreignKeyVerified: boolean;
  backupVerified: boolean;
}

export class SqliteGate {
  private database: Database.Database | undefined;

  constructor(
    readonly filename: string,
    readonly timeoutMs = 5_000
  ) {}

  open(): Database.Database {
    if (this.database) {
      return this.database;
    }

    this.database = new Database(this.filename, { timeout: this.timeoutMs });
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("busy_timeout = 5000");
    this.database.pragma("synchronous = NORMAL");
    return this.database;
  }

  get db(): Database.Database {
    return this.database ?? this.open();
  }

  transaction<T>(work: (database: Database.Database) => T): T {
    const run = this.db.transaction(() => work(this.db));
    return run();
  }

  async backup(destination: string): Promise<void> {
    await this.db.backup(destination);
  }

  close(): void {
    if (this.database) {
      this.database.close();
      this.database = undefined;
    }
  }
}

export function inspectSqlite(database: Database.Database): Pick<
  SqliteCapabilities,
  "sqliteVersion" | "journalMode" | "foreignKeysEnabled" | "synchronous"
> {
  const sqliteVersion = String(
    (database.prepare("SELECT sqlite_version() AS version").get() as { version: string }).version
  );
  const journalMode = String(database.pragma("journal_mode", { simple: true })).toLowerCase();
  const foreignKeysEnabled = Number(database.pragma("foreign_keys", { simple: true })) === 1;
  const synchronous = String(database.pragma("synchronous", { simple: true })).toLowerCase();
  return { sqliteVersion, journalMode, foreignKeysEnabled, synchronous };
}

export async function runSqliteTechnicalGate(
  databasePath: string,
  backupPath: string
): Promise<SqliteCapabilities> {
  const gate = new SqliteGate(databasePath);
  const database = gate.open();
  try {
    database.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parent(id)
      );
    `);
    database.prepare("INSERT INTO parent (id, name) VALUES (?, ?)").run(1, "gate");

    let transactionRollbackVerified = false;
    try {
      gate.transaction((connection) => {
        connection.prepare("INSERT INTO parent (id, name) VALUES (?, ?)").run(2, "rolled-back");
        throw new Error("technical gate rollback");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "technical gate rollback") {
        throw error;
      }
      const rollbackCount = database.prepare("SELECT COUNT(*) AS count FROM parent WHERE id = 2").get() as { count: number };
      transactionRollbackVerified = rollbackCount.count === 0;
    }

    let foreignKeyVerified = false;
    try {
      database.prepare("INSERT INTO child (id, parent_id) VALUES (?, ?)").run(1, 999);
    } catch {
      foreignKeyVerified = true;
    }

    await gate.backup(backupPath);
    const capabilities = inspectSqlite(database);
    const backupGate = new SqliteGate(backupPath);
    try {
      const backupDatabase = backupGate.open();
      const backupCount = (backupDatabase.prepare("SELECT COUNT(*) AS count FROM parent").get() as { count: number }).count;
      if (backupCount !== 1) {
        throw new Error("SQLite backup did not preserve committed rows");
      }
    } finally {
      backupGate.close();
    }

    return {
      driver: SQLITE_DRIVER_NAME,
      driverVersion: SQLITE_DRIVER_VERSION,
      ...capabilities,
      transactionRollbackVerified,
      foreignKeyVerified,
      backupVerified: true
    };
  } finally {
    gate.close();
  }
}
