-- Design baseline. Runtime must execute as migration 1 inside a transaction.
-- On every connection: foreign_keys=ON; journal_mode=WAL; synchronous=FULL.
PRAGMA foreign_keys = ON;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE meetings (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  source_type TEXT NOT NULL CHECK(source_type IN ('paste','txt','md','docx')),
  source_path TEXT,
  source_sha256 TEXT,
  text_path TEXT NOT NULL,
  text_sha256 TEXT NOT NULL CHECK(length(text_sha256)=64),
  char_count INTEGER NOT NULL CHECK(char_count BETWEEN 1 AND 1000000),
  chunk_count INTEGER NOT NULL CHECK(chunk_count=(char_count+7999)/8000),
  parser_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id,id),
  CHECK((source_type='paste' AND source_path IS NULL AND source_sha256 IS NULL)
     OR (source_type<>'paste' AND source_path IS NOT NULL AND source_sha256 IS NOT NULL AND length(source_sha256)=64))
);
CREATE INDEX meetings_project_created ON meetings(project_id,created_at DESC,id DESC);
CREATE TABLE diagrams (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  meeting_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('flowchart','swimlane')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  current_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id,meeting_id) REFERENCES meetings(project_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(id,current_revision_id) REFERENCES diagram_revisions(diagram_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX diagrams_project_updated ON diagrams(project_id,updated_at DESC,id DESC);
CREATE TABLE diagram_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE RESTRICT,
  revision_no INTEGER NOT NULL CHECK(revision_no>=1),
  representation TEXT NOT NULL CHECK(representation IN ('dsl','xml')),
  dsl_path TEXT,
  drawio_path TEXT NOT NULL,
  manifest_path TEXT NOT NULL,
  basis_dsl_revision_id TEXT,
  source_mapping_status TEXT NOT NULL CHECK(source_mapping_status IN ('aligned','requires_review')),
  created_by TEXT NOT NULL CHECK(created_by IN ('agent','ui')),
  created_at TEXT NOT NULL,
  UNIQUE(diagram_id,id),
  UNIQUE(diagram_id,revision_no),
  FOREIGN KEY(diagram_id,basis_dsl_revision_id) REFERENCES diagram_revisions(diagram_id,id) ON DELETE RESTRICT,
  CHECK((representation='dsl' AND dsl_path IS NOT NULL AND basis_dsl_revision_id IS NULL AND source_mapping_status='aligned')
     OR (representation='xml' AND dsl_path IS NULL AND basis_dsl_revision_id IS NOT NULL AND source_mapping_status='requires_review'))
);
CREATE INDEX revisions_diagram_no ON diagram_revisions(diagram_id,revision_no DESC);
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json))
);
CREATE TABLE mutation_receipts (
  request_id TEXT PRIMARY KEY NOT NULL,
  operation TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at TEXT NOT NULL
);
