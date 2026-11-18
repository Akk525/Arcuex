-- Explicitly opt-in product registry. Not part of legacy startup migrations.
CREATE TABLE IF NOT EXISTS platform_product_registry_schema (
  version INTEGER PRIMARY KEY CHECK (version=1)
);
INSERT OR IGNORE INTO platform_product_registry_schema VALUES (1);

CREATE TABLE IF NOT EXISTS platform_product_versions (
  organization_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0),
  digest TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,product_id,version)
);
CREATE TABLE IF NOT EXISTS platform_product_publication_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence>0),
  from_state TEXT,
  to_state TEXT NOT NULL CHECK(to_state IN ('draft','review','approved','published','retired')),
  actor_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('product:author','product:approve','product:publish','product:retire')),
  authorization_ref TEXT NOT NULL,
  approval_event_id TEXT REFERENCES platform_product_publication_events(id),
  created_at TEXT NOT NULL,
  UNIQUE(organization_id,product_id,version,sequence),
  FOREIGN KEY(organization_id,product_id,version) REFERENCES platform_product_versions(organization_id,product_id,version),
  CHECK((from_state IS NULL AND to_state='draft' AND sequence=1)
    OR (from_state IS NOT NULL AND ((from_state='draft' AND to_state='review')
    OR (from_state='review' AND to_state IN ('draft','approved'))
    OR (from_state='approved' AND to_state IN ('published','retired'))
    OR (from_state='published' AND to_state='retired')))),
  CHECK(to_state!='published' OR approval_event_id IS NOT NULL)
);
CREATE TRIGGER IF NOT EXISTS platform_product_versions_no_update BEFORE UPDATE ON platform_product_versions BEGIN SELECT RAISE(ABORT,'Immutable product version'); END;
CREATE TRIGGER IF NOT EXISTS platform_product_versions_no_delete BEFORE DELETE ON platform_product_versions BEGIN SELECT RAISE(ABORT,'Immutable product version'); END;
CREATE TRIGGER IF NOT EXISTS platform_product_events_no_update BEFORE UPDATE ON platform_product_publication_events BEGIN SELECT RAISE(ABORT,'Immutable publication provenance'); END;
CREATE TRIGGER IF NOT EXISTS platform_product_events_no_delete BEFORE DELETE ON platform_product_publication_events BEGIN SELECT RAISE(ABORT,'Immutable publication provenance'); END;
CREATE TRIGGER IF NOT EXISTS platform_product_events_sequence BEFORE INSERT ON platform_product_publication_events BEGIN
  SELECT CASE WHEN NEW.sequence != (SELECT COUNT(*)+1 FROM platform_product_publication_events WHERE organization_id=NEW.organization_id AND product_id=NEW.product_id AND version=NEW.version)
    OR NEW.from_state IS NOT (SELECT to_state FROM platform_product_publication_events WHERE organization_id=NEW.organization_id AND product_id=NEW.product_id AND version=NEW.version ORDER BY sequence DESC LIMIT 1)
    THEN RAISE(ABORT,'Publication sequence conflict') END;
END;
