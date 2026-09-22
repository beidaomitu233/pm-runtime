import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteGate } from "./sqliteGate.js";
import { applyMigrations, defaultMigrationsDirectory, loadMigrationsFromDirectory } from "./migrationRunner.js";

const NOW = "2026-09-22T00:00:00.000Z";

function id(tag: string): string {
  return tag.repeat(Math.ceil(26 / tag.length)).slice(0, 26);
}

describe("0001_initial schema constraints", () => {
  let directory: string;
  let gate: SqliteGate;
  let db: ReturnType<SqliteGate["open"]>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pm-initial-schema-"));
    gate = new SqliteGate(join(directory, "pm.db"));
    db = gate.open();
    applyMigrations(db, loadMigrationsFromDirectory(defaultMigrationsDirectory()), { appVersion: "0.1.0-test" });
  });

  afterEach(() => {
    gate.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function project(overrides: Record<string, unknown> = {}) {
    return db
      .prepare(
        `INSERT INTO projects (id, name, description, created_at, updated_at, deleted_at)
         VALUES (@id, @name, @description, @created_at, @updated_at, @deleted_at)`
      )
      .run({
        id: id("P"),
        name: "项目",
        description: null,
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
        ...overrides
      });
  }

  function meeting(overrides: Record<string, unknown> = {}) {
    return db
      .prepare(
        `INSERT INTO meetings (id, project_id, title, source_type, char_count, byte_count, import_status, created_at, updated_at)
         VALUES (@id, @project_id, @title, @source_type, @char_count, @byte_count, @import_status, @created_at, @updated_at)`
      )
      .run({
        id: id("M"),
        project_id: id("P"),
        title: "周会",
        source_type: "paste",
        char_count: 0,
        byte_count: 0,
        import_status: "importing",
        created_at: NOW,
        updated_at: NOW,
        ...overrides
      });
  }

  it("creates every declared table and index", () => {
    const objects = db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all() as Array<{
      type: string;
      name: string;
    }>;
    const tables = objects.filter((row) => row.type === "table").map((row) => row.name);
    const indexes = objects.filter((row) => row.type === "index").map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "schema_migrations",
        "projects",
        "meetings",
        "diagrams",
        "diagram_revisions",
        "diagram_source_refs",
        "agent_adapters",
        "settings",
        "idempotency_records"
      ])
    );
    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_projects_updated_active",
        "idx_meetings_project_created",
        "idx_meetings_project_status",
        "idx_diagrams_project_updated",
        "idx_revisions_diagram_created",
        "idx_source_refs_meeting",
        "idx_idempotency_expires"
      ])
    );
  });

  it("rejects project names that are blank, padded, oversized or contain control characters", () => {
    expect(() => project({ name: "   " })).toThrow();
    expect(() => project({ name: " 项目" })).toThrow();
    expect(() => project({ name: "项".repeat(81) })).toThrow();
    expect(() => project({ name: "项目\n备注" })).toThrow();
    expect(() => project({ name: "项\t目" })).toThrow();
    project({ name: "项".repeat(80) });
  });

  it("rejects project ids that are not 26 characters and oversized descriptions", () => {
    expect(() => project({ id: "short" })).toThrow();
    expect(() => project({ description: "x".repeat(2001) })).toThrow();
    project({ description: "x".repeat(2000) });
  });

  it("pins the meeting source type and import status enums", () => {
    project();
    expect(() => meeting({ source_type: "pdf" })).toThrow();
    expect(() => meeting({ import_status: "done" })).toThrow();
    for (const value of ["paste", "txt", "md", "docx"]) {
      meeting({ id: id(`M${value}`), source_type: value });
    }
  });

  it("requires a text path, hash and positive length before a meeting can be ready", () => {
    project();
    expect(() =>
      db
        .prepare(
          `INSERT INTO meetings (id, project_id, title, source_type, char_count, byte_count, import_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id("MR"), id("P"), "周会", "txt", 0, 10, "ready", NOW, NOW)
    ).toThrow();

    db.prepare(
      `INSERT INTO meetings (id, project_id, title, source_type, text_rel_path, text_sha256, char_count, byte_count, import_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id("MR2"), id("P"), "周会", "txt", "projects/p/meetings/m/transcript.md", "a".repeat(64), 12, 10, "ready", NOW, NOW);
  });

  it("requires an error code before a meeting can be failed", () => {
    project();
    expect(() => meeting({ import_status: "failed" })).toThrow();
    db.prepare(
      `INSERT INTO meetings (id, project_id, title, source_type, import_status, import_error_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id("MF"), id("P"), "周会", "paste", "failed", "IMPORT_PARSE_FAILED", NOW, NOW);
  });

  it("rejects meetings whose project does not exist", () => {
    expect(() => meeting()).toThrow(/FOREIGN KEY/);
  });

  it("pins the diagram enums and refuses a ready diagram without a revision", () => {
    project();
    const insert = (overrides: Record<string, unknown>) =>
      db
        .prepare(
          `INSERT INTO diagrams (id, project_id, diagram_type, title, orientation, status, current_revision_no, created_at, updated_at)
           VALUES (@id, @project_id, @diagram_type, @title, @orientation, @status, @current_revision_no, @created_at, @updated_at)`
        )
        .run({
          id: id("D"),
          project_id: id("P"),
          diagram_type: "flowchart",
          title: "流程",
          orientation: "horizontal",
          status: "validating",
          current_revision_no: 0,
          created_at: NOW,
          updated_at: NOW,
          ...overrides
        });

    expect(() => insert({ diagram_type: "sequence", id: id("D1") })).toThrow();
    expect(() => insert({ orientation: "diagonal", id: id("D2") })).toThrow();
    expect(() => insert({ status: "waiting", id: id("D3") })).toThrow();
    expect(() => insert({ status: "ready", current_revision_no: 0, id: id("D4") })).toThrow();
    expect(() => insert({ status: "render_failed", id: id("D5") })).toThrow();
    insert({ status: "ready", current_revision_no: 1, id: id("D6") });
  });

  it("keeps revision numbers unique per diagram and rejects malformed hashes", () => {
    project();
    db.prepare(
      `INSERT INTO diagrams (id, project_id, diagram_type, title, orientation, status, current_revision_no, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id("D"), id("P"), "flowchart", "流程", "horizontal", "ready", 1, NOW, NOW);

    const revision = (overrides: Record<string, unknown> = {}) =>
      db
        .prepare(
          `INSERT INTO diagram_revisions (id, diagram_id, revision_no, source, drawio_rel_path, content_sha256, renderer_version, created_at)
           VALUES (@id, @diagram_id, @revision_no, @source, @drawio_rel_path, @content_sha256, @renderer_version, @created_at)`
        )
        .run({
          id: id("R"),
          diagram_id: id("D"),
          revision_no: 1,
          source: "agent_render",
          drawio_rel_path: "projects/p/diagrams/d/revisions/000001/diagram.drawio",
          content_sha256: "b".repeat(64),
          renderer_version: "0.1.0",
          created_at: NOW,
          ...overrides
        });

    revision({});
    expect(() => revision({ id: id("R2"), revision_no: 1 })).toThrow();
    expect(() => revision({ id: id("R3"), revision_no: 0 })).toThrow();
    expect(() => revision({ id: id("R4"), source: "manual" })).toThrow();
    expect(() => revision({ id: id("R5"), content_sha256: "Z".repeat(64) })).toThrow();
    expect(() => revision({ id: id("R6"), content_sha256: "b".repeat(63) })).toThrow();
    revision({ id: id("R7"), revision_no: 2 });
  });

  it("keeps source refs inside the meeting text and unique per revision node", () => {
    project();
    db.prepare(
      `INSERT INTO meetings (id, project_id, title, source_type, text_rel_path, text_sha256, char_count, byte_count, import_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id("M"), id("P"), "周会", "txt", "p/m/transcript.md", "c".repeat(64), 100, 10, "ready", NOW, NOW);
    db.prepare(
      `INSERT INTO diagrams (id, project_id, diagram_type, title, orientation, status, current_revision_no, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id("D"), id("P"), "flowchart", "流程", "horizontal", "ready", 1, NOW, NOW);
    db.prepare(
      `INSERT INTO diagram_revisions (id, diagram_id, revision_no, source, drawio_rel_path, content_sha256, renderer_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id("R"), id("D"), 1, "agent_render", "d/revisions/000001/diagram.drawio", "d".repeat(64), "0.1.0", NOW);

    const ref = (overrides: Record<string, unknown> = {}) =>
      db
        .prepare(
          `INSERT INTO diagram_source_refs (id, revision_id, meeting_id, node_id, start_offset, end_offset, created_at)
           VALUES (@id, @revision_id, @meeting_id, @node_id, @start_offset, @end_offset, @created_at)`
        )
        .run({
          id: id("S"),
          revision_id: id("R"),
          meeting_id: id("M"),
          node_id: "n1",
          start_offset: 10,
          end_offset: 20,
          created_at: NOW,
          ...overrides
        });

    expect(() => ref({ id: id("S2"), end_offset: 10 })).toThrow();
    expect(() => ref({ id: id("S3"), end_offset: 5 })).toThrow();
    expect(() => ref({ id: id("S4"), start_offset: -1 })).toThrow();
    ref();
    expect(() => ref({ id: id("S5") })).toThrow();
  });

  it("keeps one adapter row per host and scope and pins its status", () => {
    const adapter = (overrides: Record<string, unknown> = {}) =>
      db
        .prepare(
          `INSERT INTO agent_adapters (id, host_type, scope, status, adapter_version, created_at, updated_at)
           VALUES (@id, @host_type, @scope, @status, @adapter_version, @created_at, @updated_at)`
        )
        .run({
          id: id("A"),
          host_type: "codex",
          scope: "user",
          status: "not_installed",
          adapter_version: "0.1.0",
          created_at: NOW,
          updated_at: NOW,
          ...overrides
        });

    adapter();
    expect(() => adapter({ id: id("A2") })).toThrow();
    expect(() => adapter({ id: id("A3"), host_type: "cursor" })).toThrow();
    expect(() => adapter({ id: id("A4"), status: "paused" })).toThrow();
    adapter({ id: id("A5"), scope: "project" });
  });

  it("stores only valid JSON in settings and long enough idempotency keys", () => {
    db.prepare("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)").run(
      "ui.locale",
      '{"value":"zh-CN"}',
      NOW
    );
    expect(() =>
      db.prepare("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)").run("ui.locale2", "not json", NOW)
    ).toThrow();

    db.prepare(
      `INSERT INTO idempotency_records (key, operation, request_hash, response_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("idem-key-00000001", "meeting.import", "e".repeat(64), "{}", NOW, NOW);
    expect(() =>
      db
        .prepare(
          `INSERT INTO idempotency_records (key, operation, request_hash, response_json, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run("short", "meeting.import", "e".repeat(64), "{}", NOW, NOW)
    ).toThrow();
  });

  it("rejects values of the wrong storage class because every table is STRICT", () => {
    project();
    expect(() =>
      db
        .prepare(
          `INSERT INTO meetings (id, project_id, title, source_type, char_count, byte_count, import_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id("MS"), id("P"), "周会", "txt", "twelve", 10, "importing", NOW, NOW)
    ).toThrow(/STRICT|INT|TEXT/i);
  });
});
