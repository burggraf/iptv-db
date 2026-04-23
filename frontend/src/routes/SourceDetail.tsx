import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Source, SyncJob, Category, Channel } from '../types/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import { formatDateTime, formatDate, proxyImageUrl } from '../lib/utils';
import ChannelDetailModal from '../components/ChannelDetailModal';

export default function SourceDetail() {
  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<Source | null>(null);
  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [selectedLiveCat, setSelectedLiveCat] = useState('');
  const [liveChannels, setLiveChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

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
    let cancelled = false;
    const load = async () => {
      const filterParts = [`source_id="${id}"`, 'available=true'];
      if (selectedLiveCat) filterParts.push(`category_id="${selectedLiveCat}"`);
      if (search) filterParts.push(`name ~ "${search}"`);
      try {
        const res = await pb.collection('channels').getList<Channel>(1, 100, {
          filter: filterParts.join(' && '),
          sort: 'name',
        });
        if (!cancelled) setLiveChannels(res.items);
      } catch (err) {
        if (isAbortError(err)) return;
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, selectedLiveCat, search]);

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
            <div className="flex gap-2">
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
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48"
            />
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
          <Table>
            <TableHeader>
              <TableRow>
                {['Name', 'Country', 'EPG ID', 'Added'].map((h) => <TableHead key={h}>{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {liveChannels.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No items found.</TableCell></TableRow>
              ) : (
                liveChannels.map((ch) => (
                  <TableRow key={ch.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedChannelId(ch.id)}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {(() => { const logoUrl = proxyImageUrl(ch.logo); return logoUrl ? <img src={logoUrl} alt="" className="w-5 h-5 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null; })()}
                        {ch.name}
                      </span>
                    </TableCell>
                    <TableCell>{ch.tvg_country || '—'}</TableCell>
                    <TableCell>{ch.epg_id || '—'}</TableCell>
                    <TableCell>{ch.added || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Link to="/app/dashboard">
        <Button variant="outline">← Back to Dashboard</Button>
      </Link>

      <ChannelDetailModal channelId={selectedChannelId} onClose={() => setSelectedChannelId(null)} />
    </div>
  );
}
