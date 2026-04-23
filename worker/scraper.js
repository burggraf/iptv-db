import * as cheerio from 'cheerio';
import { randomBytes } from 'crypto';

/**
 * Scrape a blog page for Xtream accounts and M3U links.
 * Returns created/updated source IDs.
 */
export async function scrape(pb, url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const sources = [];

  // Strategy 1: Look for Xtream account tables (Server/User/Pass columns)
  sources.push(...extractXtreamTables($, url));

  // Strategy 2: Look for M3U links (get.php?username=...&password=...)
  sources.push(...extractM3uLinks($, url));

  if (sources.length === 0) {
    throw new Error('No Xtream accounts or M3U links found on page');
  }

  console.log(`[scraper] Found ${sources.length} sources on ${url}`);

  // Upsert sources into PocketBase
  const sourceIds = [];
  const added = [];
  const updated = [];

  for (const source of sources) {
    // Check for existing source with same identifier
    const existing = await findExistingSource(pb, source);

    if (existing) {
      // Update existing
      await pb.collection('sources').update(existing.id, {
        status: 'pending',
        source_url: url,
        scraped_at: new Date().toISOString(),
      });
      sourceIds.push(existing.id);
      updated.push(source.name);
    } else {
      // Create new
      const record = await pb.collection('sources').create({
        ...source,
        status: 'pending',
        source_url: url,
        scraped_at: new Date().toISOString(),
      });
      sourceIds.push(record.id);
      added.push(source.name);
    }
  }

  console.log(`[scraper] Added: ${added.length}, Updated: ${updated.length}`);
  return { added: added.length, updated: updated.length, sourceIds };
}

/**
 * Extract Xtream accounts from HTML tables.
 * Looks for tables with Server/User/Pass headers.
 */
function extractXtreamTables($) {
  const sources = [];

  $('table').each((_, table) => {
    const headers = [];
    $(table).find('thead th, tr:first-child th, tr:first-child td').each((_, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    // Check if this is a Server/User/Pass table
    const hasServer = headers.some((h) => h.includes('server') || h.includes('host'));
    const hasUser = headers.some((h) => h.includes('user') || h.includes('username') || h.includes('login'));
    const hasPass = headers.some((h) => h.includes('pass'));

    if (!hasServer || !hasUser || !hasPass) return;

    const serverIdx = headers.findIndex((h) => h.includes('server') || h.includes('host'));
    const userIdx = headers.findIndex((h) => h.includes('user') || h.includes('username') || h.includes('login'));
    const passIdx = headers.findIndex((h) => h.includes('pass'));

    $(table).find('tbody tr, tr').each((i, tr) => {
      if (i === 0) return; // Skip header row

      const cells = $(tr).find('td, th');
      if (cells.length < 3) return;

      const server = $(cells[serverIdx]).text().trim().replace(/\s/g, '');
      const username = $(cells[userIdx]).text().trim();
      const password = $(cells[passIdx]).text().trim();

      if (!server || !username || !password) return;
      // Skip email addresses that might appear in some tables
      if (username.includes('@') && !username.includes(' ') && username.length > 20) {
        // Still might be valid, keep it
      }

      // Normalize server URL
      let baseUrl = server;
      if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = 'http://' + baseUrl;
      }
      // Remove trailing slash
      baseUrl = baseUrl.replace(/\/+$/, '');

      const domain = baseUrl.replace(/^https?:\/\//, '').replace(/:\d+.*$/, '');

      sources.push({
        type: 'xtream',
        name: `${domain}/${username}`,
        base_url: baseUrl,
        username,
        password,
      });
    });
  });

  return sources;
}

/**
 * Extract M3U playlist links from anchor tags.
 * Looks for links containing get.php?username=...&password=...
 */
function extractM3uLinks($) {
  const sources = [];
  const seen = new Set();

  $('a[href*="get.php"]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href || seen.has(href)) return;
    seen.add(href);

    // Parse the URL to extract credentials
    try {
      const fullUrl = href.startsWith('http') ? href : `http://${href}`;
      const url = new URL(fullUrl);

      const username = url.searchParams.get('username');
      const password = url.searchParams.get('password');

      if (!username || !password) return;

      // Build base URL (without the get.php path)
      const baseUrl = `${url.protocol}//${url.host}`;

      const domain = url.hostname;

      sources.push({
        type: 'm3u',
        name: `${domain}/${username}`,
        base_url: baseUrl,
        username,
        password,
        m3u_url: href,
      });
    } catch {
      // Skip invalid URLs
    }
  });

  return sources;
}

/**
 * Find an existing source by matching base_url + username.
 */
async function findExistingSource(pb, source) {
  const filter = `base_url="${escapeFilter(source.base_url)}" && username="${escapeFilter(source.username)}"`;
  const results = await pb.collection('sources').getList(1, 1, { filter });
  return results.items[0] || null;
}

/**
 * Escape a value for PocketBase filter queries.
 */
function escapeFilter(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
