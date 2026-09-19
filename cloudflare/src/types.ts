export interface Env {
  DB: D1Database;
  SERP_QUEUE: Queue<ScrapeQueueMessage>;
  SERPBEAR_KV: KVNamespace;
  SERP_SNAPSHOTS: R2Bucket;
  ASSETS?: Fetcher;

  API_KEY?: string;
  SECRET?: string;
  ENVIRONMENT?: string;
}

export interface ScrapeQueueMessage {
  keywordId: number;
  keyword: string;
  domain: string;
  country?: string;
  device?: string;
  city?: string;
  attempt?: number;
}

export interface SerpSearchResultItem {
  position: number;
  title: string;
  url: string;
  snippet?: string;
  domain?: string;
}

export interface ScrapeResult {
  keyword: string;
  domain: string;
  position: number; // 0 if not in top 100
  url: string;
  results: SerpSearchResultItem[];
  scraper: string;
  rawJson?: any;
}

export interface AppSettings {
  scraper_type: string;
  scaping_api?: string;
  proxy?: string;
  notification_interval?: string;
  notification_email?: string;
  scrape_interval?: string;
  smtp_server?: string;
  smtp_port?: string;
  smtp_username?: string;
  smtp_password?: string;
}
