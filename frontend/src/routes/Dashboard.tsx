import { useState, useEffect } from 'react';
import { pb, pbCall, isAbortError } from '../lib/pocketbase';
import type { Source, SyncJob } from '../types/database';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { formatDateTime } from '../lib/utils';

export default function Dashboard() {
  const [stats, setStats] = useState({
    sources: 0,
    channels: 0,
    movies: 0,
    series: 0,
    episodes: 0,
  });
  const [recentJobs, setRecentJobs] = useState<(SyncJob & { expand?: { source_id: Source } })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Get counts
        const [sourcesRes, channelsRes, moviesRes, seriesRes, episodesRes] = await Promise.all([
          pb.collection('sources').getList(1, 1, { filter: '1=1' }),
          pb.collection('channels').getList(1, 1, { filter: 'available = true' }),
          pb.collection('movies').getList(1, 1, { filter: 'available = true' }),
          pb.collection('series').getList(1, 1, { filter: 'available = true' }),
          pb.collection('series_episodes').getList(1, 1, { filter: 'available = true' }),
        ]);

        // Recent sync jobs
        const jobsRes = await pb.collection('sync_jobs').getList(1, 10, {
          sort: '-created',
          expand: 'source_id',
        });

        if (!cancelled) {
          setStats({
            sources: sourcesRes.totalItems,
            channels: channelsRes.totalItems,
            movies: moviesRes.totalItems,
            series: seriesRes.totalItems,
            episodes: episodesRes.totalItems,
          });
          setRecentJobs(jobsRes.items);
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

  // Subscribe to sync job updates
  useEffect(() => {
    const unsub = pb.collection('sync_jobs').subscribe('*', () => {
      // Refresh recent jobs on any sync job change; abort errors are silently ignored
      pbCall(() =>
        pb.collection('sync_jobs').getList(1, 10, {
          sort: '-created',
          expand: 'source_id',
        })
      ).then((res) => {
        if (res) setRecentJobs(res.items);
      }).catch(() => { /* non-abort errors suppressed for realtime updates */ });
    });
    return () => { unsub.then((u) => u()); };
  }, []);

  if (loading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Sources" value={stats.sources} />
        <StatCard label="Channels" value={stats.channels} />
        <StatCard label="Movies" value={stats.movies} />
        <StatCard label="Series" value={stats.series} />
        <StatCard label="Episodes" value={stats.episodes} />
      </div>

      {/* Recent sync activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sync Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sync jobs yet.</p>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job) => (
                <div key={job.id} className="flex items-center gap-4 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {job.expand?.source_id?.name || 'Unknown'}
                      </span>
                      <SyncStatusBadge status={job.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {job.phase || ''}
                    </p>
                  </div>
                  <div className="w-32 shrink-0">
                    {job.status === 'running' && (
                      <Progress value={job.progress || 0} className="h-2" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(job.created)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  const variant = {
    queued: 'secondary',
    running: 'default',
    completed: 'success',
    failed: 'destructive',
    cancelled: 'outline',
  }[status] as 'default' | 'secondary' | 'destructive' | 'outline' | 'success';

  return <Badge variant={variant}>{status}</Badge>;
}
