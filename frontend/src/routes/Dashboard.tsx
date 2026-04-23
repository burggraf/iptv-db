import { useState, useEffect } from 'react';
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
  Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { formatDateTime } from '../lib/utils';

const PAGE_SIZE = 100;

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

  // Delete all sources confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
    return () => { cancelled = true; };
  }, [sources]);

  // Close dropdown on outside click

  const handleRowClick = (source: Source) => {
    navigate(`/app/dashboard/${source.id}`);
  };

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
      const result = await res.json();
      console.log('Cascade delete result:', result.deleted);
    } catch (err) {
      console.error('Delete all sources failed:', err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown error');
      setDeleting(false);
      return;
    }

    // Reload stats and sources
    try {
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
      console.error('Failed to reload stats:', err);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

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
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              🗑️ Delete All
            </Button>
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
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">{s.base_url || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'active' ? 'success' : s.status === 'error' ? 'destructive' : 'secondary'}>
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
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteAllSources} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete Everything'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

