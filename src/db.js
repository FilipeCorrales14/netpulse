import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS targets (
  id             INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL,
  kind           TEXT    NOT NULL CHECK (kind IN ('http', 'tcp')),
  address        TEXT    NOT NULL,
  interval_s     INTEGER NOT NULL DEFAULT 60,
  timeout_ms     INTEGER NOT NULL DEFAULT 5000,
  fail_threshold INTEGER NOT NULL DEFAULT 3,
  state          TEXT    NOT NULL DEFAULT 'unknown',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checks (
  id         INTEGER PRIMARY KEY,
  target_id  INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  checked_at INTEGER NOT NULL,
  ok         INTEGER NOT NULL,
  latency_ms INTEGER,
  error      TEXT
);

CREATE INDEX IF NOT EXISTS idx_checks_target_time ON checks (target_id, checked_at);
`;

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
