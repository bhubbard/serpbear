import { SerpSearchResultItem } from "../types";

export function cleanDomain(domainStr: string): string {
  return domainStr
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function extractDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return cleanDomain(parsed.hostname);
  } catch {
    return cleanDomain(url);
  }
}

export function findDomainPosition(
  targetDomain: string,
  items: SerpSearchResultItem[],
  matchSubdomains = true
): { position: number; url: string } {
  const targetClean = cleanDomain(targetDomain);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemDomain = item.domain ? cleanDomain(item.domain) : extractDomainFromUrl(item.url);

    let isMatch = false;
    if (itemDomain === targetClean) {
      isMatch = true;
    } else if (matchSubdomains && itemDomain.endsWith(`.${targetClean}`)) {
      isMatch = true;
    }

    if (isMatch) {
      return {
        position: item.position || i + 1,
        url: item.url
      };
    }
  }

  return { position: 0, url: "" }; // Not found in scanned results
}

export function updatePositionHistory(
  existingHistoryJson: string,
  newPosition: number,
  todayStr?: string
): string {
  const today = todayStr || new Date().toISOString().split("T")[0];
  let history: Array<{ date: string; position: number }> = [];

  try {
    history = JSON.parse(existingHistoryJson || "[]");
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }

  // If entry for today already exists, update it; otherwise append
  const todayEntry = history.find((h) => h.date === today);
  if (todayEntry) {
    todayEntry.position = newPosition;
  } else {
    history.push({ date: today, position: newPosition });
  }

  // Keep up to 365 days of history
  if (history.length > 365) {
    history = history.slice(history.length - 365);
  }

  return JSON.stringify(history);
}
