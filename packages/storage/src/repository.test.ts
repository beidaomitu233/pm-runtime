import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, defaultMigrationsDirectory, loadMigrationsFromDirectory } from "./migrationRunner.js";
import { closeSqliteDatabase, openSqliteDatabase } from "./runtimeParams.js";
import {
  decodeCursor,
  encodeCursor,
  isUtcIso,
  MAX_PAGE_LIMIT,
  normalizeLimit,
  RepositoryContext,
  toUtcIso,
  type KeysetListOptions
} from "./repository.js";

const APP_VERSION = "0.1.0-test";
const SORTED_AT = "2026-09-22T00:00:00.000Z";

interface ProjectRow {
  id: string;
  name: string;
  updated_at: string;
  deleted_at: string | null;
}

describe("repository base", () => {
  let directory: string;
  let database: BetterSqlite3.Database;
  let context: RepositoryContext;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pm-repository-"));
    database = openSqliteDatabase(join(directory, "pm.db"));
    // Run the real migration so the base is exercised against the shipped
    // schema rather than a look-alike table.
    applyMigrations(database, loadMigrationsFromDirectory(defaultMigrationsDirectory()), {
      appVersion: APP_VERSION
    });
    context = new RepositoryContext({ database });
  });

  afterEach(() => {
    closeSqliteDatabase(database, { checkpoint: false });
    rmSync(directory, { recursive: true, force: true });
  });

  function insertProject(options: {
    name: string;
    updatedAt: string;
    deletedAt?: string | null;
    id?: string;
  }): string {
    const id = options.id ?? context.newId();
    database
      .prepare(
        `INSERT INTO projects (id, name, description, created_at, updated_at, deleted_at)
         VALUES (:id, :name, NULL, :createdAt, :updatedAt, :deletedAt)`
      )
      .run({
        id,
        name: options.name,
        createdAt: options.updatedAt,
        updatedAt: options.updatedAt,
        deletedAt: options.deletedAt ?? null
      });
    return id;
  }

  function list(overrides: Partial<KeysetListOptions<ProjectRow>> = {}) {
    return context.list<ProjectRow>({
      table: "projects",
      columns: ["id", "name", "updated_at", "deleted_at"],
      sortColumn: "updated_at",
      ...overrides
    });
  }

  function countProjects(includeDeleted = true): number {
    const sql = includeDeleted
      ? "SELECT COUNT(*) AS count FROM projects"
      : "SELECT COUNT(*) AS count FROM projects WHERE deleted_at IS NULL";
    return (database.prepare(sql).get() as { count: number }).count;
  }

  describe("timestamps", () => {
    it("always emits UTC with milliseconds, whatever offset the input carries", () => {
      expect(toUtcIso(0)).toBe("1970-01-01T00:00:00.000Z");
      expect(toUtcIso(new Date("2026-09-22T09:00:00+08:00"))).toBe("2026-09-22T01:00:00.000Z");
      expect(toUtcIso(Date.parse("2026-09-22T01:00:00.123Z"))).toBe("2026-09-22T01:00:00.123Z");
    });

    it("refuses an unusable timestamp instead of storing 'Invalid Date'", () => {
      expect(() => toUtcIso(Number.NaN)).toThrowError(
        expect.objectContaining({ code: "INVALID_TIMESTAMP" })
      );
      expect(() => toUtcIso(new Date("nonsense"))).toThrowError(
        expect.objectContaining({ code: "INVALID_TIMESTAMP" })
      );
    });

    it("accepts millisecond precision and rejects the coarser contract form", () => {
      expect(isUtcIso("2026-09-22T01:00:00.123Z")).toBe(true);
      // contracts allow a missing .SSS, but storage must never write one:
      // a column with mixed precision would sort wrongly as text.
      expect(isUtcIso("2026-09-22T01:00:00Z")).toBe(false);
      expect(isUtcIso("2026-09-22 01:00:00.123Z")).toBe(false);
    });
  });

  describe("generated ids", () => {
    it("creates ids the schema accepts and keeps them increasing", () => {
      const ids = [context.newId(), context.newId(), context.newId()];
      for (const id of ids) {
        insertProject({ id, name: `project-${id.slice(-4)}`, updatedAt: SORTED_AT });
      }
      expect([...ids].sort()).toEqual(ids);
      expect(countProjects()).toBe(3);
    });
  });

  describe("cursors", () => {
    it("round-trips the sort value and the id", () => {
      const key = { sort: SORTED_AT, id: "01J8ZZZZZZZZZZZZZZZZZZZZZP" };
      expect(decodeCursor(encodeCursor(key))).toEqual(key);
      expect(decodeCursor(encodeCursor({ sort: 42, id: "01J8ZZZZZZZZZZZZZZZZZZZZZP" }))).toEqual({
        sort: 42,
        id: "01J8ZZZZZZZZZZZZZZZZZZZZZP"
      });
    });

    it("rejects anything it cannot trust instead of silently starting over", () => {
      const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
      expect(() => decodeCursor("")).toThrowError(expect.objectContaining({ code: "INVALID_CURSOR" }));
      expect(() => decodeCursor("!!!not-base64-json!!!")).toThrowError(
        expect.objectContaining({ code: "INVALID_CURSOR" })
      );
      expect(() => decodeCursor(encode({ v: 2, s: SORTED_AT, i: "x" }))).toThrow(
        expect.objectContaining({ code: "INVALID_CURSOR" })
      );
      expect(() => decodeCursor(encode({ v: 1, s: null, i: "x" }))).toThrow(
        expect.objectContaining({ code: "INVALID_CURSOR" })
      );
      expect(() => decodeCursor(encode({ v: 1, s: SORTED_AT }))).toThrow(
        expect.objectContaining({ code: "INVALID_CURSOR" })
      );
    });
  });

  describe("limits and identifiers", () => {
    it("defaults the page size and refuses values outside the contract", () => {
      expect(normalizeLimit(undefined)).toBe(50);
      expect(normalizeLimit(1)).toBe(1);
      expect(normalizeLimit(MAX_PAGE_LIMIT)).toBe(MAX_PAGE_LIMIT);
      for (const invalid of [0, -1, MAX_PAGE_LIMIT + 1, 2.5]) {
        expect(() => normalizeLimit(invalid)).toThrowError(expect.objectContaining({ code: "INVALID_LIMIT" }));
      }
    });

    it("rejects a table or column name that could carry SQL", () => {
      expect(() => list({ table: "projects; DROP TABLE projects" })).toThrowError(
        expect.objectContaining({ code: "INVALID_IDENTIFIER" })
      );
      expect(() => list({ columns: ["id", "name) --"] })).toThrowError(
        expect.objectContaining({ code: "INVALID_IDENTIFIER" })
      );
      expect(() => list({ sortColumn: "updated_at DESC" })).toThrowError(
        expect.objectContaining({ code: "INVALID_IDENTIFIER" })
      );
    });

    it("refuses to let caller parameters shadow the pagination parameters", () => {
      expect(() => list({ params: { limit: 10 } })).toThrowError(
        expect.objectContaining({ code: "INVALID_IDENTIFIER" })
      );
    });
  });

  describe("keyset listing", () => {
    it("pages through rows with different timestamps without repeating or skipping", () => {
      for (let index = 0; index < 5; index += 1) {
        insertProject({
          name: `project-${index}`,
          updatedAt: `2026-09-22T00:00:0${index}.000Z`
        });
      }

      const first = list({ limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.items[0].updated_at).toBe("2026-09-22T00:00:04.000Z");
      expect(first.nextCursor).not.toBeNull();

      const second = list({ limit: 2, cursor: first.nextCursor ?? undefined });
      expect(second.items.map((row) => row.updated_at)).toEqual([
        "2026-09-22T00:00:02.000Z",
        "2026-09-22T00:00:01.000Z"
      ]);

      const third = list({ limit: 2, cursor: second.nextCursor ?? undefined });
      expect(third.items.map((row) => row.updated_at)).toEqual(["2026-09-22T00:00:00.000Z"]);
      expect(third.nextCursor).toBeNull();

      const seen = [...first.items, ...second.items, ...third.items].map((row) => row.id);
      expect(new Set(seen).size).toBe(5);
    });

    it("uses the id tie-break when every row shares the same timestamp", () => {
      const ids = Array.from({ length: 7 }, (_, index) =>
        insertProject({ name: `same-${index}`, updatedAt: SORTED_AT })
      );

      const collected: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 7; page += 1) {
        const result = list({ limit: 2, cursor });
        collected.push(...result.items.map((row) => row.id));
        if (!result.nextCursor) {
          break;
        }
        cursor = result.nextCursor;
      }

      expect(collected).toHaveLength(7);
      expect(new Set(collected).size).toBe(7);
      expect(collected).toEqual([...ids].sort().reverse());
    });

    it("walks 1000 rows sharing one timestamp exactly once", () => {
      context.transaction(() => {
        for (let index = 0; index < 1_000; index += 1) {
          insertProject({ name: `bulk-${index}`, updatedAt: SORTED_AT });
        }
      });
      expect(countProjects()).toBe(1_000);

      const seen = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      do {
        const result = list({ limit: 100, cursor });
        for (const row of result.items) {
          expect(seen.has(row.id)).toBe(false);
          seen.add(row.id);
        }
        cursor = result.nextCursor ?? undefined;
        pages += 1;
        expect(pages).toBeLessThanOrEqual(11);
      } while (cursor);

      expect(seen.size).toBe(1_000);
      expect(pages).toBe(10);
    });

    it("supports ascending order for callers that need oldest first", () => {
      for (let index = 0; index < 3; index += 1) {
        insertProject({ name: `asc-${index}`, updatedAt: `2026-09-22T00:00:0${index}.000Z` });
      }
      const page = list({ limit: 2, direction: "ASC" });
      expect(page.items.map((row) => row.updated_at)).toEqual([
        "2026-09-22T00:00:00.000Z",
        "2026-09-22T00:00:01.000Z"
      ]);
      expect(page.nextCursor).not.toBeNull();
    });
  });

  describe("soft delete", () => {
    it("hides archived rows by default and returns them on request", () => {
      const kept = insertProject({ name: "kept", updatedAt: "2026-09-22T00:00:02.000Z" });
      const archived = insertProject({ name: "archived", updatedAt: "2026-09-22T00:00:01.000Z" });
      const older = insertProject({ name: "older", updatedAt: "2026-09-22T00:00:00.000Z" });

      expect(context.markDeleted({ table: "projects", id: archived })).toBe(1);

      const active = list();
      expect(active.items.map((row) => row.id)).toEqual([kept, older]);
      expect(active.items.every((row) => row.deleted_at === null)).toBe(true);

      // Archiving stamps updated_at, so the archived row sorts to the front
      // of an unfiltered list. That is the documented behaviour: the flag
      // decides visibility, it does not freeze the row.
      const all = list({ includeDeleted: true });
      expect(all.items.map((row) => row.id)).toEqual([archived, kept, older]);
    });

    it("stamps deleted_at and updated_at together, and refuses to delete twice", () => {
      const id = insertProject({ name: "twice", updatedAt: SORTED_AT });

      expect(context.markDeleted({ table: "projects", id })).toBe(1);
      const row = database
        .prepare("SELECT updated_at, deleted_at FROM projects WHERE id = ?")
        .get(id) as { updated_at: string; deleted_at: string | null };
      expect(isUtcIso(row.deleted_at)).toBe(true);
      expect(row.updated_at).toBe(row.deleted_at);

      expect(context.markDeleted({ table: "projects", id })).toBe(0);
      expect(context.markDeleted({ table: "projects", id: "01J8ZZZZZZZZZZZZZZZZZZZZZ9" })).toBe(0);
    });

    it("leaves updated_at alone for a table that does not carry one", () => {
      const id = insertProject({ name: "no-updated-at", updatedAt: SORTED_AT });
      expect(context.markDeleted({ table: "projects", id, updatedAtColumn: null })).toBe(1);

      const row = database
        .prepare("SELECT updated_at, deleted_at FROM projects WHERE id = ?")
        .get(id) as { updated_at: string; deleted_at: string | null };
      expect(row.updated_at).toBe(SORTED_AT);
      expect(isUtcIso(row.deleted_at)).toBe(true);
    });
  });

  describe("transactions", () => {
    it("rolls back a failed write and keeps the original error", () => {
      expect(() =>
        context.transaction(() => {
          insertProject({ name: "doomed", updatedAt: SORTED_AT });
          throw new Error("boom");
        })
      ).toThrow("boom");
      expect(countProjects()).toBe(0);
    });

    it("commits a successful write on the immediate path", () => {
      const id = context.transaction(() => insertProject({ name: "committed", updatedAt: SORTED_AT }));
      expect(countProjects()).toBe(1);

      const deferred = context.transaction(() => list().items.map((row) => row.id), { mode: "deferred" });
      expect(deferred).toEqual([id]);
    });
  });
});
