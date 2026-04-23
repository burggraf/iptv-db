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
 * Sync a single source: authenticate, fetch categories, streams, episodes.
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

  onProgress('Fetching categories...', 10);
  const catMap = {}; // key: "type_categoryId" -> pb_id

  checkCancelled(isCancelled);
  await syncCategories(pb, sourceId, 'live', xtream, catMap, onProgress, isCancelled);
  checkCancelled(isCancelled);
  await syncCategories(pb, sourceId, 'vod', xtream, catMap, onProgress, isCancelled);
  checkCancelled(isCancelled);
  await syncCategories(pb, sourceId, 'series', xtream, catMap, onProgress, isCancelled);

  onProgress('Fetching live channels...', 15);
  checkCancelled(isCancelled);
  await syncLiveChannels(pb, sourceId, xtream, catMap, onProgress, isCancelled);

  onProgress('Fetching movies...', 45);
  checkCancelled(isCancelled);
  await syncMovies(pb, sourceId, xtream, catMap, onProgress, isCancelled);

  onProgress('Fetching series...', 75);
  checkCancelled(isCancelled);
  await syncSeries(pb, sourceId, xtream, catMap, onProgress, isCancelled);

  onProgress('Sync complete', 100);
  console.log(`[sync-job] Source ${sourceId} (${source.name}) synced successfully`);
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

  const createdIds = new Set();

  for (const cat of categories) {
    const catId = cat.category_id;
    const name = cat.category_name || cat.name || `Category ${catId}`;
    const key = `${type}_${catId}`;

    try {
      if (existingMap.has(key)) {
        const existingCat = existingMap.get(key);
        catMap[key] = existingCat.id;
        createdIds.add(existingCat.id);
      } else {
        const record = await pb.collection('categories').create({
          source_id: sourceId,
          type,
          category_id: catId,
          name,
        });
        catMap[key] = record.id;
        createdIds.add(record.id);
      }
    } catch (err) {
      console.warn(`[sync-job] Failed to upsert ${type} category "${name}":`, err.message);
    }
  }

  // Clean up categories no longer present on the source
  for (const existingCat of existing) {
    if (!createdIds.has(existingCat.id)) {
      try {
        await pb.collection('categories').delete(existingCat.id);
      } catch { /* skip */ }
    }
  }
}

/**
 * Sync live channels.
 */
async function syncChannels(pb, sourceId, xtream, catMap, onProgress, isCancelled) {
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

  // Batch upsert
  const batchSize = 100;
  const batch = [];

  for (const stream of streams) {
    const streamId = stream.stream_id || stream.stream_num;
    if (!streamId) continue;

    const categoryId = stream.category_id;
    const catKey = `live_${categoryId}`;
    const pbCategoryId = catMap[catKey];
    if (!pbCategoryId) continue; // category not found, skip

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

  // Flush remaining
  if (batch.length > 0) {
    await flushChannelBatch(pb, existingMap, batch, streamIds);
    count += batch.length;
  }

  // Mark channels no longer on source as unavailable
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
  const promises = batch.map((data) => {
    const existing = existingMap.get(data.stream_id);
    if (existing) {
      streamIds.add(data.stream_id); // make sure it's tracked
      return pb.collection('channels').update(existing.id, { ...data, available: true });
    } else {
      return pb.collection('channels').create(data);
    }
  });
  await Promise.allSettled(promises);
}

/**
 * Sync live channels (properly named).
 */
async function syncLiveChannels(pb, sourceId, xtream, catMap, onProgress, isCancelled) {
  return syncChannels(pb, sourceId, xtream, catMap, onProgress, isCancelled);
}

/**
 * Sync movies (VOD).
 */
async function syncMovies(pb, sourceId, xtream, catMap, onProgress, isCancelled) {
  checkCancelled(isCancelled);
  let streams;
  try {
    // Get all VOD streams from the Xtream source
    streams = await xtream.getVodStreams();
  } catch (err) {
    console.warn(`[sync-job] Failed to fetch VOD streams:`, err.message);
    return 0;
  }

  checkCancelled(isCancelled);
  const existing = await pb.collection('movies').getFullList({
    filter: `source_id="${sourceId}"`,
  });
  const existingMap = new Map();
  for (const m of existing) {
    existingMap.set(m.stream_id, m);
  }

  const streamIds = new Set();
  let count = 0;
  const total = streams.length;
  const batchSize = 100;
  const batch = [];

  for (const stream of streams) {
    const streamId = stream.stream_id;
    if (!streamId) continue;

    const categoryId = stream.category_id;
    const catKey = `vod_${categoryId}`;
    const pbCategoryId = catMap[catKey];
    if (!pbCategoryId) continue;

    streamIds.add(streamId);

    // Parse rating
    let rating = null;
    if (stream.rating) {
      rating = parseFloat(String(stream.rating).replace(/[^0-9.]/g, ''));
      if (isNaN(rating)) rating = null;
    }

    const data = {
      source_id: sourceId,
      category_id: pbCategoryId,
      stream_id: streamId,
      name: stream.name || 'Unknown',
      plot: stream.plot || '',
      year: stream.year || '',
      genre: stream.genre || '',
      rating,
      poster: stream.cover || stream.poster || '',
      backdrop: stream.backdrop_path
        ? (Array.isArray(stream.backdrop_path) ? stream.backdrop_path[0] : stream.backdrop_path)
        : '',
      director: stream.director || '',
      cast: stream.cast || '',
      duration_secs: stream.duration ? parseInt(String(stream.duration), 10) : null,
      release_date: stream.releasedate || stream.release_date || '',
      youtube_trailer: stream.youtube_trailer || '',
      episode_run_time: stream.episode_run_time || '',
      available: true,
    };

    batch.push(data);

    if (batch.length >= batchSize) {
      await flushMovieBatch(pb, existingMap, batch, streamIds);
      count += batch.length;
      batch.length = 0;
      checkCancelled(isCancelled);
      onProgress(`Syncing movies ${count}/${total}...`, 45 + Math.floor((count / total) * 30));
    }
  }

  if (batch.length > 0) {
    await flushMovieBatch(pb, existingMap, batch, streamIds);
    count += batch.length;
  }

  // Mark movies no longer on source as unavailable
  for (const m of existing) {
    if (!streamIds.has(m.stream_id) && m.available) {
      try {
        await pb.collection('movies').update(m.id, { available: false });
      } catch { /* skip */ }
    }
  }

  console.log(`[sync-job] Movies: ${count} synced`);
  return count;
}

async function flushMovieBatch(pb, existingMap, batch, streamIds) {
  const promises = batch.map((data) => {
    const existing = existingMap.get(data.stream_id);
    if (existing) {
      streamIds.add(data.stream_id);
      return pb.collection('movies').update(existing.id, { ...data, available: true });
    } else {
      return pb.collection('movies').create(data);
    }
  });
  await Promise.allSettled(promises);
}

/**
 * Sync series (without episodes — episodes fetched separately).
 */
async function syncSeries(pb, sourceId, xtream, catMap, onProgress, isCancelled) {
  checkCancelled(isCancelled);
  let seriesList;
  try {
    seriesList = await xtream.getSeries();
  } catch (err) {
    console.warn(`[sync-job] Failed to fetch series:`, err.message);
    return 0;
  }

  checkCancelled(isCancelled);
  const existing = await pb.collection('series').getFullList({
    filter: `source_id="${sourceId}"`,
  });
  const existingMap = new Map();
  for (const s of existing) {
    existingMap.set(s.series_id, s);
  }

  const seriesIds = new Set();
  let count = 0;
  const total = seriesList.length;

  for (const series of seriesList) {
    const seriesId = series.series_id;
    if (!seriesId) continue;

    const categoryId = series.category_id;
    const catKey = `series_${categoryId}`;
    const pbCategoryId = catMap[catKey];
    if (!pbCategoryId) continue;

    seriesIds.add(seriesId);

    let rating = null;
    if (series.rating) {
      rating = parseFloat(String(series.rating).replace(/[^0-9.]/g, ''));
      if (isNaN(rating)) rating = null;
    }

    const data = {
      source_id: sourceId,
      category_id: pbCategoryId,
      series_id: seriesId,
      name: series.name || 'Unknown',
      plot: series.plot || series.overview || '',
      year: series.year || '',
      genre: series.genre || '',
      rating,
      poster: series.cover || series.poster || '',
      backdrop: series.backdrop_path
        ? (Array.isArray(series.backdrop_path) ? series.backdrop_path[0] : series.backdrop_path)
        : '',
      cast: series.cast || '',
      director: series.director || '',
      available: true,
    };

    try {
      if (existingMap.has(seriesId)) {
        const existingSeries = existingMap.get(seriesId);
        seriesIds.add(seriesId);
        await pb.collection('series').update(existingSeries.id, { ...data, available: true });
      } else {
        const record = await pb.collection('series').create(data);
        seriesIds.add(seriesId);
        // Add to map so we can find it for episode sync
        existingMap.set(seriesId, record);
      }
    } catch (err) {
      console.warn(`[sync-job] Failed to upsert series "${series.name}":`, err.message);
    }

    count++;
    onProgress(`Syncing series ${count}/${total}...`, 75 + Math.floor((count / total) * 20));
  }

  // Episodes
  onProgress('Fetching episodes...', 95);
  let epCount = 0;
  const seriesArray = Array.from(seriesIds);

  // Fetch episodes in small batches to avoid overwhelming the API
  for (let i = 0; i < seriesArray.length; i += 5) {
    checkCancelled(isCancelled);
    const batch = seriesArray.slice(i, i + 5);
    await Promise.allSettled(batch.map(async (seriesId) => {
      try {
        const pbSeries = await findSeriesByExternalId(pb, sourceId, seriesId);
        if (!pbSeries) return;

        const seriesInfo = await xtream.getSeriesInfo(seriesId);
        if (!seriesInfo || !seriesInfo.episodes) return;

        for (const [seasonKey, episodes] of Object.entries(seriesInfo.episodes)) {
          const season = parseInt(seasonKey, 10);
          for (const ep of episodes) {
            try {
              const existingEps = await pb.collection('series_episodes').getList(1, 1, {
                filter: `series_id="${pbSeries.id}" && season=${season} && episode_num=${ep.episode_num}`,
              });

              const epData = {
                series_id: pbSeries.id,
                season,
                episode_num: ep.episode_num || 0,
                title: ep.title || '',
                plot: ep.plot || ep.overview || '',
                duration_secs: ep.duration ? parseInt(String(ep.duration), 10) : null,
                poster: ep.info?.movie_image || ep.info?.cover || '',
                added: ep.added || '',
                available: true,
              };

              if (existingEps.items.length > 0) {
                await pb.collection('series_episodes').update(existingEps.items[0].id, epData);
              } else {
                await pb.collection('series_episodes').create(epData);
              }
              epCount++;
            } catch { /* skip individual episode */ }
          }
        }
      } catch { /* skip series */ }
    }));
  }

  console.log(`[sync-job] Series: ${count} synced, ${epCount} episodes`);
  return count;
}

/**
 * Find a series record by external series_id.
 */
async function findSeriesByExternalId(pb, sourceId, seriesId) {
  const results = await pb.collection('series').getList(1, 1, {
    filter: `source_id="${sourceId}" && series_id=${seriesId}`,
  });
  return results.items[0] || null;
}
