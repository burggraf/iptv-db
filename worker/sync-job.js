import { XtreamClient } from './xtream.js';

/**
 * Thrown when a sync operation is cancelled by the user.
 */
export class CancelledError extends Error {
  constructor(message = 'Sync cancelled by user') {
    super(message);
    this.name = 'CancelledError';
    this.code = 'CANCELLED';
  }
}

/**
 * Check if the sync has been cancelled and throw if so.
 */
function checkCancelled(isCancelled) {
  if (isCancelled && isCancelled()) {
    throw new CancelledError();
  }
}

/**
 * Sync a single source: authenticate, fetch categories, channels, and
 * store counts for movies/series (no per-item cataloging).
 * Calls onProgress(phase, percent) to report status.
 * Accepts an optional isCancelled() callback for cooperative cancellation.
 */
export async function syncSource(pb, sourceId, onProgress, isCancelled) {

  const source = await pb.collection('sources').getOne(sourceId);

  if (!source.base_url || !source.username || !source.password) {
    throw new Error('Source missing base_url, username, or password');
  }

  const xtream = new XtreamClient(source.base_url, source.username, source.password);

  onProgress('Authenticating...', 5);
  let userInfo;
  try {
    userInfo = await xtream.getUserInfo();
  } catch (err) {
    throw new Error(`Authentication failed: ${err.message}`);
  }

  const sourceUpdates = {
    max_connections: userInfo.maxConnections,
    expiry_date: userInfo.expiry,
    status: userInfo.status === 'Active' ? 'active' : 'expired',
  };
  if (userInfo.serverUrl && userInfo.serverUrl !== source.base_url) {
    console.log(`[sync-job] Correcting base_url from ${source.base_url} to ${userInfo.serverUrl}`);
    sourceUpdates.base_url = userInfo.serverUrl;
  }
  await pb.collection('sources').update(sourceId, sourceUpdates);

  if (userInfo.status !== 'Active') {
    throw new Error(`Account status: ${userInfo.status}`);
  }

  // --- Categories (needed for channel grouping) ---
  onProgress('Fetching categories...', 10);
  const catMap = {};

  // Parallelize — live/vod/series category fetches are independent
  await Promise.all([
    syncCategories(pb, sourceId, 'live', xtream, catMap, onProgress, isCancelled),
    syncCategories(pb, sourceId, 'vod', xtream, catMap, onProgress, isCancelled),
    syncCategories(pb, sourceId, 'series', xtream, catMap, onProgress, isCancelled),
  ]);

  // --- Live channels (fully synced) ---
  onProgress('Fetching live channels...', 15);
  checkCancelled(isCancelled);
  const channelCount = await syncLiveChannels(pb, sourceId, xtream, catMap, onProgress, isCancelled);

  // --- Movie & series counts only (no per-item cataloging) ---
  // Fetch both in parallel with a short timeout so one slow server doesn't block the sync.
  onProgress('Fetching movie and series counts...', 55);
  checkCancelled(isCancelled);
  const [movieResult, seriesResult] = await Promise.allSettled([
    timedCount(xtream.getVodStreams.bind(xtream), 15_000, 'VOD'),
    timedCount(xtream.getSeries.bind(xtream), 15_000, 'series'),
  ]);

  const movieCount = movieResult.status === 'fulfilled' ? movieResult.value : 0;
  const seriesCount = seriesResult.status === 'fulfilled' ? seriesResult.value : 0;

  // Store counts on the source record
  await pb.collection('sources').update(sourceId, {
    channel_count: channelCount,
    movie_count: movieCount,
    series_count: seriesCount,
  });

  onProgress('Sync complete', 100);
  console.log(`[sync-job] Source ${sourceId} (${source.name}): ${channelCount} channels, ${movieCount} movies, ${seriesCount} series`);
}

/**
 * Sync categories for a given type (live, vod, series).
 */
async function syncCategories(pb, sourceId, type, xtream, catMap, onProgress, isCancelled) {
  checkCancelled(isCancelled);
  let categories;
  try {
    categories = type === 'live'
      ? await xtream.getLiveCategories()
      : type === 'vod'
        ? await xtream.getVodCategories()
        : await xtream.getSeriesCategories();
  } catch (err) {
    console.warn(`[sync-job] Failed to fetch ${type} categories:`, err.message);
    return;
  }

  const existing = await pb.collection('categories').getFullList({
    filter: `source_id="${sourceId}" && type="${type}"`,
  });
  const existingMap = new Map();
  for (const cat of existing) {
    existingMap.set(`${type}_${cat.category_id}`, cat);
  }

  for (const cat of categories) {
    const catId = cat.category_id;
    const name = cat.category_name || cat.name || `Category ${catId}`;
    const key = `${type}_${catId}`;

    try {
      if (existingMap.has(key)) {
        const existingCat = existingMap.get(key);
        catMap[key] = existingCat.id;
      } else {
        const record = await pb.collection('categories').create({
          source_id: sourceId,
          type,
          category_id: catId,
          name,
        });
        catMap[key] = record.id;
      }
    } catch (err) {
      console.warn(`[sync-job] Failed to upsert ${type} category "${name}":`, err.message);
    }
  }

  // Delete categories no longer returned by the API.
  // Skip deletion to avoid removing fallback categories created by syncChannels
  // for orphan channels with unknown category IDs. Categories are cheap.
}

/**
 * Ensure a category exists in catMap, creating it on-the-fly if needed.
 * Used for channels that reference a category_id not in the API category list.
 * Checks the DB before creating to handle re-syncs where the category already exists.
 * Uses a pending-cache to avoid duplicate lookups/creates from concurrent channels.
 */
const _pendingCategoryPromises = new Map();

async function ensureCategory(pb, sourceId, type, categoryId, catMap) {
  const key = `${type}_${categoryId}`;
  if (catMap[key]) return catMap[key];

  // Deduplicate concurrent lookups for the same key.
  if (_pendingCategoryPromises.has(key)) {
    return _pendingCategoryPromises.get(key);
  }

  const promise = _resolveCategory(pb, sourceId, type, categoryId, catMap, key);
  _pendingCategoryPromises.set(key, promise);
  try {
    return await promise;
  } finally {
    _pendingCategoryPromises.delete(key);
  }
}

async function _resolveCategory(pb, sourceId, type, categoryId, catMap, key) {
  // Check if it already exists in the DB (from a previous sync).
  try {
    const existing = await pb.collection('categories').getList(1, 1, {
      filter: `source_id="${sourceId}" && type="${type}" && category_id=${categoryId}`,
    });
    if (existing.items.length > 0) {
      catMap[key] = existing.items[0].id;
      return existing.items[0].id;
    }
  } catch {
    // DB lookup failed — try to create below.
  }

  try {
    const record = await pb.collection('categories').create({
      source_id: sourceId,
      type,
      category_id: categoryId,
      name: `Category ${categoryId}`,
    });
    catMap[key] = record.id;
    return record.id;
  } catch (err) {
    console.warn(`[sync-job] Failed to create fallback category ${key}:`, err.message);
    return null;
  }
}

/**
 * Sync live channels using bulk endpoint.
 * Accumulates all channels, then sends ONE bulk call (server-side handles upsert + cleanup).
 */
async function syncLiveChannels(pb, sourceId, xtream, catMap, onProgress, isCancelled) {
  checkCancelled(isCancelled);
  let streams;
  try {
    streams = await xtream.getAllLiveStreams();
  } catch (err) {
    console.warn(`[sync-job] Failed to fetch live streams:`, err.message);
    return 0;
  }

  const total = streams.length;
  if (total === 0) {
    console.log(`[sync-job] Live channels: 0 synced`);
    return 0;
  }

  // Build channel payloads
  const channels = [];
  const step = Math.max(1, Math.floor(total / 20)); // report every 5%

  for (let i = 0; i < streams.length; i++) {
    const stream = streams[i];
    const streamId = stream.stream_id || stream.stream_num;
    if (!streamId) continue;

    const categoryId = stream.category_id;
    const catKey = `live_${categoryId}`;
    const pbCategoryId = catMap[catKey] || await ensureCategory(pb, sourceId, 'live', categoryId, catMap);
    if (!pbCategoryId) continue;

    channels.push({
      stream_id: streamId,
      category_id: pbCategoryId,
      name: stream.name || 'Unknown',
      logo: stream.stream_icon || stream.logo || '',
      epg_id: stream.epg_channel_id || '',
      tvg_id: stream.tv_archive_duration !== undefined ? String(stream.tv_archive_duration) : '',
      tvg_country: stream.country || '',
      added: stream.added || '',
    });

    if (i % step === 0) {
      onProgress(`Preparing channels ${i}/${total}...`, 15 + Math.floor((i / total) * 30));
      checkCancelled(isCancelled);
    }
  }

  // Send all channels in one bulk call
  onProgress(`Syncing ${channels.length} channels to database...`, 40);
  await flushChannelBatchBulk(pb, sourceId, channels);

  console.log(`[sync-job] Live channels: ${channels.length} synced (bulk)`);
  return channels.length;
}

/**
 * Flush a batch of channels via PocketBase bulk endpoint.
 * Single HTTP call replaces N individual create/update requests.
 * Server-side transaction handles upsert + cleanup atomically.
 */
async function flushChannelBatchBulk(pb, sourceId, channels) {
  const baseUrl = pb.baseUrl || 'http://localhost:8090';
  const res = await fetch(`${baseUrl}/api/batch-channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id: sourceId, channels }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bulk channel sync failed (${res.status}): ${text}`);
  }
  const result = await res.json();
  console.log(`[sync-job] Bulk upsert: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted`);
}

/**
 * Fetch a stream list with a hard timeout, returning just the count.
 * Used for movie/series counts — non-critical, so failures are silent.
 */
async function timedCount(fetchFn, timeoutMs, label) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} count fetch timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );
  const result = await Promise.race([fetchFn(), timer]);
  const count = Array.isArray(result) ? result.length : 0;
  console.log(`[sync-job] ${label} count: ${count}`);
  return count;
}
