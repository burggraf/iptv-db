import PocketBase from 'pocketbase';
import { scrape } from './scraper.js';
import { SyncEngine } from './sync-engine.js';
import { loadChannelsOnDemand } from './sync-job.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env (optional — works without it too)
try { dotenv.config({ path: '../.env' }); } catch {}

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@iptv.local';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'changeme';
const SYNC_CONCURRENCY = parseInt(process.env.SYNC_CONCURRENCY || '1', 10);

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

// Clean up orphaned jobs from previous worker run
try {
  const orphaned = await pb.collection('sync_jobs').getFullList({
    filter: 'status="running" || status="queued"',
  });
  if (orphaned.length > 0) {
    console.log(`[worker] Cleaning up ${orphaned.length} orphaned job(s) from previous run`);
    await Promise.all(orphaned.map(j =>
      pb.collection('sync_jobs').update(j.id, {
        status: 'failed',
        error: 'Worker restarted — job orphaned',
        phase: 'Orphaned by restart',
      })
    ));
  }
} catch (err) {
  console.warn('[worker] Failed to clean up orphaned jobs:', err.message);
}

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
  } else if (req.method === 'POST' && url.pathname === '/api/m3u/generate') {
    await handleM3uGenerate(req, res);
  } else if (req.method === 'POST' && url.pathname === '/api/m3u/delete') {
    await handleM3uDelete(req, res);
  } else if (req.method === 'POST' && url.pathname === '/api/sync') {
    await handleSync(req, res);
  } else if (req.method === 'POST' && url.pathname.startsWith('/api/sync/')) {
    await handleSyncCancel(req, res, url);
  } else if (req.method === 'POST' && url.pathname === '/api/sync-all') {
    await handleSyncAll(req, res);
  } else if (req.method === 'POST' && url.pathname === '/api/cancel-all') {
    await handleCancelAll(req, res);
  } else if (req.method === 'POST' && url.pathname === '/api/load-channels') {
    await handleLoadChannels(req, res);
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

async function handleM3uGenerate(req, res) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  await new Promise((resolve) => req.on('end', resolve));
  let slug;
  try { slug = JSON.parse(body).slug; } catch {
    res.writeHead(400); return res.end('Missing slug');
  }
  if (!slug) { res.writeHead(400); return res.end('Missing slug'); }

  try {
    const playlist = await pb.collection('m3u_playlists').getFirstListItem(`slug="${slug}"`);
    const source = await pb.collection('sources').getOne(playlist.source_id);
    const baseUrl = (source.base_url || '').replace(/\/+$/, '');
    const username = source.username || '';
    const password = source.password || '';

    let m3u = '#EXTM3U\n';
    const CONC = 5;

    if (playlist.include_live) {
      const cats = await pb.collection('categories').getFullList({
        filter: `source_id="${playlist.source_id}" && type="live"`, sort: 'name'
      });
      const catMap = {};
      cats.forEach(c => { catMap[c.id] = c.name; });

      // Fetch channels in batches
      let page = 1;
      let totalChannels = 0;
      while (true) {
        const batch = await pb.collection('channels').getList(page, 500, {
          filter: `source_id="${playlist.source_id}" && available=true`, sort: 'name'
        });
        for (const ch of batch.items) {
          let line = '#EXTINF:-1';
          if (ch.tvg_id) line += ` tvg-id="${ch.tvg_id}"`;
          if (ch.logo) line += ` tvg-logo="${ch.logo}"`;
          if (ch.tvg_country) line += ` tvg-country="${ch.tvg_country}"`;
          const grp = catMap[ch.category_id] || '';
          if (grp) line += ` group-title="${grp}"`;
          line += `,${ch.name}\n`;
          line += `${baseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${ch.stream_id}.m3u8\n`;
          m3u += line;
        }
        totalChannels += batch.items.length;
        if (page >= batch.totalPages) break;
        page++;
      }
      console.log(`[m3u] ${totalChannels} live channels for ${slug}`);
    }

    if (playlist.include_vod) {
      const cats = await pb.collection('categories').getFullList({
        filter: `source_id="${playlist.source_id}" && type="vod"`, sort: 'name'
      });
      const catMap = {};
      cats.forEach(c => { catMap[c.id] = c.name; });

      let page = 1;
      let totalMovies = 0;
      while (true) {
        const batch = await pb.collection('movies').getList(page, 500, {
          filter: `source_id="${playlist.source_id}" && available=true`, sort: 'name'
        });
        for (const mv of batch.items) {
          let line = '#EXTINF:-1';
          if (mv.poster) line += ` tvg-logo="${mv.poster}"`;
          const grp = catMap[mv.category_id] || 'Movies';
          line += ` group-title="${grp}"`;
          line += `,${mv.name}\n`;
          line += `${baseUrl}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${mv.stream_id}.mp4\n`;
          m3u += line;
        }
        totalMovies += batch.items.length;
        if (page >= batch.totalPages) break;
        page++;
      }
      console.log(`[m3u] ${totalMovies} movies for ${slug}`);
    }

    // Write to pb_public
    const pbDir = path.join(new URL('.', import.meta.url).pathname, '..', 'pb_public');
    if (!fs.existsSync(pbDir)) fs.mkdirSync(pbDir, { recursive: true });
    fs.writeFileSync(path.join(pbDir, `${slug}.m3u`), m3u, 'utf8');
    console.log(`[m3u] Written /${slug}.m3u`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'ok', url: `/${slug}.m3u` }));
  } catch (err) {
    console.error(`[m3u] Error:`, err.message);
    res.writeHead(500); res.end(err.message);
  }
}

async function handleM3uDelete(req, res) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  await new Promise((resolve) => req.on('end', resolve));
  let slug;
  try { slug = JSON.parse(body).slug; } catch {
    res.writeHead(400); return res.end('Missing slug');
  }
  if (!slug) { res.writeHead(400); return res.end('Missing slug'); }
  try {
    const filePath = path.join(new URL('.', import.meta.url).pathname, '..', 'pb_public', `${slug}.m3u`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.writeHead(200); res.end('ok');
  } catch (err) {
    res.writeHead(500); res.end(err.message);
  }
}

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

async function handleCancelAll(req, res) {
  try {
    await syncEngine.cancelAll();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cancelled: true }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(err.message);
  }
}

async function handleSyncAll(req, res) {
  try {
    const count = await syncEngine.enqueueByFilter('status!="error"');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ enqueued: count }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(err.message);
  }
}

async function handleLoadChannels(req, res) {
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
    const progressUpdates = [];
    const onProgress = (phase, percent) => {
      progressUpdates.push({ phase, percent });
    };

    const channelCount = await loadChannelsOnDemand(pb, sourceId, onProgress);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      source_id: sourceId,
      channel_count: channelCount,
      progress: progressUpdates
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
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
