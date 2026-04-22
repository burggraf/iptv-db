# IPTV DB

Self-hosted IPTV catalog application. Scrapes blog pages for Xtream accounts and M3U URLs, syncs full catalogs (channels, movies, series + episodes), and provides a browsable web interface.

## Architecture

- **Backend**: PocketBase 0.36.8 (single Go binary, embedded SQLite)
- **Worker**: Node.js (scraping, Xtream API sync, job queue)
- **Frontend**: Vite + React + TypeScript SPA (served by PocketBase)

## Quick Start (Development)

### 1. Start PocketBase

```bash
# PocketBase is already installed on this system
cd /path/to/iptv-db
pocketbase superuser upsert admin@iptv.local admin12345678
pocketbase serve --http=127.0.0.1:8090 &
```

### 2. Create Collections

```bash
cd worker && node setup.js
```

This creates all 7 collections with proper fields and indexes via the Admin API.

### 3. Build Frontend

```bash
cd frontend
npm ci
npm run build
cp -r dist/* ../pb_public/
```

### 4. Start Worker

```bash
cd worker
npm ci
node index.js
```

### 5. Create a User

Open `http://127.0.0.1:8090/_/` in your browser, go to the `users` collection, and create a user account. This is the login for the SPA.

### 6. Access the App

Open `http://127.0.0.1:8090/` in your browser and log in with the user account you created.

## Database Schema

### Collections

| Collection | Fields | Indexes | Description |
|---|---|---|---|
| `sources` | 13 | 3 | Xtream accounts and M3U sources |
| `categories` | 4 | 3 | Live/VOD/Series categories per source |
| `channels` | 10 | 5 | Live TV channels |
| `movies` | 17 | 5 | VOD movies |
| `series` | 13 | 5 | TV series |
| `series_episodes` | 9 | 3 | Individual episodes |
| `sync_jobs` | 7 | 2 | Sync job tracking |

### Index Strategy

All content tables (channels, movies, series) have:
- **Unique index** on `(stream_id/source_id)` to prevent duplicates
- **Browse index** on `(source_id, category_id, available)` for primary queries
- **Source index** for source detail pages
- **Category index** for global category browsing
- **Name index** for search

## Operations

### Backup

```bash
tar czf iptv-backup-$(date +%Y%m%d).tar.gz pb_data/
```

### Restore

```bash
tar xzf iptv-backup-YYYYMMDD.tar.gz
```

### Sync API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/worker/api/scrape` | Scrape a blog URL for sources |
| POST | `/worker/api/sync` | Queue a source for sync |
| GET | `/worker/api/status` | Queue and worker status |

```bash
# Scrape a blog page
curl -X POST http://localhost:3100/api/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.iptvregion.eu.org/..."}'

# Sync a specific source
curl -X POST http://localhost:3100/api/sync \
  -H 'Content-Type: application/json' \
  -d '{"source_id": "SOURCE_ID"}'
```
