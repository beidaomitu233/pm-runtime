import type BetterSqlite3 from "better-sqlite3";

import type { Ulid, UtcIsoDateTime } from "@pm/contracts";

import { UlidFactory } from "./ids.js";

/**
 * DB-005 repository base.
 *
 * Everything a table repository would otherwise repeat: one place for the
 * timestamp format, one place for the soft-delete predicate, one place for
 * the keyset cursor. The two rules that are easy to get wrong and expensive
 * to debug are encoded here rather than left to each caller:
 *
 *  - ordinary queries exclude soft-deleted rows unless the caller asks for
 *    them explicitly, so a forgotten filter cannot leak archived data;
 *  - a cursor carries both the sort value and the id, so rows that share a
 *    timestamp are paged exactly once instead of being duplicated or skipped.
 */

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;
export const SOFT_DELETE_COLUMN = "deleted_at";

/** Storage always writes millisecond precision, even though contracts allow less. */
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COLUMN_EXPRESSION_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?(?: AS [A-Za-z_][A-Za-z0-9_]*)?$/;
const RESERVED_PARAMS = ["limit", "cursorSort", "cursorId"];

export type RepositoryErrorCode = "INVALID_CURSOR" | "INVALID_LIMIT" | "INVALID_IDENTIFIER" | "INVALID_TIMESTAMP";

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: RepositoryErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
    this.details = details;
  }
}

function reject(code: RepositoryErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new RepositoryError(code, message, details);
}

/**
 * Table and column names cannot be bound as parameters, so they are checked
 * against a whitelist pattern before they reach the SQL string.
 */
export function assertSqlIdentifier(value: string, label: string): string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    reject("INVALID_IDENTIFIER", `${label} is not a plain SQL identifier`, { label, value });
  }
  return value;
}

export function toUtcIso(value: Date | number): UtcIsoDateTime {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    reject("INVALID_TIMESTAMP", `not a valid timestamp: ${String(value)}`);
  }
  return date.toISOString() as UtcIsoDateTime;
}

export function isUtcIso(value: unknown): value is UtcIsoDateTime {
  return typeof value === "string" && UTC_ISO_PATTERN.test(value);
}

export interface CursorKey {
  /** Value of the sort column; TEXT or INTEGER, matching the column type. */
  sort: string | number;
  id: string;
}

/**
 * Opaque to callers but not secret: the cursor is a debug aid, so it decodes
 * to `{v,s,i}` and its shape is validated on the way back in. It is never
 * interpolated into SQL - both values are bound as parameters.
 */
export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify({ v: 1, s: key.sort, i: key.id }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorKey {
  if (typeof cursor !== "string" || cursor.length === 0) {
    reject("INVALID_CURSOR", "cursor must be a non-empty string");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    reject("INVALID_CURSOR", "cursor is not a decodable value", { cursor });
  }

  if (typeof parsed !== "object" || parsed === null) {
    reject("INVALID_CURSOR", "cursor payload must be an object");
  }
  const payload = parsed as { v?: unknown; s?: unknown; i?: unknown };
  if (payload.v !== 1) {
    reject("INVALID_CURSOR", "cursor version is not supported", { version: payload.v });
  }
  if (typeof payload.s !== "string" && typeof payload.s !== "number") {
    reject("INVALID_CURSOR", "cursor sort value must be a string or a number");
  }
  if (typeof payload.s === "number" && !Number.isFinite(payload.s)) {
    reject("INVALID_CURSOR", "cursor sort value must be finite");
  }
  if (typeof payload.i !== "string" || payload.i.length === 0) {
    reject("INVALID_CURSOR", "cursor id must be a non-empty string");
  }

  return { sort: payload.s, id: payload.i };
}

export function normalizeLimit(limit: number | undefined, fallback = DEFAULT_PAGE_LIMIT): number {
  if (limit === undefined) {
    return fallback;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    reject("INVALID_LIMIT", `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`, { limit });
  }
  return limit;
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Rows are fetched with `limit + 1` so "is there another page" is answered by
 * the query instead of by a second count.
 */
export function buildPage<T>(rows: T[], limit: number, toKey: (row: T) => CursorKey): PageResult<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  return { items, nextCursor: encodeCursor(toKey(items[items.length - 1])) };
}

export type SortDirection = "ASC" | "DESC";

export interface KeysetListOptions<Row = unknown> {
  table: string;
  /** Select list expressions, e.g. `["p.id", "p.name"]`. */
  columns: string[];
  sortColumn: string;
  idColumn?: string;
  alias?: string;
  limit?: number;
  cursor?: string;
  /** Default false: archived rows stay out of ordinary lists. */
  includeDeleted?: boolean;
  deletedAtColumn?: string;
  /** Extra predicate, without the leading `AND`. */
  where?: string;
  params?: Record<string, unknown>;
  direction?: SortDirection;
  /**
   * Maps a fetched row to its cursor key. Defaults to reading the bare sort
   * and id column names, which works as long as the select list exposes them
   * under those names.
   */
  toCursorKey?: (row: Row) => CursorKey;
}

export function listKeyset<Row>(
  database: BetterSqlite3.Database,
  options: KeysetListOptions<Row>
): PageResult<Row> {
  const limit = normalizeLimit(options.limit);
  const table = assertSqlIdentifier(options.table, "table");
  const alias = options.alias === undefined ? undefined : assertSqlIdentifier(options.alias, "alias");
  const sortColumn = assertSqlIdentifier(options.sortColumn, "sortColumn");
  const idColumn = assertSqlIdentifier(options.idColumn ?? "id", "idColumn");
  const deletedAtColumn = assertSqlIdentifier(options.deletedAtColumn ?? SOFT_DELETE_COLUMN, "deletedAtColumn");
  const direction: SortDirection = options.direction ?? "DESC";
  const qualifier = alias ?? table;

  if (options.columns.length === 0) {
    reject("INVALID_IDENTIFIER", "at least one column is required");
  }
  for (const column of options.columns) {
    if (!COLUMN_EXPRESSION_PATTERN.test(column)) {
      reject("INVALID_IDENTIFIER", "column expression is not allowed", { column });
    }
  }

  const conditions: string[] = [];
  const params: Record<string, unknown> = { ...options.params };
  for (const reserved of RESERVED_PARAMS) {
    if (reserved in params) {
      reject("INVALID_IDENTIFIER", `the parameter name '${reserved}' is reserved by the pagination helper`, {
        reserved
      });
    }
  }

  if (options.where && options.where.trim().length > 0) {
    conditions.push(`(${options.where})`);
  }
  if (!(options.includeDeleted ?? false)) {
    conditions.push(`${qualifier}.${deletedAtColumn} IS NULL`);
  }
  if (options.cursor !== undefined) {
    const key = decodeCursor(options.cursor);
    const operator = direction === "DESC" ? "<" : ">";
    // Row values compare as a tuple, which is what makes rows sharing a
    // timestamp fall back to the id instead of colliding or repeating.
    conditions.push(`(${qualifier}.${sortColumn}, ${qualifier}.${idColumn}) ${operator} (:cursorSort, :cursorId)`);
    params.cursorSort = key.sort;
    params.cursorId = key.id;
  }

  const sql = `SELECT ${options.columns.join(", ")}
                  FROM ${table}${alias ? ` ${alias}` : ""}
                 WHERE ${conditions.length > 0 ? conditions.join(" AND ") : "1 = 1"}
                 ORDER BY ${qualifier}.${sortColumn} ${direction}, ${qualifier}.${idColumn} ${direction}
                 LIMIT :limit`;

  const rows = database.prepare(sql).all({ ...params, limit: limit + 1 }) as Row[];
  const toKey = options.toCursorKey ?? ((row: Row) => readCursorKey(row, sortColumn, idColumn));
  return buildPage(rows, limit, toKey);
}

function readCursorKey(row: unknown, sortColumn: string, idColumn: string): CursorKey {
  const record = (row ?? {}) as Record<string, unknown>;
  const sort = record[sortColumn];
  const id = record[idColumn];
  if ((typeof sort !== "string" && typeof sort !== "number") || typeof id !== "string") {
    reject(
      "INVALID_IDENTIFIER",
      `the cursor key columns '${sortColumn}' and '${idColumn}' must be present in the select list`,
      { sortColumn, idColumn }
    );
  }
  return { sort, id };
}

export type TransactionMode = "deferred" | "immediate";

export interface MarkDeletedOptions {
  table: string;
  id: string;
  idColumn?: string;
  deletedAtColumn?: string;
  /** `null` for tables without `updated_at` (settings, diagram_revisions). */
  updatedAtColumn?: string | null;
}

export interface RepositoryContextOptions {
  database: BetterSqlite3.Database;
  /** Milliseconds since the epoch; injected in tests. */
  now?: () => number;
  newId?: () => Ulid;
}

/**
 * The shared handle every table repository is built on. Writes default to
 * BEGIN IMMEDIATE because a deferred transaction that reads first and writes
 * later can fail with SQLITE_BUSY_SNAPSHOT under WAL; taking the write lock up
 * front turns that into a wait, which `busy_timeout` absorbs. Read-only work
 * should not open a transaction at all.
 */
export class RepositoryContext {
  readonly database: BetterSqlite3.Database;

  private readonly clock: () => number;
  private readonly idFactory: () => Ulid;

  constructor(options: RepositoryContextOptions) {
    this.database = options.database;
    this.clock = options.now ?? (() => Date.now());
    const factory = new UlidFactory({ now: this.clock });
    this.idFactory = options.newId ?? (() => factory.create());
  }

  now(): UtcIsoDateTime {
    return toUtcIso(this.clock());
  }

  newId(): Ulid {
    return this.idFactory();
  }

  transaction<T>(work: () => T, options: { mode?: TransactionMode } = {}): T {
    const runner = this.database.transaction(work);
    return (options.mode ?? "immediate") === "deferred" ? runner() : runner.immediate();
  }

  list<Row>(options: KeysetListOptions<Row>): PageResult<Row> {
    return listKeyset<Row>(this.database, options);
  }

  /** Returns the number of rows changed; 0 means missing or already deleted. */
  markDeleted(options: MarkDeletedOptions): number {
    const table = assertSqlIdentifier(options.table, "table");
    const idColumn = assertSqlIdentifier(options.idColumn ?? "id", "idColumn");
    const deletedAtColumn = assertSqlIdentifier(options.deletedAtColumn ?? SOFT_DELETE_COLUMN, "deletedAtColumn");
    const updatedAtColumn =
      options.updatedAtColumn === null
        ? null
        : assertSqlIdentifier(options.updatedAtColumn ?? "updated_at", "updatedAtColumn");

    const now = this.now();
    const assignments = [`${deletedAtColumn} = :now`];
    if (updatedAtColumn) {
      assignments.push(`${updatedAtColumn} = :now`);
    }

    const result = this.database
      .prepare(
        `UPDATE ${table} SET ${assignments.join(", ")} WHERE ${idColumn} = :id AND ${deletedAtColumn} IS NULL`
      )
      .run({ id: options.id, now });
    return result.changes;
  }
}
