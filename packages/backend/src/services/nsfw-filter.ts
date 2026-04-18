import blocklist from "../data/nsfw-blocklist.json";

// Normalize and build lookup sets
const domainSet = new Set(blocklist.domains.map((d) => d.toLowerCase()));
const keywords = blocklist.keywords.map((k) => k.toLowerCase());
const blockedAppIds = new Set(blocklist.app_ids.map((a) => a.toLowerCase()));

/**
 * Extract domain from a string that might contain a URL or domain reference.
 * Strips www., m., and other common prefixes to match eTLD+1 level.
 */
function extractDomains(text: string): string[] {
  const domains: string[] = [];
  // Match anything that looks like a domain
  const matches = text.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+)/gi
  );
  if (matches) {
    for (const m of matches) {
      const cleaned = m
        .replace(/^https?:\/\//i, "")
        .replace(/^(?:www\.|m\.)/i, "")
        .toLowerCase()
        .split("/")[0];
      domains.push(cleaned);
    }
  }
  return domains;
}

export function isNSFW(appId: string, windowTitle: string): boolean {
  if (!appId && !windowTitle) return false;
  const lowerAppId = (appId || "").toLowerCase();
  const lowerTitle = (windowTitle || "").toLowerCase();

  // Check blocked app IDs
  if (blockedAppIds.has(lowerAppId)) return true;

  // Check domains in window title
  const domains = extractDomains(lowerTitle);
  for (const domain of domains) {
    if (domainSet.has(domain)) return true;
    // Check if any blocklist domain is a suffix (handles subdomains)
    for (const blocked of domainSet) {
      if (domain === blocked || domain.endsWith("." + blocked)) return true;
    }
  }

  // Check keywords in window title (simple substring, case-insensitive)
  for (const keyword of keywords) {
    if (lowerTitle.includes(keyword)) return true;
  }

  return false;
}
