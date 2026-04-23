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

  await pb.collection('sources').update(sourceId, {
    max_connections: userInfo.maxConnections,
    expiry_date: userInfo.expiry,
    status: userInfo.status === 'Active' ? 'active' : 'expired',
  });

  if (userInfo.status !== 'Active') {
    throw new Error(`Account status: ${userInfo.status}`);
  }

  // --- Categories (needed for channel grouping) ---
  onProgress('Fetching categories...', 10);
  const catMap = {};

  checkCancelled(isCancelled);
  await syncCategories(pb, sourceId, 'live', xtream, catMap, onProgress, isCancelled);
  checkCancelled(isCancelled);
  await syncCategories(pb, sourceId, 'vod', xtream, catMap, onProgress, isCancelled);
  checkCancelled(isCancelled);
  await syncCategories(pb, sourceId, 'series', xtream, catMap, onProgress, isCancelled);

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
 */
async function ensureCategory(pb, sourceId, type, categoryId, catMap) {
  const key = `${type}_${categoryId}`;
  if (catMap[key]) return catMap[key];

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
 * Sync live channels with batched upserts.
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

  checkCancelled(isCancelled);
  const existing = await pb.collection('channels').getFullList({
    filter: `source_id="${sourceId}"`,
  });
  const existingMap = new Map();
  for (const ch of existing) {
    existingMap.set(ch.stream_id, ch);
  }

  const streamIds = new Set();
  let count = 0;
  const total = streams.length;

  const batchSize = 100;
  const batch = [];

  for (const stream of streams) {
    const streamId = stream.stream_id || stream.stream_num;
    if (!streamId) continue;

    const categoryId = stream.category_id;
    const catKey = `live_${categoryId}`;
    const pbCategoryId = catMap[catKey] || await ensureCategory(pb, sourceId, 'live', categoryId, catMap);
    if (!pbCategoryId) continue;

    streamIds.add(streamId);

    const data = {
      source_id: sourceId,
      category_id: pbCategoryId,
      stream_id: streamId,
      name: stream.name || 'Unknown',
      logo: stream.stream_icon || stream.logo || '',
      epg_id: stream.epg_channel_id || '',
      tvg_id: stream.tv_archive_duration !== undefined ? String(stream.tv_archive_duration) : '',
      tvg_country: stream.country || '',
      added: stream.added || '',
      available: true,
    };

    batch.push(data);

    if (batch.length >= batchSize) {
      await flushChannelBatch(pb, existingMap, batch, streamIds);
      count += batch.length;
      batch.length = 0;
      checkCancelled(isCancelled);
      onProgress(`Syncing channels ${count}/${total}...`, 15 + Math.floor((count / total) * 30));
    }
  }

  if (batch.length > 0) {
    await flushChannelBatch(pb, existingMap, batch, streamIds);
    count += batch.length;
  }

  // Mark channels no longer in the source as unavailable
  for (const ch of existing) {
    if (!streamIds.has(ch.stream_id) && ch.available) {
      try {
        await pb.collection('channels').update(ch.id, { available: false });
      } catch { /* skip */ }
    }
  }

  console.log(`[sync-job] Live channels: ${count} synced`);
  return count;
}

/**
 * Flush a batch of channel upserts.
 */
async function flushChannelBatch(pb, existingMap, batch, streamIds) {
  const promises = batch.map(async (data) => {
    const existing = existingMap.get(data.stream_id);
    try {
      if (existing) {
        streamIds.add(data.stream_id);
        await pb.collection('channels').update(existing.id, { ...data, available: true });
      } else {
        await pb.collection('channels').create(data);
        streamIds.add(data.stream_id);
      }
    } catch (err) {
      console.warn(`[sync-job] Channel upsert failed: stream_id=${data.stream_id} ${err.message}`);
    }
  });
  await Promise.allSettled(promises);
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
