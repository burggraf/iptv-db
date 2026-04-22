# IPTV DB — Design Document

**Date:** 2026-04-22  
**Status:** Validated

## Overview

A self-hosted IPTV catalog application with a web SPA frontend. The system scrapes blog pages for Xtream accounts and M3U URLs, syncs each source's full catalog (live channels, VOD, series + episodes) into a SQLite database, and provides a browsable table-based UI.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Ubuntu 24.04 VPS                            │
│                                               │
│  PocketBase (Go binary, :8090)               │
│  ├── REST API + auth                          │
│  ├── SQLite DB (pb_data/)                     │
│  └── Serves SPA from pb_public/               │
│                                               │
│  Node.js Worker Process                       │
│  ├── Blog page scraper (Cheerio)             │
│  ├── Xtream API client                        │
│  ├── M3U parser                               │
│  ├── Sync job queue + worker pool (3-5)       │
│  └── Manual trigger only (no cron to start)   │
│                                               │
│  nginx (reverse proxy, HTTPS)                 │
│  ├── / → SPA                                  │
│  └── /api/* → PocketBase                      │
└──────────────────────────────────────────────┘
```

### Key Decisions

- **Two-process model**: PocketBase (database + API) + Node.js worker (business logic). Scraping/syncing is too heavy and complex for PocketBase hooks (no NPM, no proper async, no process isolation).
- **Manual sync only**: No scheduled cron jobs. User triggers syncs from UI.
- **Sources are strictly independent**: No cross-source deduplication.
- **Table-only views**: No card grids. Compact, sortable tables for all browse views.

## Database Schema

### Collections

#### `sources`
| Field | Type | Notes |
|---|---|---|
| `type` | select | `"xtream"` or `"m3u"` |
| `name` | text | Human-readable identifier |
| `base_url` | text | e.g. `http://frt.n-052.xyz:8080` |
| `username` | text | Hidden from frontend API rules |
| `password` | text | Hidden from frontend API rules |
| `m3u_url` | text | For m3u-type sources |
| `max_connections` | number | From Xtream user_info |
| `expiry_date` | datetime | From Xtream user_info |
| `status` | select | `"active"` / `"expired"` / `"error"` |
| `last_sync` | datetime | |
| `sync_status` | text | Last error message or "ok" |
| `source_url` | text | Blog URL it was scraped from |
| `scraped_at` | datetime | |

#### `categories`
| Field | Type | Notes |
|---|---|---|
| `source_id` | relation → sources | |
| `type` | select | `"live"` / `"vod"` / `"series"` |
| `category_id` | number | Xtream's category_id |
| `name` | text | |
| `parent_id` | relation → categories | Nullable, for series subcats |

#### `channels`
| Field | Type | Notes |
|---|---|---|
| `source_id` | relation → sources | |
| `category_id` | relation → categories | |
| `stream_id` | number | Unique per source |
| `name` | text | |
| `logo` | text | |
| `epg_id` | text | |
| `tvg_id` | text | |
| `tvg_country` | text | |
| `added` | text | |
| `available` | bool | Soft delete flag (default: true) |
| **Index** | unique | `(stream_id, source_id)` |

#### `movies` (VOD)
| Field | Type | Notes |
|---|---|---|
| `source_id` | relation → sources | |
| `category_id` | relation → categories | |
| `stream_id` | number | Unique per source |
| `name` | text | |
| `plot` | text | |
| `year` | text | |
| `genre` | text | |
| `rating` | number | |
| `poster` | text | |
| `backdrop` | text | |
| `director` | text | |
| `cast` | text | |
| `duration_secs` | number | |
| `release_date` | text | |
| `youtube_trailer` | text | |
| `episode_run_time` | text | |
| `available` | bool | Soft delete flag (default: true) |
| **Index** | unique | `(stream_id, source_id)` |

#### `series`
| Field | Type | Notes |
|---|---|---|
| `source_id` | relation → sources | |
| `category_id` | relation → categories | |
| `series_id` | number | Unique per source |
| `name` | text | |
| `plot` | text | |
| `year` | text | |
| `genre` | text | |
| `rating` | number | |
| `poster` | text | |
| `backdrop` | text | |
| `cast` | text | |
| `director` | text | |
| `available` | bool | Soft delete flag (default: true) |
| **Index** | unique | `(series_id, source_id)` |

#### `series_episodes`
| Field | Type | Notes |
|---|---|---|
| `series_id` | relation → series | |
| `season` | number | |
| `episode_num` | number | |
| `title` | text | |
| `plot` | text | |
| `duration_secs` | number | |
| `poster` | text | |
| `added` | text | |

#### `sync_jobs`
| Field | Type | Notes |
|---|---|---|
| `source_id` | relation → sources | |
| `status` | select | `"queued"` / `"running"` / `"completed"` / `"failed"` |
| `phase` | text | e.g. "syncing channels 3,421/15,000" |
| `progress` | number | 0-100 |
| `started_at` | datetime | |
| `finished_at` | datetime | |
| `error` | text | |

### API Rules (PocketBase)

- **sources**: Read for authenticated users. Write via admin token only (worker).
- **categories/channels/movies/series/episodes**: Read for authenticated users. Write via admin token only.
- **sync_jobs**: Read for authenticated users (real-time subscriptions for progress). Write via admin token.
- **users**: No signup. Admin creates users manually.

## Frontend SPA

### Stack
- **Vite + React + TypeScript**
- **PocketBase JS SDK** for API communication
- **Tailwind CSS + shadcn/ui** for UI components
- **TanStack Query** for data fetching + caching
- **React Router v7** for client-side routing

### Routes & Pages

| Route | Description |
|---|---|
| `/` | Login screen (redirects if already authenticated) |
| `/dashboard` | Overview: counts, recent sync activity |
| `/sources` | Table of all sources with status, type, sync info |
| `/sources/:id` | Source detail: account info, tabs for channels/VOD/series |
| `/channels` | Browse all channels, filter by source + category |
| `/channels/:categoryId` | Channels filtered by category |
| `/movies` | Browse all VOD, filter by source + category |
| `/movies/:categoryId` | Movies filtered by category |
| `/series` | Browse all series, filter by source + category |
| `/series/:categoryId` | Series filtered by category |
| `/settings` | Add scrape URL, trigger sync, manage sources |

### UI Layout
```
┌──────────────────────────────────────────────┐
│  [Logo] IPTV DB          [⚙ Settings] [👤]   │
├────────┬─────────────────────────────────────┤
│ Sources│  Main content area                  │
│ Channels│                                    │
│ Movies │  All views: compact sortable tables │
│ Series │  with pagination and inline search   │
│ Sync   │                                    │
└────────┴─────────────────────────────────────┘
```

## Sync Engine

### Flow
1. User pastes blog URL → worker fetches page with Cheerio
2. Parses Xtream tables (host/user/pass) and M3U links → creates Source records
3. Each new/updated source enqueued for sync
4. Worker pool (3-5 concurrent) processes sync jobs:
   - Authenticate via `/player_api.php` → update user_info
   - Fetch categories (live, VOD, series)
   - Fetch streams (live, VOD, series) with pagination
   - For each series: fetch episodes via `get_series_info`
   - Mark unavailable items (`available = false`)
   - Update source.last_sync, sync_status
5. Progress written to `sync_jobs` collection → real-time SSE updates to SPA

### Scraping Targets
- **Xtream tables** (e.g., iptvregion blog): HTML tables with Server/User/Pass columns
- **M3U links** (e.g., iptvregion blog): `<a>` href links containing `get.php?username=&password=` URLs

### Error Handling
- 30s connect / 60s read timeout per API call
- Exponential backoff on network errors, max 3 retries
- Failed sources marked `error`, skipped until re-enabled
- Partial syncs preserved (idempotent upsert)

## Deployment (Direct on VPS)

### Prerequisites
- Ubuntu 24.04 VPS
- Node.js 22+ LTS
- nginx (reverse proxy)
- SSL certificate (Let's Encrypt)

### Setup
```bash
# PocketBase
wget https://github.com/pocketbase/pocketbase/releases/download/v0.25.x/pocketbase_0.25.x_linux_amd64.zip
unzip pocketbase_*.zip
mv pocketbase /opt/iptv/

# Worker
cd /opt/iptv/worker && npm install --production

# Frontend
cd /opt/iptv/frontend && npm ci && npm run build
cp -r dist/* /opt/iptv/pb_public/

# systemd services
systemctl enable --now iptv-pb
systemctl enable --now iptv-worker
systemctl enable --now nginx
```

### Operations
- **Update**: Replace PocketBase binary, git pull worker/frontend, rebuild frontend, restart services
- **Backup**: `tar czf backup.tar.gz /opt/iptv/pb_data/`
- **Restore**: Extract pb_data, restart PocketBase

## Project Structure

```
iptv-db/
├── pocketbase/              # downloaded PB binary (not committed)
├── pb_data/                 # SQLite DB (gitignored)
├── pb_migrations/           # PB collection schema migrations
├── frontend/                # Vite + React SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   ├── components/
│   │   ├── lib/
│   │   └── types/
│   └── components.json      # shadcn/ui config
├── worker/                  # Node.js scraper + sync engine
│   ├── package.json
│   ├── index.js
│   ├── scraper.js
│   ├── xtream.js
│   ├── m3u-parser.js
│   ├── sync-engine.js
│   └── sync-job.js
├── .env.example
├── .gitignore
└── README.md
```
