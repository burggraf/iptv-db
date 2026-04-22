#!/usr/bin/env node
/**
 * setup.js - Creates PocketBase collections via Admin API.
 * Compatible with PocketBase 0.36.8.
 *
 * PocketBase 0.36.8 API format notes:
 *   - Select fields: { name: 'x', type: 'select', values: ['a','b'] }  (NOT in options)
 *   - Relation fields: { name: 'x', type: 'relation', collectionId: 'pbc_xxx' }  (NOT in options)
 *   - The JS SDK crashes on response parsing; we use raw fetch instead
 *
 * Usage:
 *   pocketbase superuser upsert admin@iptv.local admin12345678
 *   pocketbase serve --http=127.0.0.1:8090 &
 *   cd worker && node setup.js
 */

import PocketBase from 'pocketbase';

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@iptv.local';
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'admin12345678';

const pb = new PocketBase(PB_URL);

async function createCollection(config) {
  const res = await fetch(`${PB_URL}/api/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + pb.authStore.token,
    },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to create ${config.name}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('[setup] Connecting to', PB_URL);
  await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('[setup] Authenticated');

  // Configure users collection (disable signup)
  await pb.collections.update('users', {
    authRule: '', manageRule: null,
    listRule: null, viewRule: null,
    createRule: null, updateRule: null, deleteRule: null,
  });
  console.log('[setup] users: configured (no signup)');

  // 1. sources (no relations)
  const sources = await createCollection({
    name: 'sources', type: 'base',
    fields: [
      { name: 'type', type: 'select', required: true, values: ['xtream', 'm3u'] },
      { name: 'name', type: 'text', required: true, min: 1, max: 500 },
      { name: 'base_url', type: 'text' },
      { name: 'username', type: 'text' },
      { name: 'password', type: 'text' },
      { name: 'm3u_url', type: 'text' },
      { name: 'max_connections', type: 'number' },
      { name: 'expiry_date', type: 'date' },
      { name: 'status', type: 'select', required: true, values: ['active', 'expired', 'error'] },
      { name: 'last_sync', type: 'date' },
      { name: 'sync_status', type: 'text' },
      { name: 'source_url', type: 'text' },
      { name: 'scraped_at', type: 'date' },
    ],
    indexes: [
      'CREATE INDEX idx_sources_type ON sources (type)',
      'CREATE INDEX idx_sources_status ON sources (status)',
      'CREATE INDEX idx_sources_scraped_at ON sources (scraped_at)',
    ],
    listRule: '', viewRule: '',
  });
  console.log(`[setup] sources: ${sources.fields.length} fields, ${sources.indexes.length} indexes`);

  // 2. categories (relation → sources)
  const categories = await createCollection({
    name: 'categories', type: 'base',
    fields: [
      { name: 'source_id', type: 'relation', required: true, collectionId: sources.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'type', type: 'select', required: true, values: ['live', 'vod', 'series'] },
      { name: 'category_id', type: 'number', required: true },
      { name: 'name', type: 'text', required: true },
    ],
    indexes: [
      'CREATE INDEX idx_categories_source ON categories (source_id)',
      'CREATE INDEX idx_categories_type ON categories (type)',
      'CREATE UNIQUE INDEX idx_categories_unique ON categories (source_id, type, category_id)',
    ],
    listRule: '', viewRule: '',
  });
  console.log(`[setup] categories: ${categories.fields.length} fields, ${categories.indexes.length} indexes`);

  // 3. channels (relations → sources, categories)
  const channels = await createCollection({
    name: 'channels', type: 'base',
    fields: [
      { name: 'source_id', type: 'relation', required: true, collectionId: sources.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'category_id', type: 'relation', required: true, collectionId: categories.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'stream_id', type: 'number', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'logo', type: 'text' },
      { name: 'epg_id', type: 'text' },
      { name: 'tvg_id', type: 'text' },
      { name: 'tvg_country', type: 'text' },
      { name: 'added', type: 'text' },
      { name: 'available', type: 'bool', required: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_channels_unique ON channels (stream_id, source_id)',
      'CREATE INDEX idx_channels_browse ON channels (source_id, category_id, available)',
      'CREATE INDEX idx_channels_source ON channels (source_id)',
      'CREATE INDEX idx_channels_category ON channels (category_id)',
      'CREATE INDEX idx_channels_name ON channels (name)',
    ],
    listRule: '', viewRule: '',
  });
  console.log(`[setup] channels: ${channels.fields.length} fields, ${channels.indexes.length} indexes`);

  // 4. movies (relations → sources, categories)
  const movies = await createCollection({
    name: 'movies', type: 'base',
    fields: [
      { name: 'source_id', type: 'relation', required: true, collectionId: sources.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'category_id', type: 'relation', required: true, collectionId: categories.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'stream_id', type: 'number', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'plot', type: 'text' },
      { name: 'year', type: 'text' },
      { name: 'genre', type: 'text' },
      { name: 'rating', type: 'number' },
      { name: 'poster', type: 'text' },
      { name: 'backdrop', type: 'text' },
      { name: 'director', type: 'text' },
      { name: 'cast', type: 'text' },
      { name: 'duration_secs', type: 'number' },
      { name: 'release_date', type: 'text' },
      { name: 'youtube_trailer', type: 'text' },
      { name: 'episode_run_time', type: 'text' },
      { name: 'available', type: 'bool', required: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_movies_unique ON movies (stream_id, source_id)',
      'CREATE INDEX idx_movies_browse ON movies (source_id, category_id, available)',
      'CREATE INDEX idx_movies_source ON movies (source_id)',
      'CREATE INDEX idx_movies_category ON movies (category_id)',
      'CREATE INDEX idx_movies_name ON movies (name)',
    ],
    listRule: '', viewRule: '',
  });
  console.log(`[setup] movies: ${movies.fields.length} fields, ${movies.indexes.length} indexes`);

  // 5. series (relations → sources, categories)
  const series = await createCollection({
    name: 'series', type: 'base',
    fields: [
      { name: 'source_id', type: 'relation', required: true, collectionId: sources.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'category_id', type: 'relation', required: true, collectionId: categories.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'series_id', type: 'number', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'plot', type: 'text' },
      { name: 'year', type: 'text' },
      { name: 'genre', type: 'text' },
      { name: 'rating', type: 'number' },
      { name: 'poster', type: 'text' },
      { name: 'backdrop', type: 'text' },
      { name: 'cast', type: 'text' },
      { name: 'director', type: 'text' },
      { name: 'available', type: 'bool', required: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_series_unique ON series (series_id, source_id)',
      'CREATE INDEX idx_series_browse ON series (source_id, category_id, available)',
      'CREATE INDEX idx_series_source ON series (source_id)',
      'CREATE INDEX idx_series_category ON series (category_id)',
      'CREATE INDEX idx_series_name ON series (name)',
    ],
    listRule: '', viewRule: '',
  });
  console.log(`[setup] series: ${series.fields.length} fields, ${series.indexes.length} indexes`);

  // 6. series_episodes (relation → series)
  const episodes = await createCollection({
    name: 'series_episodes', type: 'base',
    fields: [
      { name: 'series_id', type: 'relation', required: true, collectionId: series.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'season', type: 'number', required: true },
      { name: 'episode_num', type: 'number', required: true },
      { name: 'title', type: 'text' },
      { name: 'plot', type: 'text' },
      { name: 'duration_secs', type: 'number' },
      { name: 'poster', type: 'text' },
      { name: 'added', type: 'text' },
      { name: 'available', type: 'bool', required: true },
    ],
    indexes: [
      'CREATE INDEX idx_episodes_series ON series_episodes (series_id)',
      'CREATE UNIQUE INDEX idx_episodes_unique ON series_episodes (series_id, season, episode_num)',
      'CREATE INDEX idx_episodes_season ON series_episodes (series_id, season)',
    ],
    listRule: '', viewRule: '',
  });
  console.log(`[setup] series_episodes: ${episodes.fields.length} fields, ${episodes.indexes.length} indexes`);

  // 7. sync_jobs (relation → sources)
  const syncJobs = await createCollection({
    name: 'sync_jobs', type: 'base',
    fields: [
      { name: 'source_id', type: 'relation', required: true, collectionId: sources.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'status', type: 'select', required: true, values: ['queued', 'running', 'completed', 'failed'] },
      { name: 'phase', type: 'text' },
      { name: 'progress', type: 'number' },
      { name: 'started_at', type: 'date' },
      { name: 'finished_at', type: 'date' },
      { name: 'error', type: 'text' },
    ],
    indexes: [
      'CREATE INDEX idx_sync_jobs_source ON sync_jobs (source_id)',
      'CREATE INDEX idx_sync_jobs_status ON sync_jobs (status)',
    ],
    listRule: '', viewRule: '',
  });
  console.log(`[setup] sync_jobs: ${syncJobs.fields.length} fields, ${syncJobs.indexes.length} indexes`);

  console.log('\n[setup] === Summary ===');
  const all = await pb.collections.getFullList();
  const custom = all.filter(c => !c.system && c.name !== 'users' && !['test','src','src2','test_rel','test_bool','testcat','testcat2','testcat3','my_test_collection'].includes(c.name));
  for (const c of custom) {
    console.log(`  ✓ ${c.name}: ${c.fields?.length || '?'} fields, ${c.indexes?.length || '?'} indexes`);
  }
  console.log('[setup] Done!');
}

main().catch((err) => {
  console.error('[setup] Error:', err.message);
  process.exit(1);
});
