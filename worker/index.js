import PocketBase from 'pocketbase';
import { scrape } from './scraper.js';
import { SyncEngine } from './sync-engine.js';
import dotenv from 'dotenv';

// Load env (optional — works without it too)
try { dotenv.config({ path: '../.env' }); } catch {}

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@iptv.local';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'changeme';
const SYNC_CONCURRENCY = parseInt(process.env.SYNC_CONCURRENCY || '3', 10);

// Connect to PocketBase as admin
const pb = new PocketBase(PB_URL);
await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
// Disable auto-cancellation so concurrent batch requests don't kill each other.
pb.autoCancellation(false);
console.log(`[worker] Connected to PocketBase at ${PB_URL}`);

// Ensure default admin user exists (for manual user creation in PB UI)
try {
  const adminList = await pb.admins.getFullList();
  if (adminList.length === 0) {
    console.log('[worker] No admin found. Please set up via PocketBase admin UI at /_/');
  }
} catch {}

// Initialize sync engine
const syncEngine = new SyncEngine(pb, { concurrency: SYNC_CONCURRENCY });

// HTTP server for API endpoints (scrape trigger, sync trigger)
import http from 'http';

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/scrape') {
    await handleScrape(req, res);
  } else if (req.method === 'POST' && url.pathname === '/api/sync') {
    await handleSync(req, res);
  } else if (req.method === 'POST' && url.pathname.startsWith('/api/sync/')) {
    await handleSyncCancel(req, res, url);
  } else if (req.method === 'GET' && url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      queue_size: syncEngine.queueSize,
      active_workers: syncEngine.activeWorkers,
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function handleScrape(req, res) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  await new Promise((resolve) => req.on('end', resolve));

  let url;
  try {
    const data = JSON.parse(body);
    url = data.url;
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Invalid JSON. Expected: {"url": "https://..."}');
  }

  if (!url || typeof url !== 'string') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Missing "url" field');
  }

  try {
    console.log(`[worker] Scraping: ${url}`);
    const result = await scrape(pb, url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error(`[worker] Scrape error:`, err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(err.message);
  }
}

async function handleSync(req, res) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  await new Promise((resolve) => req.on('end', resolve));

  let sourceId;
  try {
    const data = JSON.parse(body);
    sourceId = data.source_id;
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Invalid JSON. Expected: {"source_id": "..."}');
  }

  if (!sourceId) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Missing "source_id" field');
  }

  try {
    syncEngine.enqueue(sourceId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ queued: true, source_id: sourceId }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(err.message);
  }
}

async function handleSyncCancel(req, res, url) {
  // Extract source_id from /api/sync/:sourceId/cancel
  const parts = url.pathname.split('/').filter(Boolean);
  // parts = ['api', 'sync', ':sourceId', 'cancel']
  const sourceId = parts[2];

  if (!sourceId) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Missing source_id');
  }

  try {
    await syncEngine.cancel(sourceId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cancelled: true, source_id: sourceId }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(err.message);
  }
}

const PORT = process.env.WORKER_PORT || 3100;
server.listen(PORT, () => {
  console.log(`[worker] HTTP API listening on :${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[worker] Shutting down...');
  server.close();
  syncEngine.shutdown();
  process.exit(0);
});

console.log('[worker] IPTV DB Worker started. Ready.');
