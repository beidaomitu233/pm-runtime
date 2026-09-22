import { existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FileStore,
  FileStoreError,
  meetingRelativePath,
  projectRelativePath,
  revisionRelativePath,
  TEMP_DIR_NAME
} from "./fileStore.js";

const PROJECT_ID = "01J8ZZZZZZZZZZZZZZZZZZZZZP";
const MEETING_ID = "01J8ZZZZZZZZZZZZZZZZZZZZZ1";
const DIAGRAM_ID = "01J8ZZZZZZZZZZZZZZZZZZZZZ2";

function id26(tag: string): string {
  return tag.repeat(Math.ceil(26 / tag.length)).slice(0, 26);
}

describe("file store", () => {
  let directory: string;
  let store: FileStore;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pm-file-store-"));
    store = new FileStore(join(directory, "data"));
    mkdirSync(store.root, { recursive: true });
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("writes through a temp file and returns the relative path, hash and size", () => {
    const stored = store.write("projects/p/meetings/m/transcript.md", "会议正文");

    expect(stored.relativePath).toBe("projects/p/meetings/m/transcript.md");
    expect(stored.byteCount).toBe(Buffer.byteLength("会议正文", "utf8"));
    expect(stored.sha256).toHaveLength(64);
    expect(store.readText(stored.relativePath)).toBe("会议正文");
    expect(store.sha256Of(stored.relativePath)).toBe(stored.sha256);
    expect(readdirSync(join(store.root, TEMP_DIR_NAME))).toHaveLength(0);
  });

  it("hashes content with SHA-256", () => {
    expect(store.write("a.txt", "abc").sha256).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("replaces an existing file atomically", () => {
    const first = store.write("projects/p/transcript.md", "first");
    const second = store.write("projects/p/transcript.md", "second");

    expect(store.readText("projects/p/transcript.md")).toBe("second");
    expect(second.sha256).not.toBe(first.sha256);
    expect(store.sha256Of("projects/p/transcript.md")).toBe(second.sha256);
  });

  it("rejects paths that would escape the data root", () => {
    const attempts = [
      "../outside.txt",
      "projects/../../outside.txt",
      "projects/./secret.txt",
      "/etc/passwd",
      "C:/Windows/win.ini",
      "C:\\Windows\\win.ini",
      "projects\\p\\x.txt",
      "projects//p/x.txt",
      "projects/p/",
      "",
      "projects/p/CON",
      "projects/p/name.",
      "projects/p/<script>"
    ];

    for (const attempt of attempts) {
      expect(() => store.write(attempt, "x"), attempt).toThrow(FileStoreError);
    }
  });

  it("accepts unicode file names", () => {
    const stored = store.write("projects/项目组/会议记录.md", "正文");
    expect(store.readText(stored.relativePath)).toBe("正文");
  });

  it("refuses to write through a junction that points outside the root", () => {
    const outside = mkdtempSync(join(tmpdir(), "pm-outside-"));
    const linkPath = join(store.root, "escape");
    mkdirSync(store.root, { recursive: true });
    symlinkSync(outside, linkPath, "junction");
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);

    try {
      expect(() => store.write("escape/stolen.txt", "x")).toThrow(/link/i);
      expect(existsSync(join(outside, "stolen.txt"))).toBe(false);
    } finally {
      rmSync(linkPath, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("refuses to read through a linked file", (ctx) => {
    const outside = mkdtempSync(join(tmpdir(), "pm-outside-file-"));
    const outsideFile = join(outside, "secret.txt");
    writeFileSync(outsideFile, "secret");
    mkdirSync(store.root, { recursive: true });
    const linkPath = join(store.root, "linked.txt");
    try {
      symlinkSync(outsideFile, linkPath, "file");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") {
        rmSync(outside, { recursive: true, force: true });
        ctx.skip(`host cannot create file symlinks (${code}); enable Developer Mode or run elevated`);
        return;
      }
      rmSync(outside, { recursive: true, force: true });
      throw error;
    }

    try {
      expect(() => store.read("linked.txt")).toThrow(FileStoreError);
    } finally {
      rmSync(linkPath, { force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("leaves no temp file behind when the rename fails", () => {
    const target = "projects/p/blocked.txt";
    mkdirSync(join(store.root, "projects/p/blocked.txt"), { recursive: true });

    expect(() => store.write(target, "x")).toThrow(FileStoreError);
    expect(readdirSync(join(store.root, TEMP_DIR_NAME))).toHaveLength(0);
    expect(existsSync(join(store.root, "projects/p/blocked.txt/x"))).toBe(false);
  });

  it("reports missing files as a read failure, not an empty result", () => {
    try {
      store.read("projects/p/missing.md");
      expect.unreachable("reading a missing file must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FileStoreError);
      expect((error as FileStoreError).code).toBe("READ_FAILED");
    }
  });

  it("keeps the temp directory out of the public path space", () => {
    expect(() => store.write(`${TEMP_DIR_NAME}/x.txt`, "x")).toThrow(/reserved/);
  });

  it("only cleans up temp files that are past the safe waiting period", () => {
    const stale = join(store.root, TEMP_DIR_NAME, "stale.part");
    const fresh = join(store.root, TEMP_DIR_NAME, "fresh.part");
    mkdirSync(join(store.root, TEMP_DIR_NAME), { recursive: true });
    writeFileSync(stale, "old");
    writeFileSync(fresh, "new");
    const old = Date.now() - 48 * 60 * 60 * 1000;
    utimesSync(stale, new Date(old), new Date(old));

    const committed = store.write("projects/p/meetings/m/transcript.md", "正文");

    const removed = store.cleanupTempFiles();
    expect(removed).toContain(`${TEMP_DIR_NAME}/stale.part`);
    expect(removed).not.toContain(`${TEMP_DIR_NAME}/fresh.part`);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(store.exists(committed.relativePath)).toBe(true);
  });

  it("removes a stored file on request", () => {
    const stored = store.write("projects/p/x.txt", "x");
    store.remove(stored.relativePath);
    expect(store.exists(stored.relativePath)).toBe(false);
    expect(() => store.remove("projects/p/nope.txt")).toThrow(FileStoreError);
  });
});

describe("entity path builders", () => {
  it("lays files out as described in DATABASE_PLAN section 2", () => {
    expect(projectRelativePath(PROJECT_ID)).toBe(`projects/${PROJECT_ID}/project.json`);
    expect(meetingRelativePath(PROJECT_ID, MEETING_ID, "source", "docx")).toBe(
      `projects/${PROJECT_ID}/meetings/${MEETING_ID}/source.docx`
    );
    expect(meetingRelativePath(PROJECT_ID, MEETING_ID, "transcript")).toBe(
      `projects/${PROJECT_ID}/meetings/${MEETING_ID}/transcript.md`
    );
    expect(meetingRelativePath(PROJECT_ID, MEETING_ID, "metadata")).toBe(
      `projects/${PROJECT_ID}/meetings/${MEETING_ID}/metadata.json`
    );
    expect(revisionRelativePath(PROJECT_ID, DIAGRAM_ID, 1, "drawio")).toBe(
      `projects/${PROJECT_ID}/diagrams/${DIAGRAM_ID}/revisions/000001/diagram.drawio`
    );
    expect(revisionRelativePath(PROJECT_ID, DIAGRAM_ID, 12, "dsl")).toBe(
      `projects/${PROJECT_ID}/diagrams/${DIAGRAM_ID}/revisions/000012/diagram.json`
    );
  });

  it("rejects ids, extensions and revision numbers that are not safe", () => {
    expect(() => projectRelativePath("../etc")).toThrow(FileStoreError);
    expect(() => meetingRelativePath(id26("A"), "short", "transcript")).toThrow(FileStoreError);
    expect(() => meetingRelativePath(id26("A"), id26("B"), "source", "exe")).toThrow(FileStoreError);
    expect(() => revisionRelativePath(id26("A"), id26("B"), 0, "png")).toThrow(FileStoreError);
  });
});
