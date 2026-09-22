import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/**
 * BE-008 file store.
 *
 * The data root is the only place this class writes to, and every path it is
 * given is a "/"-separated relative path that is validated before it is
 * resolved. The database stores the relative path and the hash; the absolute
 * path is derived, never persisted.
 */

export const TEMP_DIR_NAME = ".tmp";
export const DEFAULT_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_RELATIVE_PATH_LENGTH = 1000;
export const MAX_SEGMENT_LENGTH = 120;

export const ALLOWED_EXTENSIONS = ["txt", "md", "json", "docx", "drawio", "svg", "png", "xml", "log"] as const;

const ILLEGAL_CHARACTERS = /[<>:"|?*\x00-\x1f]/;
const DRIVE_PREFIX = /^[A-Za-z]:/;
const RESERVED_DEVICE_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export type FileStoreErrorCode =
  | "PATH_NOT_SAFE"
  | "PATH_OUTSIDE_ROOT"
  | "SYMLINK_ESCAPE"
  | "WRITE_FAILED"
  | "READ_FAILED"
  | "REMOVE_FAILED";

export class FileStoreError extends Error {
  readonly code: FileStoreErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: FileStoreErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "FileStoreError";
    this.code = code;
    this.details = details;
  }
}

function reject(code: FileStoreErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new FileStoreError(code, message, details);
}

/**
 * Validates a caller-supplied relative path before it is resolved. Unicode
 * names are allowed (meeting titles and Chinese filenames are expected); what
 * is rejected is anything that could address a file outside the intended tree
 * or is not representable on Windows.
 */
export function assertSafeRelativePath(relativePath: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    reject("PATH_NOT_SAFE", "relative path must be a non-empty string");
  }
  if (relativePath.length > MAX_RELATIVE_PATH_LENGTH) {
    reject("PATH_NOT_SAFE", `relative path is longer than ${MAX_RELATIVE_PATH_LENGTH} characters`, {
      length: relativePath.length
    });
  }
  if (relativePath.includes("\\")) {
    reject("PATH_NOT_SAFE", "relative path must use '/' separators, not '\\'", { relativePath });
  }
  if (ILLEGAL_CHARACTERS.test(relativePath)) {
    reject("PATH_NOT_SAFE", "relative path contains a character that is not allowed", { relativePath });
  }
  if (relativePath.startsWith("/") || DRIVE_PREFIX.test(relativePath)) {
    reject("PATH_NOT_SAFE", "relative path must not be absolute", { relativePath });
  }

  for (const segment of relativePath.split("/")) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      reject("PATH_NOT_SAFE", `relative path contains an unusable segment: '${segment}'`, { relativePath });
    }
    if (segment.length > MAX_SEGMENT_LENGTH) {
      reject("PATH_NOT_SAFE", `path segment is longer than ${MAX_SEGMENT_LENGTH} characters`, { segment });
    }
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      reject("PATH_NOT_SAFE", "path segment must not end with '.' or ' '", { segment });
    }
    if (RESERVED_DEVICE_NAME.test(segment)) {
      reject("PATH_NOT_SAFE", "path segment uses a reserved Windows device name", { segment });
    }
  }

  return relativePath;
}

function assertEntityId(value: string, label: string): void {
  if (!ULID_PATTERN.test(value)) {
    reject("PATH_NOT_SAFE", `${label} must be a 26 character ULID`, { [label]: value });
  }
}

function normalizeExtension(extension: string): string {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(normalized)) {
    reject("PATH_NOT_SAFE", `file extension '${extension}' is not allowed`, {
      extension,
      allowed: [...ALLOWED_EXTENSIONS]
    });
  }
  return normalized;
}

export interface StoredFile {
  relativePath: string;
  sha256: string;
  byteCount: number;
}

function fsyncBestEffort(target: string): void {
  // Directory handles cannot be opened on Windows; the rename itself is still
  // atomic, so a failed fsync only weakens crash durability, never correctness.
  try {
    const handle = openSync(target, "r");
    try {
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
  } catch {
    /* platform does not support fsync on this handle */
  }
}

export class FileStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Turns a validated relative path into an absolute path inside the root. */
  resolve(relativePath: string): string {
    assertSafeRelativePath(relativePath);
    const target = resolve(this.root, ...relativePath.split("/"));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      reject("PATH_OUTSIDE_ROOT", `resolved path escapes the data root: ${relativePath}`, {
        relativePath,
        resolved: target,
        root: this.root
      });
    }
    this.assertNoLinkComponents(relativePath);
    return target;
  }

  /**
   * A symbolic link or junction inside the data root would let a validated
   * path address a file outside it, so every existing component is checked
   * with lstat, which does not follow links.
   */
  private assertNoLinkComponents(relativePath: string): void {
    let current = this.root;
    for (const segment of relativePath.split("/")) {
      current = join(current, segment);
      let stat;
      try {
        stat = lstatSync(current);
      } catch {
        return; // nothing exists here yet, so nothing can point away
      }
      if (stat.isSymbolicLink()) {
        reject("SYMLINK_ESCAPE", `path component is a link and may point outside the data root: ${current}`, {
          component: current
        });
      }
    }
  }

  private newTempPath(): string {
    const directory = join(this.root, TEMP_DIR_NAME);
    mkdirSync(directory, { recursive: true });
    return join(directory, `${randomUUID()}.part`);
  }

  /**
   * Writes through a temp file and an atomic rename, so a reader never sees a
   * half-written file and a failed write leaves no partial file at the target.
   */
  write(relativePath: string, content: Buffer | string): StoredFile {
    assertSafeRelativePath(relativePath);
    if (relativePath.split("/")[0] === TEMP_DIR_NAME) {
      reject("PATH_NOT_SAFE", `the '${TEMP_DIR_NAME}' directory is reserved for the file store`, { relativePath });
    }

    const target = this.resolve(relativePath);
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const sha256 = sha256OfBytes(bytes);

    let tempPath: string | undefined;
    try {
      mkdirSync(dirname(target), { recursive: true });
      tempPath = this.newTempPath();
      writeFileSync(tempPath, bytes, { flag: "wx", mode: 0o600 });
      fsyncBestEffort(tempPath);
      renameSync(tempPath, target);
    } catch (error) {
      if (tempPath) {
        rmSync(tempPath, { force: true });
      }
      reject("WRITE_FAILED", `writing ${relativePath} failed: ${error instanceof Error ? error.message : String(error)}`, {
        relativePath
      });
    }

    fsyncBestEffort(dirname(target));
    return { relativePath, sha256, byteCount: bytes.byteLength };
  }

  read(relativePath: string): Buffer {
    const target = this.resolve(relativePath);
    try {
      return readFileSync(target);
    } catch (error) {
      reject("READ_FAILED", `reading ${relativePath} failed: ${error instanceof Error ? error.message : String(error)}`, {
        relativePath
      });
    }
  }

  readText(relativePath: string): string {
    return this.read(relativePath).toString("utf8");
  }

  exists(relativePath: string): boolean {
    return existsSync(this.resolve(relativePath));
  }

  sha256Of(relativePath: string): string {
    return sha256OfBytes(this.read(relativePath));
  }

  remove(relativePath: string): void {
    const target = this.resolve(relativePath);
    try {
      rmSync(target, { force: false });
    } catch (error) {
      reject("REMOVE_FAILED", `removing ${relativePath} failed: ${error instanceof Error ? error.message : String(error)}`, {
        relativePath
      });
    }
  }

  /**
   * Removes only temp files that are older than the safe waiting period.
   * It never walks the formal project tree, so a bug here cannot delete
   * committed meeting or revision files (DATABASE_PLAN section 8).
   */
  cleanupTempFiles(maxAgeMs: number = DEFAULT_TEMP_MAX_AGE_MS, now: number = Date.now()): string[] {
    const tempRoot = join(this.root, TEMP_DIR_NAME);
    if (!existsSync(tempRoot)) {
      return [];
    }

    const removed: string[] = [];
    for (const entry of readdirSync(tempRoot)) {
      const absolute = join(tempRoot, entry);
      let stat;
      try {
        stat = lstatSync(absolute);
      } catch {
        continue;
      }
      if (!stat.isFile() || now - stat.mtimeMs < maxAgeMs) {
        continue;
      }
      rmSync(absolute, { force: true });
      removed.push(`${TEMP_DIR_NAME}/${entry}`);
    }
    return removed;
  }
}

export function sha256OfBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function projectRelativePath(projectId: string): string {
  assertEntityId(projectId, "projectId");
  return `projects/${projectId}/project.json`;
}

export type MeetingFileKind = "source" | "transcript" | "metadata";

export function meetingRelativePath(
  projectId: string,
  meetingId: string,
  kind: MeetingFileKind,
  extension = "txt"
): string {
  assertEntityId(projectId, "projectId");
  assertEntityId(meetingId, "meetingId");
  const base = `projects/${projectId}/meetings/${meetingId}`;
  if (kind === "transcript") {
    return `${base}/transcript.md`;
  }
  if (kind === "metadata") {
    return `${base}/metadata.json`;
  }
  return `${base}/source.${normalizeExtension(extension)}`;
}

export type RevisionFileKind = "dsl" | "drawio" | "svg" | "png";

const REVISION_FILE_NAMES: Record<RevisionFileKind, string> = {
  dsl: "diagram.json",
  drawio: "diagram.drawio",
  svg: "diagram.svg",
  png: "diagram.png"
};

export function revisionRelativePath(
  projectId: string,
  diagramId: string,
  revisionNo: number,
  kind: RevisionFileKind
): string {
  assertEntityId(projectId, "projectId");
  assertEntityId(diagramId, "diagramId");
  if (!Number.isInteger(revisionNo) || revisionNo < 1) {
    reject("PATH_NOT_SAFE", "revisionNo must be a positive integer", { revisionNo });
  }
  const directory = String(revisionNo).padStart(6, "0");
  return `projects/${projectId}/diagrams/${diagramId}/revisions/${directory}/${REVISION_FILE_NAMES[kind]}`;
}
