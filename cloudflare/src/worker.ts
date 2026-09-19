import { findDomainPosition, updatePositionHistory } from "./lib/rank";
import { scrapeSerp } from "./lib/scrapers";
import { AppSettings, Env, ScrapeQueueMessage } from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-KEY",
  "Access-Control-Max-Age": "86400"
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

function errorJson(message: string, status = 400) {
  return json({ error: message, status }, status);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // --- Health Check ---
    if (path === "/healthz" || path === "/health") {
      return json({ status: "healthy", service: "serpbear-cf", timestamp: Date.now() });
    }

    // --- Auth Endpoints ---
    if (path === "/api/login" && request.method === "POST") {
      const body = (await request.json()) as any;
      const expectedPassword = env.SECRET || "serpbear";
      if (body.password !== expectedPassword) {
        return errorJson("Invalid password", 401);
      }
      const token = `sb_tok_${crypto.randomUUID()}`;
      await env.SERPBEAR_KV?.put(`session:${token}`, "active", { expirationTtl: 86400 * 7 });
      return json({ success: true, token });
    }

    if (path === "/api/logout" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      if (token) {
        await env.SERPBEAR_KV?.delete(`session:${token}`);
      }
      return json({ success: true });
    }

    // --- Domains API ---
    if (path === "/api/domains") {
      if (request.method === "GET") {
        const domains = await env.DB.prepare(
          "SELECT * FROM domains ORDER BY domain ASC"
        ).all();
        return json(domains.results);
      }

      if (request.method === "POST") {
        const body = (await request.json()) as any;
        if (!body.domain) {
          return errorJson("Missing required field: domain");
        }
        const domainClean = body.domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        const slug = domainClean.replace(/\./g, "-");

        await env.DB.prepare(
          `INSERT INTO domains (domain, slug, tags, notification, notification_interval, notification_emails)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(
            domainClean,
            slug,
            JSON.stringify(body.tags || []),
            body.notification ?? 1,
            body.notification_interval || "daily",
            body.notification_emails || ""
          )
          .run();

        const created = await env.DB.prepare("SELECT * FROM domains WHERE domain = ? LIMIT 1")
          .bind(domainClean)
          .first();
        return json(created, 201);
      }

      if (request.method === "DELETE") {
        const domain = url.searchParams.get("domain");
        if (!domain) return errorJson("Missing domain parameter");

        await env.DB.prepare("DELETE FROM keywords WHERE domain = ?").bind(domain).run();
        await env.DB.prepare("DELETE FROM domains WHERE domain = ?").bind(domain).run();
        return json({ success: true });
      }
    }

    // --- Keywords API ---
    if (path === "/api/keywords") {
      if (request.method === "GET") {
        const domain = url.searchParams.get("domain");
        let query = "SELECT * FROM keywords";
        if (domain) {
          query += " WHERE domain = ?";
          const res = await env.DB.prepare(query).bind(domain).all();
          return json(res.results);
        }
        const res = await env.DB.prepare(query).all();
        return json(res.results);
      }

      if (request.method === "POST") {
        const body = (await request.json()) as any;
        const keywordsList: string[] = Array.isArray(body.keywords)
          ? body.keywords
          : [body.keyword];

        if (!body.domain || keywordsList.length === 0) {
          return errorJson("Missing domain or keywords");
        }

        const inserted: any[] = [];
        for (const kw of keywordsList) {
          if (!kw || typeof kw !== "string") continue;
          const kwClean = kw.trim();
          await env.DB.prepare(
            `INSERT INTO keywords (keyword, domain, country, device, city, position, history)
             VALUES (?, ?, ?, ?, ?, 0, '[]')`
          )
            .bind(
              kwClean,
              body.domain,
              body.country || "US",
              body.device || "desktop",
              body.city || ""
            )
            .run();
        }

        // Update keyword count for domain
        await env.DB.prepare(
          "UPDATE domains SET keyword_count = (SELECT COUNT(*) FROM keywords WHERE domain = ?) WHERE domain = ?"
        )
          .bind(body.domain, body.domain)
          .run();

        return json({ success: true, count: keywordsList.length }, 201);
      }

      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return errorJson("Missing keyword id");

        const kw = await env.DB.prepare("SELECT domain FROM keywords WHERE id = ?").bind(id).first<any>();
        await env.DB.prepare("DELETE FROM keywords WHERE id = ?").bind(id).run();

        if (kw?.domain) {
          await env.DB.prepare(
            "UPDATE domains SET keyword_count = (SELECT COUNT(*) FROM keywords WHERE domain = ?) WHERE domain = ?"
          )
            .bind(kw.domain, kw.domain)
            .run();
        }

        return json({ success: true });
      }
    }

    // --- Refresh / Scrape Trigger API ---
    if (path === "/api/refresh" && request.method === "POST") {
      const keywordId = url.searchParams.get("id");
      let keywordsToScrape: any[] = [];

      if (keywordId) {
        keywordsToScrape = (
          await env.DB.prepare("SELECT id, keyword, domain, country, device, city FROM keywords WHERE id = ?")
            .bind(keywordId)
            .all()
        ).results;
      } else {
        const domain = url.searchParams.get("domain");
        if (domain) {
          keywordsToScrape = (
            await env.DB.prepare("SELECT id, keyword, domain, country, device, city FROM keywords WHERE domain = ?")
              .bind(domain)
              .all()
          ).results;
        } else {
          keywordsToScrape = (
            await env.DB.prepare("SELECT id, keyword, domain, country, device, city FROM keywords LIMIT 100")
              .all()
          ).results;
        }
      }

      // Enqueue scraping jobs to Cloudflare Queue
      for (const kw of keywordsToScrape) {
        await env.SERP_QUEUE.send({
          keywordId: kw.id,
          keyword: kw.keyword,
          domain: kw.domain,
          country: kw.country,
          device: kw.device,
          city: kw.city
        });
      }

      return json({ success: true, enqueued: keywordsToScrape.length });
    }

    // --- Cron Trigger API (can be invoked via HTTP or Worker Scheduled handler) ---
    if (path === "/api/cron") {
      const activeKeywords = (
        await env.DB.prepare("SELECT id, keyword, domain, country, device, city FROM keywords LIMIT 500")
          .all()
      ).results;

      for (const kw of activeKeywords as any[]) {
        await env.SERP_QUEUE.send({
          keywordId: kw.id,
          keyword: kw.keyword,
          domain: kw.domain,
          country: kw.country,
          device: kw.device,
          city: kw.city
        });
      }

      return json({ success: true, scheduled_count: activeKeywords.length });
    }

    // --- Settings API ---
    if (path === "/api/settings") {
      if (request.method === "GET") {
        const rows = (await env.DB.prepare("SELECT key, value FROM settings").all()).results as any[];
        const settingsMap: Record<string, any> = {};
        for (const r of rows) {
          try {
            settingsMap[r.key] = JSON.parse(r.value);
          } catch {
            settingsMap[r.key] = r.value;
          }
        }
        return json(settingsMap);
      }

      if (request.method === "POST") {
        const body = (await request.json()) as Record<string, any>;
        for (const [k, v] of Object.entries(body)) {
          const valStr = typeof v === "object" ? JSON.stringify(v) : String(v);
          await env.DB.prepare(
            "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
          )
            .bind(k, valStr)
            .run();
        }
        return json({ success: true });
      }
    }

    // --- Fallback to Static Dashboard Assets ---
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return errorJson(`Endpoint not found: ${path}`, 404);
  },

  // --- Native Cloudflare Cron Handler ---
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        // Enqueue all tracked keywords for daily refresh
        const keywords = (
          await env.DB.prepare("SELECT id, keyword, domain, country, device, city FROM keywords")
            .all()
        ).results as any[];

        for (const kw of keywords) {
          await env.SERP_QUEUE.send({
            keywordId: kw.id,
            keyword: kw.keyword,
            domain: kw.domain,
            country: kw.country,
            device: kw.device,
            city: kw.city
          });
        }
      })()
    );
  },

  // --- Cloudflare Queue Consumer for Concurrent Scraping ---
  async queue(batch: MessageBatch<ScrapeQueueMessage>, env: Env): Promise<void> {
    // Read scraper settings
    const scraperTypeSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'scraper_type'")
      .first<{ value: string }>();
    const apiKeySetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'scaping_api'")
      .first<{ value: string }>();

    const scraperType = scraperTypeSetting?.value || "mock";
    const apiKey = apiKeySetting?.value || undefined;

    for (const message of batch.messages) {
      const item = message.body;
      try {
        // Scrape search results
        const scrapeRes = await scrapeSerp({
          keyword: item.keyword,
          domain: item.domain,
          country: item.country,
          device: item.device,
          scraperType,
          apiKey
        });

        // Get existing keyword details
        const existingKw = await env.DB.prepare("SELECT position, history FROM keywords WHERE id = ?")
          .bind(item.keywordId)
          .first<{ position: number; history: string }>();

        const previousPosition = existingKw?.position || 0;
        const newHistory = updatePositionHistory(existingKw?.history || "[]", scrapeRes.position);

        // Store raw snapshot in R2
        let snapshotKey: string | undefined;
        if (scrapeRes.rawJson && env.SERP_SNAPSHOTS) {
          snapshotKey = `snapshots/${item.domain}/${item.keywordId}_${Date.now()}.json`;
          await env.SERP_SNAPSHOTS.put(snapshotKey, JSON.stringify(scrapeRes.rawJson), {
            httpMetadata: { contentType: "application/json" }
          });
        }

        // Update keyword in D1
        await env.DB.prepare(
          `UPDATE keywords 
           SET position = ?, url = ?, last_result = ?, history = ?, last_updated = datetime('now'), updating = 0, last_update_error = 'false'
           WHERE id = ?`
        )
          .bind(
            scrapeRes.position,
            JSON.stringify(scrapeRes.url ? [scrapeRes.url] : []),
            JSON.stringify(scrapeRes.results),
            newHistory,
            item.keywordId
          )
          .run();

        // Update domain's last_updated
        await env.DB.prepare("UPDATE domains SET last_updated = datetime('now') WHERE domain = ?")
          .bind(item.domain)
          .run();

        // Write to scrape_logs
        await env.DB.prepare(
          `INSERT INTO scrape_logs (id, keyword_id, domain, keyword, position, previous_position, status, scraper_used, snapshot_r2_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            `log_${crypto.randomUUID()}`,
            item.keywordId,
            item.domain,
            item.keyword,
            scrapeRes.position,
            previousPosition,
            "SUCCESS",
            scrapeRes.scraper,
            snapshotKey || null
          )
          .run();

        message.ack();
      } catch (err: any) {
        console.error(`Failed to scrape keyword ${item.keyword}:`, err);
        await env.DB.prepare(
          "UPDATE keywords SET updating = 0, last_update_error = ? WHERE id = ?"
        )
          .bind(String(err.message || err), item.keywordId)
          .run();
        message.retry();
      }
    }
  }
};
