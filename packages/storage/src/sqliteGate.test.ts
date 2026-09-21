import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSqliteTechnicalGate } from "./sqliteGate.js";

describe("SQLite technical gate", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "pm-runtime-sqlite-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("verifies the selected driver, WAL, foreign keys, rollback, and backup", async () => {
    const result = await runSqliteTechnicalGate(
      join(directory, "pm.db"),
      join(directory, "pm-backup.db")
    );

    expect(result.driver).toBe("better-sqlite3");
    expect(result.driverVersion).toBe("11.10.0");
    expect(result.sqliteVersion).toMatch(/^3\./);
    expect(result.journalMode).toBe("wal");
    expect(result.foreignKeysEnabled).toBe(true);
    expect(result.transactionRollbackVerified).toBe(true);
    expect(result.foreignKeyVerified).toBe(true);
    expect(result.backupVerified).toBe(true);
  });
});
