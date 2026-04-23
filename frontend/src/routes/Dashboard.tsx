import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Source, SyncJob } from '../types/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import { formatDateTime } from '../lib/utils';

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

  // Sync status state
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [activeJobs, setActiveJobs] = useState<Record<string, SyncJob>>({});

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

  // --- Sync status: load active jobs + realtime subscription ---
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

  const handleSyncAll = async () => {
    for (const s of sources.filter((s) => s.status !== 'error')) {
      handleSync(s.id);
    }
  };

  const handleCancel = async (sourceId: string) => {
    setSyncing((prev) => ({ ...prev, [sourceId]: false }));
    try {
      await fetch(`${WORKER_BASE}/api/sync/${sourceId}/cancel`, {
        method: 'POST',
      });
      loadActiveJobs();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const handleCancelAll = async () => {
    for (const s of sources) {
      if (activeJobs[s.id] || syncing[s.id]) {
        handleCancel(s.id);
      }
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

      {/* Sync status - only shown when sources are actively syncing */}
      {hasActiveSyncs && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Sync Status</CardTitle>
              <CardDescription>Active sync jobs across all sources.</CardDescription>
            </div>
            <div className="flex gap-2">
              {(() => {
                const runningCount = sources.filter(s => activeJobs[s.id] || syncing[s.id]).length;
                return runningCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={handleCancelAll}>
                    Cancel All ({runningCount})
                  </Button>
                ) : null;
              })()}
              <Button size="sm" onClick={handleSyncAll} disabled={sources.length === 0}>
                Sync All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Sync Progress</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.filter(s => activeJobs[s.id] || syncing[s.id]).map((s) => {
                  const job = activeJobs[s.id];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell><Badge variant="secondary">{s.type}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'active' ? 'success' : s.status === 'error' ? 'destructive' : 'secondary'}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(s.last_sync)}</TableCell>
                      <TableCell className="text-sm">
                        {job ? (
                          <div className="w-40">
                            <span className="text-xs text-muted-foreground">{job.phase}</span>
                            <div className="h-1.5 mt-1 w-full overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${job.progress || 0}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Starting...</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleCancel(s.id)}
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Sources list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sources</CardTitle>
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
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No sources found. Use the settings menu to add sources.</TableCell>
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
    </div>
  );
}
