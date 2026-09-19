-- SerpBear Cloudflare D1 Initial Schema
-- Replaces disk-based SQLite / Sequelize with Cloudflare D1 serverless SQL

CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  keyword_count INTEGER DEFAULT 0,
  last_updated TEXT,
  added TEXT DEFAULT (datetime('now')),
  tags TEXT DEFAULT '[]',
  notification INTEGER DEFAULT 1,
  notification_interval TEXT DEFAULT 'daily',
  notification_emails TEXT DEFAULT '',
  search_console TEXT,
  scrape_strategy TEXT DEFAULT '',
  scrape_pagination_limit INTEGER DEFAULT 0,
  scrape_smart_full_fallback INTEGER DEFAULT 0,
  subdomain_matching TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_slug ON domains(slug);

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  device TEXT DEFAULT 'desktop',
  country TEXT DEFAULT 'US',
  city TEXT DEFAULT '',
  latlong TEXT DEFAULT '',
  domain TEXT NOT NULL,
  last_updated TEXT,
  added TEXT DEFAULT (datetime('now')),
  position INTEGER DEFAULT 0,
  history TEXT DEFAULT '[]',
  volume INTEGER DEFAULT 0,
  url TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  last_result TEXT DEFAULT '[]',
  sticky INTEGER DEFAULT 1,
  updating INTEGER DEFAULT 0,
  last_update_error TEXT DEFAULT 'false',
  settings TEXT
);

CREATE INDEX IF NOT EXISTS idx_keywords_domain ON keywords(domain);
CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrape_logs (
  id TEXT PRIMARY KEY,
  keyword_id INTEGER,
  domain TEXT NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  previous_position INTEGER DEFAULT 0,
  status TEXT NOT NULL, -- SUCCESS, FAILED
  scraper_used TEXT,
  snapshot_r2_key TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_domain ON scrape_logs(domain);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_created ON scrape_logs(created_at);
