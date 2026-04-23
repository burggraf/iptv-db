#!/bin/bash
# Deploy script for iptv-db
# Usage: ./deploy.sh [--ssh-host HOST] [--skip-build]
#
# Deploys the frontend to pb_public and syncs deploy files to the server.
# Default SSH host: root@zzzx.uk
# Remote base dir: /opt/iptv

set -euo pipefail

# Defaults
SSH_HOST="root@zzzx.uk"
REMOTE_BASE="/opt/iptv"
SKIP_BUILD=false

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --ssh-host) SSH_HOST="$2"; shift 2 ;;
        --skip-build) SKIP_BUILD=true; shift ;;
        --help|-h)
            echo "Usage: $0 [--ssh-host HOST] [--skip-build]"
            echo "  --ssh-host   SSH user@host (default: root@zzzx.uk)"
            echo "  --skip-build Skip frontend build, use existing dist/"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "=== Deploying to $SSH_HOST ==="

# 1. Build frontend
if [ "$SKIP_BUILD" = false ]; then
    echo "→ Building frontend..."
    cd "$FRONTEND_DIR"
    rm -rf dist node_modules/.vite
    npx vite build
    echo "✓ Frontend built"
fi

# Verify dist exists
if [ ! -d "$FRONTEND_DIR/dist" ]; then
    echo "ERROR: $FRONTEND_DIR/dist not found. Build failed?"
    exit 1
fi

# 2. Clean old assets on remote
echo "→ Cleaning old frontend files on server..."
ssh "$SSH_HOST" "rm -rf $REMOTE_BASE/pb_public/assets $REMOTE_BASE/pb_public/index.html $REMOTE_BASE/pb_public/._*"

# 3. Sync frontend
echo "→ Uploading frontend..."
cd "$FRONTEND_DIR/dist"
tar cf - . | ssh "$SSH_HOST" "tar xf - -C $REMOTE_BASE/pb_public/"
echo "✓ Frontend deployed"

# 4. Clean macOS metadata files on remote
ssh "$SSH_HOST" "find $REMOTE_BASE/pb_public -name '._*' -delete"

# 5. Sync deploy files (systemd services, nginx config)
echo "→ Syncing deploy files..."
rsync -avz --delete "$SCRIPT_DIR/deploy/" "$SSH_HOST:$REMOTE_BASE/deploy/"
echo "✓ Deploy files synced"

# 6. Verify deployment
echo "→ Verifying..."
FILES=$(ssh "$SSH_HOST" "ls $REMOTE_BASE/pb_public/assets/ 2>/dev/null | wc -l")
echo "  Server pb_public/assets: $FILES files"
ssh "$SSH_HOST" "ls -lh $REMOTE_BASE/pb_public/assets/"

echo ""
echo "=== Deployment complete ==="
echo "Frontend: https://zzzx.uk/"
echo "PocketBase: $(ssh "$SSH_HOST" "curl -s http://127.0.0.1:8090/api/health")"
