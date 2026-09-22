-- 0001_initial.sql
-- 目的:创建 PM Runtime v0.1 核心 schema,对应 DATABASE_PLAN.md 第 3、4 节。
-- 前置版本:空库。
-- 不可逆:是。v0.1 不提供降级迁移,回滚应用前必须恢复备份(DATABASE_PLAN.md 第 9 节)。
-- 说明:schema_migrations 由 migration runner 自建,本文件不创建该表。
-- 说明:所有表使用 STRICT;枚举由 CHECK 固定,新增枚举需要新迁移并同步 contracts。

CREATE TABLE projects (
  id          TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 26),
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description TEXT          CHECK (description IS NULL OR length(description) <= 2000),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  CHECK (name = trim(name)),
  CHECK (instr(name, char(9)) = 0 AND instr(name, char(10)) = 0 AND instr(name, char(13)) = 0)
) STRICT;

CREATE INDEX idx_projects_updated_active
  ON projects (updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_projects_name_active
  ON projects (name COLLATE NOCASE)
  WHERE deleted_at IS NULL;

CREATE TABLE meetings (
  id                   TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 26),
  project_id           TEXT NOT NULL REFERENCES projects(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  title                TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  source_type          TEXT NOT NULL CHECK (source_type IN ('paste', 'txt', 'md', 'docx')),
  original_filename    TEXT          CHECK (original_filename IS NULL OR length(original_filename) BETWEEN 1 AND 255),
  source_rel_path      TEXT          CHECK (source_rel_path IS NULL OR length(source_rel_path) BETWEEN 1 AND 400),
  text_rel_path        TEXT          CHECK (text_rel_path IS NULL OR length(text_rel_path) BETWEEN 1 AND 400),
  text_sha256          TEXT          CHECK (text_sha256 IS NULL OR (length(text_sha256) = 64 AND text_sha256 NOT GLOB '*[^0-9a-f]*')),
  char_count           INTEGER NOT NULL DEFAULT 0 CHECK (char_count >= 0),
  byte_count           INTEGER NOT NULL DEFAULT 0 CHECK (byte_count >= 0),
  import_status        TEXT NOT NULL DEFAULT 'importing' CHECK (import_status IN ('importing', 'ready', 'failed')),
  import_error_code    TEXT          CHECK (import_error_code IS NULL OR length(import_error_code) BETWEEN 1 AND 60),
  import_error_message TEXT          CHECK (import_error_message IS NULL OR length(import_error_message) <= 1000),
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  deleted_at           TEXT,
  CHECK (title = trim(title)),
  CHECK (import_status <> 'ready'
         OR (text_rel_path IS NOT NULL AND text_sha256 IS NOT NULL AND char_count > 0)),
  CHECK (import_status <> 'failed' OR import_error_code IS NOT NULL)
) STRICT;

CREATE INDEX idx_meetings_project_created
  ON meetings (project_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_meetings_project_status
  ON meetings (project_id, import_status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_meetings_project_source
  ON meetings (project_id, source_type, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_meetings_text_hash
  ON meetings (project_id, text_sha256);

CREATE TABLE diagrams (
  id                  TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 26),
  project_id          TEXT NOT NULL REFERENCES projects(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  meeting_id          TEXT          REFERENCES meetings(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  diagram_type        TEXT NOT NULL CHECK (diagram_type IN ('flowchart', 'swimlane')),
  title               TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  orientation         TEXT NOT NULL CHECK (orientation IN ('horizontal', 'vertical')),
  status              TEXT NOT NULL DEFAULT 'validating'
                      CHECK (status IN ('validating', 'rendering', 'ready', 'validation_failed', 'render_failed')),
  current_revision_no INTEGER NOT NULL DEFAULT 0 CHECK (current_revision_no >= 0),
  last_error_code     TEXT          CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 60),
  last_error_message  TEXT          CHECK (last_error_message IS NULL OR length(last_error_message) <= 1000),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT,
  CHECK (title = trim(title)),
  CHECK (status <> 'ready' OR current_revision_no >= 1),
  CHECK (status NOT IN ('validation_failed', 'render_failed') OR last_error_code IS NOT NULL)
) STRICT;

CREATE INDEX idx_diagrams_project_updated
  ON diagrams (project_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_diagrams_project_type
  ON diagrams (project_id, diagram_type, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_diagrams_meeting
  ON diagrams (meeting_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_diagrams_status
  ON diagrams (status, updated_at);

CREATE TABLE diagram_revisions (
  id                 TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 26),
  diagram_id         TEXT NOT NULL REFERENCES diagrams(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  revision_no        INTEGER NOT NULL CHECK (revision_no >= 1),
  base_revision_no   INTEGER          CHECK (base_revision_no IS NULL OR base_revision_no >= 0),
  source             TEXT NOT NULL CHECK (source IN ('agent_render', 'editor_save', 'history_fork')),
  dsl_schema_version TEXT NOT NULL DEFAULT '0.1' CHECK (length(dsl_schema_version) BETWEEN 1 AND 20),
  dsl_rel_path       TEXT          CHECK (dsl_rel_path IS NULL OR length(dsl_rel_path) BETWEEN 1 AND 400),
  drawio_rel_path    TEXT NOT NULL CHECK (length(drawio_rel_path) BETWEEN 1 AND 400),
  svg_rel_path       TEXT          CHECK (svg_rel_path IS NULL OR length(svg_rel_path) BETWEEN 1 AND 400),
  png_rel_path       TEXT          CHECK (png_rel_path IS NULL OR length(png_rel_path) BETWEEN 1 AND 400),
  content_sha256     TEXT NOT NULL CHECK (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  renderer_version   TEXT NOT NULL CHECK (length(renderer_version) BETWEEN 1 AND 60),
  change_note        TEXT          CHECK (change_note IS NULL OR length(change_note) <= 300),
  created_at         TEXT NOT NULL,
  UNIQUE (diagram_id, revision_no)
) STRICT;

CREATE INDEX idx_revisions_diagram_created
  ON diagram_revisions (diagram_id, revision_no DESC);

CREATE INDEX idx_revisions_hash
  ON diagram_revisions (diagram_id, content_sha256);

CREATE TABLE diagram_source_refs (
  id           TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 26),
  revision_id  TEXT NOT NULL REFERENCES diagram_revisions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  meeting_id   TEXT NOT NULL REFERENCES meetings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  node_id      TEXT NOT NULL CHECK (length(node_id) BETWEEN 1 AND 64),
  locator_type TEXT NOT NULL DEFAULT 'char_range' CHECK (locator_type IN ('char_range')),
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset   INTEGER NOT NULL CHECK (end_offset > start_offset),
  quote_text   TEXT          CHECK (quote_text IS NULL OR length(quote_text) <= 500),
  created_at   TEXT NOT NULL,
  UNIQUE (revision_id, node_id, meeting_id, start_offset, end_offset)
) STRICT;

CREATE INDEX idx_source_refs_revision_node
  ON diagram_source_refs (revision_id, node_id);

CREATE INDEX idx_source_refs_meeting
  ON diagram_source_refs (meeting_id, start_offset);

CREATE TABLE agent_adapters (
  id                 TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 26),
  host_type          TEXT NOT NULL CHECK (host_type IN ('codex', 'claude_code', 'dsh')),
  scope              TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'project')),
  config_path_masked TEXT          CHECK (config_path_masked IS NULL OR length(config_path_masked) BETWEEN 1 AND 400),
  config_fingerprint TEXT          CHECK (config_fingerprint IS NULL OR length(config_fingerprint) BETWEEN 1 AND 128),
  status             TEXT NOT NULL DEFAULT 'not_installed'
                     CHECK (status IN ('not_installed', 'installed', 'connected', 'error')),
  adapter_version    TEXT NOT NULL CHECK (length(adapter_version) BETWEEN 1 AND 60),
  last_checked_at    TEXT,
  last_error_code    TEXT          CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 60),
  last_error_message TEXT          CHECK (last_error_message IS NULL OR length(last_error_message) <= 1000),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (host_type, scope)
) STRICT;

CREATE INDEX idx_agent_adapters_status
  ON agent_adapters (status, last_checked_at);

CREATE TABLE settings (
  key        TEXT NOT NULL PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 100),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE idempotency_records (
  key           TEXT NOT NULL PRIMARY KEY CHECK (length(key) BETWEEN 16 AND 100),
  operation     TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 60),
  request_hash  TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_json TEXT NOT NULL,
  entity_id     TEXT          CHECK (entity_id IS NULL OR length(entity_id) = 26),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
) STRICT;

CREATE INDEX idx_idempotency_expires
  ON idempotency_records (expires_at);
