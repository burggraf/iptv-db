import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { Settings, Trash2, Globe, RefreshCw, X, LogOut, ListStart, Square } from 'lucide-react';
import { pb } from '../lib/pocketbase';
import type { SyncJob } from '../types/database';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{ added: number; updated: number } | null>(null);
  const [scrapeError, setScrapeError] = useState('');
  const settingsRef = useRef<HTMLDivElement>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [cancellingAll, setCancellingAll] = useState(false);

  // Source detail sync state (for when viewing /app/dashboard/:id)
  const sourceDetailMatch = location.pathname.match(/^\/app\/dashboard\/([a-z0-9]{15})$/);
  const currentSourceId = sourceDetailMatch?.[1] ?? null;
  const [sourceSyncing, setSourceSyncing] = useState(false);
  const [sourceSyncJob, setSourceSyncJob] = useState<SyncJob | null>(null);

  useEffect(() => {
    if (!currentSourceId) {
      setSourceSyncJob(null);
      setSourceSyncing(false);
      return;
    }
    const checkJob = async () => {
      try {
        const jobs = await pb.collection('sync_jobs').getList<SyncJob>(1, 1, {
          filter: `source_id="${currentSourceId}" && (status="running" || status="queued")`,
          sort: '-created',
        });
        const job = jobs.items[0] ?? null;
        setSourceSyncJob(job);
        setSourceSyncing(!!job);
      } catch { /* ignore */ }
    };
    checkJob();
    const interval = setInterval(checkJob, 3000);
    return () => clearInterval(interval);
  }, [currentSourceId]);

  const handleSyncSource = async () => {
    if (!currentSourceId) return;
    setSettingsOpen(false);
    setSourceSyncing(true);
    try {
      const res = await fetch('/worker/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: currentSourceId }),
      });
      if (!res.ok) throw new Error('Sync request failed');
    } catch (err) {
      console.error('Sync failed:', err);
      setSourceSyncing(false);
    }
  };

  const handleCancelSync = async () => {
    if (!currentSourceId) return;
    setSettingsOpen(false);
    setSourceSyncing(false);
    setSourceSyncJob(null);
    try {
      await fetch(`/worker/api/sync/${currentSourceId}/cancel`, { method: 'POST' });
    } catch (err) {
      console.error('Cancel sync failed:', err);
    }
  };

  const handleSyncAllPending = async () => {
    setSettingsOpen(false);
    setSyncingAll(true);
    try {
      const res = await fetch('/worker/api/sync-all', { method: 'POST' });
      const data = await res.json();
      console.log(`[sync-all] Enqueued ${data.enqueued} sources`);
    } catch (err) {
      console.error('Sync all failed:', err);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleCancelAllSyncs = async () => {
    setSettingsOpen(false);
    setCancellingAll(true);
    try {
      await fetch('/worker/api/cancel-all', { method: 'POST' });
    } catch (err) {
      console.error('Cancel all failed:', err);
    } finally {
      setCancellingAll(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const handleDeleteAllSources = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pb.authStore.token) {
        headers['Authorization'] = pb.authStore.token;
      }
      const res = await fetch('/api/cascade-delete', {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error: ${res.status}`);
      }
    } catch (err) {
      console.error('Delete all sources failed:', err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown error');
      setDeleting(false);
      return;
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
    setSettingsOpen(false);
    window.location.reload();
  };

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeResult(null);
    setScrapeError('');
    try {
      const res = await fetch('/worker/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Scrape failed');
      }
      const data = await res.json();
      setScrapeResult({ added: data.added || 0, updated: data.updated || 0 });
    } catch (err: unknown) {
      setScrapeError(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center border-b bg-card px-6">
        <h1 className="text-lg font-bold">IPTV DB</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-md border bg-card shadow-lg z-50">
                <div className="py-1">
                  {currentSourceId ? (
                    <>
                      {sourceSyncing ? (
                        <button
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={handleCancelSync}
                        >
                          <X className="h-4 w-4" /> Cancel Sync
                        </button>
                      ) : (
                        <button
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted transition-colors"
                          onClick={handleSyncSource}
                        >
                          <RefreshCw className="h-4 w-4" /> Sync
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                        onClick={handleSyncAllPending}
                        disabled={syncingAll}
                      >
                        <ListStart className="h-4 w-4" /> {syncingAll ? 'Syncing...' : 'Sync All Pending'}
                      </button>
                      <button
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        onClick={handleCancelAllSyncs}
                        disabled={cancellingAll}
                      >
                        <Square className="h-4 w-4" /> {cancellingAll ? 'Cancelling...' : 'Cancel All Syncs'}
                      </button>
                      <div className="my-1 border-t" />
                      <button
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          setSettingsOpen(false);
                          setScrapeDialogOpen(true);
                        }}
                      >
                        <Globe className="h-4 w-4" /> Scrape Sources
                      </button>
                      <button
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => {
                          setSettingsOpen(false);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Delete All Sources
                      </button>
                    </>
                  )}
                  <div className="my-1 border-t" />
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      {/* Delete All Sources confirmation dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !deleting && setDeleteDialogOpen(false)}>
          <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Delete All Sources</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete all sources and their related data
              (channels, movies, series, categories, sync jobs).
            </p>
            <p className="mt-3 text-sm font-medium text-destructive">
              This action cannot be undone.
            </p>
            {deleteError && (
              <p className="mt-2 text-sm text-destructive">{deleteError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 border"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2"
                onClick={handleDeleteAllSources}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrape Sources dialog */}
      {scrapeDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !scraping && setScrapeDialogOpen(false)}>
          <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Scrape Sources</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Paste a blog URL containing Xtream accounts or M3U links to scrape new sources.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                placeholder="https://example.com/blog-post"
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={scraping}
              />
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 disabled:opacity-50"
                onClick={handleScrape}
                disabled={scraping || !scrapeUrl.trim()}
              >
                {scraping ? 'Scraping...' : 'Scrape'}
              </button>
            </div>
            {scraping && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Scraping sources, this may take a moment...</p>
                </div>
              </div>
            )}
            {scrapeResult && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-green-600">
                  ✓ Added {scrapeResult.added} source{scrapeResult.added !== 1 ? 's' : ''}, updated {scrapeResult.updated}.
                </p>
                <button
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                  onClick={() => {
                    setScrapeDialogOpen(false);
                    setScrapeUrl('');
                    setScrapeResult(null);
                    window.location.reload();
                  }}
                >
                  Done
                </button>
              </div>
            )}
            {scrapeError && (
              <p className="mt-2 text-sm text-destructive">{scrapeError}</p>
            )}
            {!scraping && !scrapeResult && (
              <div className="mt-6 flex justify-end gap-2">
                <button
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 border"
                  onClick={() => setScrapeDialogOpen(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
