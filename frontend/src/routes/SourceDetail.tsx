import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Source, SyncJob, Category, Channel } from '../types/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { formatDateTime, formatDate, proxyImageUrl } from '../lib/utils';
import { Trash2, MoreVertical, RefreshCw, Copy, Check } from 'lucide-react';
import ChannelDetailModal from '../components/ChannelDetailModal';
import PaginatedTable, { type Column } from '../components/PaginatedTable';
import BatchActionsBar from '../components/BatchActionsBar';
import { useChannelSelection } from '../hooks/useChannelSelection';

export default function SourceDetail() {
  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<Source | null>(null);
  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [selectedLiveCat, setSelectedLiveCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState('');
  const navigate = useNavigate();

  const { selectedIds, toggle, clear } = useChannelSelection();
  const [copied, setCopied] = useState(false);

  const m3uUrl = source?.type === 'xtream' && source?.base_url && source?.username && source?.password
    ? `${source.base_url.replace(/\/$/, '')}/get.php?username=${encodeURIComponent(source.username)}&password=${encodeURIComponent(source.password)}&type=m3u`
    : source?.m3u_url || '';

  const handleCopyM3u = async () => {
    if (!m3uUrl) return;
    await navigator.clipboard.writeText(m3uUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Refresh key to force PaginatedTable reload after batch operations
  const [refreshKey, setRefreshKey] = useState(0);
  const handleBatchSuccess = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // Settings menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await pb.collection('sources').delete(id);
      navigate('/app/dashboard');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  // Trigger sync
  const handleSync = async () => {
    if (!id) return;
    try {
      await fetch('/worker/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: id }),
      });
      setIsSyncing(true);
    } catch (err) {
      console.error('Failed to start sync:', err);
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const src = await pb.collection('sources').getOne<Source>(id);
        if (!cancelled) setSource(src);

        const headers: Record<string, string> = {};
        if (pb.authStore.token) headers['Authorization'] = pb.authStore.token;
        const url = `/api/collections/categories/records?page=1&perPage=500&filter=${encodeURIComponent(`source_id="${id}" && type="live"`)}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Failed to fetch live categories: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setLiveCategories(data.items as Category[]);
      } catch (err) {
        if (!isAbortError(err)) console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const parts = [`source_id="${id}"`, 'available=true'];
    if (selectedLiveCat) parts.push(`category_id="${selectedLiveCat}"`);
    setChannelFilter(parts.join(' && '));
  }, [id, selectedLiveCat]);

  useEffect(() => {
    if (!id) return;
    const checkJob = async () => {
      try {
        const jobs = await pb.collection('sync_jobs').getList<SyncJob>(1, 1, {
          filter: `source_id="${id}"`,
          sort: '-created',
        });
        const latest = jobs.items[0] ?? null;
        const isActive = latest && (latest.status === 'running' || latest.status === 'queued');
        setSyncJob(isActive || latest?.status === 'failed' ? latest : null);
        setIsSyncing(!!isActive);
      } catch { /* ignore */ }
    };
    checkJob();
    const unsub = pb.collection('sync_jobs').subscribe('*', () => {
      checkJob();
    });
    return () => { unsub.then((u: () => void) => u()); };
  }, [id]);

  const liveChannelColumns: Column<Channel>[] = [
    {
      header: 'Name',
      accessor: (ch) => (
        <span className="flex items-center gap-2">
          {(() => { const logoUrl = proxyImageUrl(ch.logo); return logoUrl ? <img src={logoUrl} alt="" className="w-5 h-5 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null; })()}
          {ch.name}
        </span>
      ),
      sortable: true,
      sortKey: 'name',
    },
    { header: 'Country', accessor: (ch) => ch.tvg_country || '—', sortable: true, sortKey: 'tvg_country' },
    { header: 'EPG ID', accessor: (ch) => ch.epg_id || '—' },
    { header: 'Added', accessor: (ch) => ch.added || '—', sortable: true, sortKey: 'added' },
  ];

  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (!source) return <div className="text-muted-foreground">Source not found.</div>;

  return (
    <div className="space-y-6">
      {/* Source info header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{source.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{source.base_url}</p>
            </div>
            <div className="flex items-center gap-2">
              {isSyncing && syncJob ? (
                <Badge variant="warning">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                    {syncJob.phase || 'Syncing'}
                  </span>
                </Badge>
              ) : (
                <Badge variant={source.status === 'active' ? 'success' : source.status === 'error' ? 'destructive' : source.status === 'pending' ? 'warning' : 'secondary'}>
                  {source.status}
                </Badge>
              )}
              <Badge variant="secondary">{source.type}</Badge>
              {!isSyncing && (
                <button
                  onClick={handleSync}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Sync
                </button>
              )}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-44 rounded-md border bg-popover p-1 shadow-md z-50">
                    <button
                      className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-accent hover:text-destructive"
                      onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}
                    >
                      <Trash2 className="h-4 w-4" /> Delete Source
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isSyncing && syncJob && (
            <div className="mb-4 space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="font-medium">{syncJob.phase || 'Syncing...'}</span>
                </span>
                <span className="text-muted-foreground">{Math.round(syncJob.progress ?? 0)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${syncJob.progress ?? 0}%` }}
                />
              </div>
            </div>
          )}
          {!isSyncing && syncJob?.error && (
            <div className="mb-4 rounded-lg border border-destructive/50 p-3">
              <p className="text-sm font-medium text-destructive">Sync failed: {syncJob.phase || 'All retries exhausted'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{syncJob.error}</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-4 text-sm">
            <div>
              <span className="text-muted-foreground">Username</span>
              <p className="font-medium">{source.username || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Max Connections</span>
              <p className="font-medium">{source.max_connections ?? '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Expiry</span>
              <p className="font-medium">{formatDate(source.expiry_date)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Last Sync</span>
              <p className="font-medium">{formatDateTime(source.last_sync)}</p>
            </div>
          </div>
          {m3uUrl && (
            <div className="mt-4 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground shrink-0">M3U URL:</span>
              <code className="flex-1 truncate text-xs font-mono" title={m3uUrl}>{m3uUrl}</code>
              <button
                onClick={handleCopyM3u}
                className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
                title="Copy to clipboard"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
          {source.sync_status && source.sync_status !== 'ok' && !syncJob?.error && (
            <p className="mt-2 text-sm text-destructive">{source.sync_status}</p>
          )}
        </CardContent>
      </Card>

      {/* Content counts */}
      <div className="flex flex-wrap gap-6 text-sm">
        <span><span className="font-semibold">{source.channel_count?.toLocaleString() ?? 0}</span> <span className="text-muted-foreground">Channels</span></span>
        <span><span className="font-semibold">{source.movie_count?.toLocaleString() ?? 0}</span> <span className="text-muted-foreground">Movies</span></span>
        <span><span className="font-semibold">{source.series_count?.toLocaleString() ?? 0}</span> <span className="text-muted-foreground">Series</span></span>
      </div>

      {/* Live channels */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Live Channels</CardTitle>
            <Select
              value={selectedLiveCat}
              onChange={(e) => setSelectedLiveCat(e.target.value)}
              className="w-64"
            >
              <option value="">All Categories</option>
              {liveCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <PaginatedTable<Channel>
            key={refreshKey}
            pb={pb}
            collection="channels"
            filter={channelFilter}
            sort="name"
            perPage={50}
            selectable
            selectedIds={selectedIds}
            onToggle={toggle}
            onRowClick={(ch) => setSelectedChannelId(ch.id)}
            emptyMessage="No channels found."
            columns={liveChannelColumns}
          />
        </CardContent>
      </Card>

      <Link to="/app/dashboard">
        <Button variant="outline">← Back to Dashboard</Button>
      </Link>

      <ChannelDetailModal channelId={selectedChannelId} onClose={() => setSelectedChannelId(null)} />

      {/* Batch actions floating bar */}
      <BatchActionsBar onSuccess={handleBatchSuccess} />

      {/* Delete confirmation dialog */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !deleting && setDeleteOpen(false)}>
          <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Delete Source</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete <strong>{source.name}</strong> and all its related data
              (channels, movies, series, categories, sync jobs).
            </p>
            <p className="mt-3 text-sm font-medium text-destructive">This action cannot be undone.</p>
            {deleteError && <p className="mt-2 text-sm text-destructive">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 border"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2 disabled:opacity-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
