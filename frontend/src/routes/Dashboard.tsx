import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Source } from '../types/database';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import {
  Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter,
} from '../components/ui/dialog';
import { formatDateTime } from '../lib/utils';

const PAGE_SIZE = 100;

// Collections to cascade delete when removing all sources, in dependency order
const CASCADE_COLLECTIONS = [
  'series_episodes', // references series (not source directly)
  'channels',        // references source
  'movies',          // references source
  'series',          // references source
  'categories',      // references source
  'sync_jobs',       // references source
];

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

  // Settings dropdown state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Delete all sources confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState('');

  // Load stats
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

  // Load paginated sources
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let filter = '1=1';
        if (search) {
          filter = `name ~ "${search}" || base_url ~ "${search}"`;
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

  // Load counts for visible sources
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

  // Close dropdown on outside click
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

  const handleRowClick = (source: Source) => {
    navigate(`/app/dashboard/${source.id}`);
  };

  const handleDeleteAllSources = async () => {
    setDeleting(true);
    try {
      // Phase 1: Delete cascade collections
      for (const collection of CASCADE_COLLECTIONS) {
        setDeleteProgress(`Deleting all ${collection}...`);
        const records = await pb.collection(collection).getFullList(5000);
        const ids = records.map((r: { id: string }) => r.id);
        await Promise.all(ids.map((id: string) => pb.collection(collection).delete(id)));
      }

      // Phase 2: Delete sources
      setDeleteProgress('Deleting all sources...');
      const sourceRecords = await pb.collection('sources').getFullList(5000);
      const sourceIds = sourceRecords.map((r: { id: string }) => r.id);
      await Promise.all(sourceIds.map((id: string) => pb.collection('sources').delete(id)));

      setDeleteProgress('Done!');
      // Reload stats and sources
      const [sourcesRes, channelsRes, moviesRes, seriesRes, episodesRes] = await Promise.all([
        pb.collection('sources').getList(1, 1, { filter: '1=1' }),
        pb.collection('channels').getList(1, 1, { filter: 'available = true' }),
        pb.collection('movies').getList(1, 1, { filter: 'available = true' }),
        pb.collection('series').getList(1, 1, { filter: 'available = true' }),
        pb.collection('series_episodes').getList(1, 1, { filter: 'available = true' }),
      ]);
      setStats({
        sources: sourcesRes.totalItems,
        channels: channelsRes.totalItems,
        movies: moviesRes.totalItems,
        series: seriesRes.totalItems,
        episodes: episodesRes.totalItems,
      });
      setSources([]);
      setTotalPages(1);
      setTotalItems(0);
      setPage(1);
    } catch (err) {
      console.error('Delete all sources failed:', err);
      setDeleteProgress('Error during deletion. Check console.');
    } finally {
      setDeleting(false);
      // Keep dialog open briefly to show completion/error, then close
      setTimeout(() => {
        setDeleteDialogOpen(false);
        setDeleteProgress('');
      }, 1500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Sources" value={stats.sources} loading={loading} />
        <StatCard label="Channels" value={stats.channels} loading={loading} />
        <StatCard label="Movies" value={stats.movies} loading={loading} />
        <StatCard label="Series" value={stats.series} loading={loading} />
        <StatCard label="Episodes" value={stats.episodes} loading={loading} />
      </div>

      {/* Sources list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sources</CardTitle>

            {/* Settings dropdown */}
            <div className="relative" ref={settingsRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(!settingsOpen)}
              >
                ⚙️ Settings
              </Button>
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-md border bg-card shadow-lg z-50">
                  <div className="py-1">
                    <button
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => {
                        setSettingsOpen(false);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      🗑️ Delete All Sources
                    </button>
                  </div>
                </div>
              )}
            </div>
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
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Base URL</TableHead>
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
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No sources found. Add one in Settings.</TableCell>
                  </TableRow>
                ) : (
                  sources.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(s)}
                    >
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell><Badge variant="secondary">{s.type}</Badge></TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">{s.base_url || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'active' ? 'success' : s.status === 'error' ? 'destructive' : 'secondary'}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.max_connections ?? '—'}</TableCell>
                      <TableCell>{formatDateTime(s.expiry_date)}</TableCell>
                      <TableCell>{counts[s.id]?.channels ?? '—'}</TableCell>
                      <TableCell>{counts[s.id]?.movies ?? '—'}</TableCell>
                      <TableCell>{counts[s.id]?.series ?? '—'}</TableCell>
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

      {/* Delete All Sources confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !deleting && setDeleteDialogOpen(open)}>
        <DialogHeader>
          <DialogTitle>Delete All Sources</DialogTitle>
          {deleting ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{deleteProgress}</p>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary animate-pulse rounded-full" style={{ width: '60%' }} />
              </div>
            </div>
          ) : (
            <>
              <DialogDescription>
                This will permanently delete all sources and all their related data, including:
              </DialogDescription>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 mt-2">
                <li>All channels</li>
                <li>All movies</li>
                <li>All series and episodes</li>
                <li>All categories</li>
                <li>All sync job records</li>
              </ul>
              <p className="text-sm text-destructive font-medium mt-3">
                This action cannot be undone.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteAllSources}>
                  Delete Everything
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogHeader>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{loading ? '—' : value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}
