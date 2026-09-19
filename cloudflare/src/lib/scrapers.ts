import { ScrapeResult, SerpSearchResultItem } from "../types";
import { findDomainPosition } from "./rank";

export async function scrapeSerp(params: {
  keyword: string;
  domain: string;
  country?: string;
  device?: string;
  scraperType: string;
  apiKey?: string;
}): Promise<ScrapeResult> {
  const { keyword, domain, country = "US", device = "desktop", scraperType, apiKey } = params;

  if (scraperType === "serper" && apiKey) {
    return scrapeSerper(keyword, domain, country, device, apiKey);
  }

  if (scraperType === "valueserp" && apiKey) {
    return scrapeValueSerp(keyword, domain, country, device, apiKey);
  }

  if (scraperType === "serpapi" && apiKey) {
    return scrapeSerpApi(keyword, domain, country, device, apiKey);
  }

  // Simulated / Mock fallback for local testing or without active API key
  return mockSerpScrape(keyword, domain);
}

async function scrapeSerper(
  keyword: string,
  domain: string,
  country: string,
  device: string,
  apiKey: string
): Promise<ScrapeResult> {
  const url = device === "mobile" ? "https://google.serper.dev/search" : "https://google.serper.dev/search";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      q: keyword,
      gl: country.toLowerCase(),
      num: 100
    })
  });

  if (!res.ok) {
    throw new Error(`Serper API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as any;
  const organic = data.organic || [];
  const items: SerpSearchResultItem[] = organic.map((item: any, idx: number) => ({
    position: item.position || idx + 1,
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet || ""
  }));

  const rank = findDomainPosition(domain, items);
  return {
    keyword,
    domain,
    position: rank.position,
    url: rank.url,
    results: items.slice(0, 10),
    scraper: "serper",
    rawJson: data
  };
}

async function scrapeValueSerp(
  keyword: string,
  domain: string,
  country: string,
  device: string,
  apiKey: string
): Promise<ScrapeResult> {
  const params = new URLSearchParams({
    api_key: apiKey,
    q: keyword,
    location: country,
    device: device === "mobile" ? "mobile" : "desktop",
    num: "100"
  });

  const res = await fetch(`https://api.valueserp.com/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`ValueSerp API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as any;
  const organic = data.organic_results || [];
  const items: SerpSearchResultItem[] = organic.map((item: any, idx: number) => ({
    position: item.position || idx + 1,
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet || ""
  }));

  const rank = findDomainPosition(domain, items);
  return {
    keyword,
    domain,
    position: rank.position,
    url: rank.url,
    results: items.slice(0, 10),
    scraper: "valueserp",
    rawJson: data
  };
}

async function scrapeSerpApi(
  keyword: string,
  domain: string,
  country: string,
  device: string,
  apiKey: string
): Promise<ScrapeResult> {
  const params = new URLSearchParams({
    api_key: apiKey,
    q: keyword,
    gl: country.toLowerCase(),
    device: device === "mobile" ? "mobile" : "desktop",
    num: "100"
  });

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`SerpApi error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as any;
  const organic = data.organic_results || [];
  const items: SerpSearchResultItem[] = organic.map((item: any, idx: number) => ({
    position: item.position || idx + 1,
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet || ""
  }));

  const rank = findDomainPosition(domain, items);
  return {
    keyword,
    domain,
    position: rank.position,
    url: rank.url,
    results: items.slice(0, 10),
    scraper: "serpapi",
    rawJson: data
  };
}

function mockSerpScrape(keyword: string, domain: string): ScrapeResult {
  // Deterministic mock based on hash for testing
  const mockPosition = (Math.abs(keyword.length * 7 + domain.length * 3) % 20) + 1;
  const items: SerpSearchResultItem[] = [
    {
      position: 1,
      title: "Google Search Result",
      url: "https://wikipedia.org/wiki/Search",
      snippet: "Comprehensive information on search."
    },
    {
      position: mockPosition,
      title: `${domain} - Official Homepage`,
      url: `https://${domain}/page/${keyword.replace(/\s+/g, "-")}`,
      snippet: `Find the best resources for ${keyword} on our official site.`
    }
  ];

  const rank = findDomainPosition(domain, items);
  return {
    keyword,
    domain,
    position: rank.position,
    url: rank.url,
    results: items,
    scraper: "mock",
    rawJson: { mock: true, items }
  };
}
