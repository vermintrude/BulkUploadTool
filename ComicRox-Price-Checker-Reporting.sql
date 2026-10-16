-- Run once in a new Cloudflare D1 database, then bind it as COMICROX_USAGE.
CREATE TABLE IF NOT EXISTS pc_usage (
 id TEXT PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL,
 status INTEGER NOT NULL, duration_ms INTEGER NOT NULL,
 ebay_browse INTEGER NOT NULL, ebay_auth INTEGER NOT NULL,
 ebay_429 INTEGER NOT NULL, ai TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pc_usage_at ON pc_usage(at);
