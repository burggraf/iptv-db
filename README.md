# IPTV DB

Self-hosted IPTV catalog application. Scrapes blog pages for Xtream accounts and M3U URLs, syncs full catalogs (channels, movies, series + episodes), and provides a browsable web interface.

## Architecture

- **Backend**: PocketBase (single Go binary, embedded SQLite)
- **Worker**: Node.js (scraping, Xtream API sync, job queue)
- **Frontend**: Vite + React + TypeScript SPA (served by PocketBase)

## Quick Start (Development)

### Prerequisites

- Node.js 22+ LTS
- Go (optional, for building PocketBase from source)

### 1. Set up PocketBase

```bash
# Download PocketBase (latest release)
cd /path/to/iptv-db
mkdir -p pocketbase
cd pocketbase
wget https://github.com/pocketbase/pocketbase/releases/download/v0.25.8/pocketbase_0.25.8_linux_amd64.zip
unzip pocketbase_*.zip
cd ..
```

For macOS:
```bash
wget https://github.com/pocketbase/pocketbase/releases/download/v0.25.8/pocketbase_0.25.8_darwin_amd64.zip
unzip pocketbase_*.zip
# or for Apple Silicon:
wget https://github.com/pocketbase/pocketbase/releases/download/v0.25.8/pocketbase_0.25.8_darwin_arm64.zip
```

### 2. Run PocketBase (applies migrations automatically)

```bash
./pocketbase/pocketbase serve --http=127.0.0.1:8090
```

This starts PocketBase and applies all migrations from `pb_migrations/`.

### 3. Set up the Worker

```bash
cd worker
cp ../.env.example .env
# Edit .env with your PocketBase admin credentials
npm install
npm run dev
```

### 4. Set up the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on `http://localhost:5173` and proxies `/api` to PocketBase.

### 5. Create an Admin User

Open `http://127.0.0.1:8090/_/` in your browser and create an admin account. Update the worker's `.env` with these credentials.

### 6. Create a User

In the PocketBase admin UI, go to the `users` collection and create a user account. This is the login for the SPA.

## Production Deployment (Ubuntu 24.04)

### 1. Install Dependencies

```bash
sudo apt update
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx
```

### 2. Download PocketBase

```bash
sudo mkdir -p /opt/iptv
cd /opt/iptv
wget https://github.com/pocketbase/pocketbase/releases/download/v0.25.8/pocketbase_0.25.8_linux_amd64.zip
unzip pocketbase_*.zip
rm pocketbase_*.zip
```

### 3. Copy Application Files

```bash
# Copy migrations, worker, and frontend source to /opt/iptv
# (rsync from your dev machine)
sudo rsync -av pb_migrations/ /opt/iptv/pb_migrations/
sudo rsync -av worker/ /opt/iptv/worker/
sudo rsync -av frontend/ /opt/iptv/frontend/
```

### 4. Install Dependencies

```bash
cd /opt/iptv/worker
npm install --production

cd /opt/iptv/frontend
npm ci
npm run build
sudo cp -r dist/* /opt/iptv/pb_public/
```

### 5. Set up systemd Services

```bash
# Copy service files
sudo cp deploy/iptv-pb.service /etc/systemd/system/
sudo cp deploy/iptv-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now iptv-pb
sudo systemctl enable --now iptv-worker
```

### 6. Configure nginx

```bash
sudo cp deploy/nginx-iptv.conf /etc/nginx/sites-available/iptv
sudo ln -s /etc/nginx/sites-available/iptv /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Set up HTTPS

```bash
sudo certbot --nginx -d iptv.yourdomain.com
```

## Operations

### Backup

```bash
# Stop PocketBase first for a clean backup
sudo systemctl stop iptv-pb
tar czf iptv-backup-$(date +%Y%m%d).tar.gz /opt/iptv/pb_data/
sudo systemctl start iptv-pb
```

### Restore

```bash
sudo systemctl stop iptv-pb
tar xzf iptv-backup-YYYYMMDD.tar.gz -C /
sudo systemctl start iptv-pb
```

### Update

```bash
# Update PocketBase binary
cd /opt/iptv
wget https://github.com/pocketbase/pocketbase/releases/download/v0.26.x/pocketbase_0.26.x_linux_amd64.zip
unzip -o pocketbase_*.zip
rm pocketbase_*.zip

# Update worker and frontend
sudo rsync -av worker/ /opt/iptv/worker/
sudo rsync -av frontend/ /opt/iptv/frontend/

cd /opt/iptv/worker && npm install --production
cd /opt/iptv/frontend && npm ci && npm run build
sudo cp -r dist/* /opt/iptv/pb_public/

sudo systemctl restart iptv-pb iptv-worker
```

## Project Structure

```
├── pb_migrations/          # PocketBase collection schema migrations
├── frontend/               # Vite + React SPA
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── routes/         # Page components
│   │   ├── hooks/          # Auth hook
│   │   ├── lib/            # PocketBase client, utils
│   │   └── types/          # TypeScript types
│   └── ...
├── worker/                 # Node.js scraper + sync engine
│   ├── index.js            # Entry point + HTTP API
│   ├── scraper.js          # Blog page scraping (Cheerio)
│   ├── xtream.js           # Xtream API client
│   ├── m3u-parser.js       # M3U playlist parser
│   ├── sync-engine.js      # Job queue + worker pool
│   └── sync-job.js         # Single source sync logic
├── deploy/                 # systemd + nginx configs
├── docs/
│   └── plans/
│       └── 2026-04-22-iptv-db-design.md
├── .env.example
└── README.md
```

## API Endpoints (Worker)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scrape` | Scrape a blog URL for sources |
| POST | `/api/sync` | Queue a source for sync |
| GET | `/api/status` | Queue and worker status |

### Example: Scrape

```bash
curl -X POST http://localhost:3100/api/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.iptvregion.eu.org/2026/04/..."}'
```

### Example: Sync

```bash
curl -X POST http://localhost:3100/api/sync \
  -H 'Content-Type: application/json' \
  -d '{"source_id": "SOURCE_RECORD_ID"}'
```
