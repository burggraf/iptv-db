import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Source, SyncJob } from '../types/database';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import { formatDateTime } from '../lib/utils';
import { ChevronDown, Trash2, RefreshCw } from 'lucide-react';

const PAGE_SIZE = 100;
const WORKER_BASE = '/worker';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    sources: 0,
    channels: 0,
    movies: 0,
    series: 0,
    episodes: 0,
  });
  const [sources, setSources] = useState<Source[]>([]);
  const [counts, setCounts] = useState<Record<string, { channels: number; movies: number; series: number }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [activeJobs, setActiveJobs] = useState<Record<string, SyncJob>>({});

  // Checkbox selection
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setChecked(prev => prev.size === sources.length ? new Set() : new Set(sources.map(s => s.id)));
  };

  // Bulk action menu
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
  const [deletingChecked, setDeletingChecked] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [sourcesRes, channelsRes, moviesRes, seriesRes, episodesRes] = await Promise.all([
          pb.collection('sources').getList(1, 1, { filter: '1=1' }),
          pb.collection('channels').getList(1, 1, { filter: 'available = true' }),
          pb.collection('movies').getList(1, 1, { filter: 'available = true' }),
          pb.collection('series').getList(1, 1, { filter: 'available = true' }),
          pb.collection('series_episodes').getList(1, 1, { filter: 'available = true' }),
        ]);
        if (!cancelled) {
          setStats({
            sources: sourcesRes.totalItems,
            channels: channelsRes.totalItems,
            movies: moviesRes.totalItems,
            series: seriesRes.totalItems,
            episodes: episodesRes.totalItems,
          });
        }
      } catch (err) {
        if (!isAbortError(err)) console.error('Dashboard load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let filter = '1=1';
        if (search) {
          filter = `name ~ "${search}"`;
        }
        const res = await pb.collection('sources').getList<Source>(page, PAGE_SIZE, {
          filter,
          sort: '-created',
        });
        if (!cancelled) {
          setSources(res.items);
          setTotalPages(res.totalPages);
          setTotalItems(res.totalItems);
        }
      } catch (err) {
        if (!isAbortError(err)) console.error(err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [search, page]);

  useEffect(() => {
    if (sources.length === 0) {
      setCounts({});
      return;
    }
    let cancelled = false;
    const loadCounts = async () => {
      const newCounts: Record<string, { channels: number; movies: number; series: number }> = {};
      await Promise.all(
        sources.map(async (s) => {
          try {
            const [ch, mv, sr] = await Promise.all([
              pb.collection('channels').getList(1, 1, { filter: `source_id="${s.id}" && available=true` }),
              pb.collection('movies').getList(1, 1, { filter: `source_id="${s.id}" && available=true` }),
              pb.collection('series').getList(1, 1, { filter: `source_id="${s.id}" && available=true` }),
            ]);
            newCounts[s.id] = { channels: ch.totalItems, movies: mv.totalItems, series: sr.totalItems };
          } catch { /* skip */ }
        }),
      );
      if (!cancelled) setCounts(newCounts);
    };
    loadCounts();
    return () => { cancelled = true };
  }, [sources]);

  const loadActiveJobs = async () => {
    try {
      const jobs = await pb.collection('sync_jobs').getFullList<SyncJob>({
        filter: 'status="running" || status="queued"',
        sort: '-created',
      });
      const map: Record<string, SyncJob> = {};
      for (const job of jobs) {
        map[job.source_id] = job;
      }
      setActiveJobs(map);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadActiveJobs();
    const unsub = pb.collection('sync_jobs').subscribe('*', () => {
      loadActiveJobs();
    });
    return () => { unsub.then((u: () => void) => u()); };
  }, []);

  const handleSync = async (sourceId: string) => {
    setSyncing((prev) => ({ ...prev, [sourceId]: true }));
    try {
      const res = await fetch(`${WORKER_BASE}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId }),
      });
      if (!res.ok) throw new Error('Sync request failed');
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setSyncing((prev) => ({ ...prev, [sourceId]: false }));
    }
  };

  const handleSyncChecked = () => {
    setMenuOpen(false);
    for (const id of checked) {
      handleSync(id);
    }
  };

  const handleDeleteChecked = async () => {
    setDeleteOpen(false);
    setDeletingChecked(true);
    setDeleteError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pb.authStore.token) headers['Authorization'] = pb.authStore.token;
      const res = await fetch('/api/cascade-delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ source_ids: [...checked] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error: ${res.status}`);
      }
      setChecked(new Set());
      // reload
      setSources(prev => prev.filter(s => !checked.has(s.id)));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingChecked(false);
    }
  };

  const handleCancel = async (sourceId: string) => {
    setSyncing((prev) => ({ ...prev, [sourceId]: false }));
    try {
      await fetch(`${WORKER_BASE}/api/sync/${sourceId}/cancel`, { method: 'POST' });
      loadActiveJobs();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const handleRowClick = (source: Source) => {
    navigate(`/app/dashboard/${source.id}`);
  };

  const hasActiveSyncs = Object.keys(activeJobs).length > 0 || Object.values(syncing).some(Boolean);

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      {!loading && (
        <p className="text-sm text-muted-foreground">
          {stats.sources.toLocaleString()} source{stats.sources !== 1 ? 's' : ''} · {stats.channels.toLocaleString()} channels · {stats.movies.toLocaleString()} movies · {stats.series.toLocaleString()} series · {stats.episodes.toLocaleString()} episodes
        </p>
      )}

      {/* Sources list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sources</CardTitle>
            {checked.size > 0 && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  {checked.size} selected
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 rounded-md border bg-card shadow-lg z-50">
                    <div className="py-1">
                      <button
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={handleSyncChecked}
                      >
                        <RefreshCw className="h-4 w-4" /> Sync Selected
                      </button>
                      <button
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4" /> Delete Selected
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search bar */}
            <div className="flex items-center gap-4">
              <Input
                placeholder="Search sources..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="max-w-sm"
              />
              <span className="text-sm text-muted-foreground">
                {totalItems.toLocaleString()} source{totalItems !== 1 ? 's' : ''}
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={sources.length > 0 && checked.size === sources.length}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-input cursor-pointer accent-primary"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Connections</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Movies</TableHead>
                  <TableHead>Series</TableHead>
                  <TableHead>Last Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : sources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No sources found. Use the settings menu to add sources.</TableCell>
                  </TableRow>
                ) : (
                  sources.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(s)}
                    >
                      <TableCell onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked.has(s.id)}
                          onChange={() => toggleCheck(s.id)}
                          className="h-4 w-4 rounded border-input cursor-pointer accent-primary"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell><Badge variant="secondary">{s.type}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'active' ? 'success' : s.status === 'pending' ? 'warning' : s.status === 'error' ? 'destructive' : 'secondary'}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.max_connections ?? '-'}</TableCell>
                      <TableCell>{formatDateTime(s.expiry_date)}</TableCell>
                      <TableCell>{counts[s.id]?.channels ?? '-'}</TableCell>
                      <TableCell>{counts[s.id]?.movies ?? '-'}</TableCell>
                      <TableCell>{counts[s.id]?.series ?? '-'}</TableCell>
                      <TableCell>{formatDateTime(s.last_sync)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !deletingChecked && setDeleteOpen(false)}>
          <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Delete {checked.size} source{checked.size !== 1 ? 's' : ''}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete the selected sources and all their related data
              (channels, movies, series, categories, sync jobs).
            </p>
            <p className="mt-3 text-sm font-medium text-destructive">This action cannot be undone.</p>
            {deleteError && <p className="mt-2 text-sm text-destructive">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 border"
                onClick={() => setDeleteOpen(false)}
                disabled={deletingChecked}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2"
                onClick={handleDeleteChecked}
                disabled={deletingChecked}
              >
                {deletingChecked ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
