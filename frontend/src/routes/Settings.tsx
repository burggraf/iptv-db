import { useState, useEffect } from 'react';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Source, SyncJob } from '../types/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import { formatDateTime } from '../lib/utils';

// Worker is proxied through Vite dev server or nginx at /worker/
const WORKER_BASE = '/worker';

export default function Settings() {
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{ added: number; updated: number } | null>(null);
  const [scrapeError, setScrapeError] = useState('');

  const [sources, setSources] = useState<Source[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [activeJobs, setActiveJobs] = useState<Record<string, SyncJob>>({});

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    const unsub = pb.collection('sync_jobs').subscribe('*', () => {
      loadSources();
      loadActiveJobs();
    });
    return () => { unsub.then((u: () => void) => u()); };
  }, []);

  const loadSources = async () => {
    try {
      const res = await pb.collection('sources').getFullList<Source>({ sort: '-created' });
      setSources(res);
    } catch (err) {
      if (isAbortError(err)) return;
      console.error(err);
    }
  };

  const loadActiveJobs = async () => {
    try {
      const res = await pb.collection('sync_jobs').getFullList<SyncJob>({
        filter: 'status="running" || status="queued"',
        sort: '-created',
      });
      const map: Record<string, SyncJob> = {};
      for (const job of res.items) {
        map[job.source_id] = job;
      }
      setActiveJobs(map);
    } catch (err) {
      if (isAbortError(err)) return;
      /* skip */
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeResult(null);
    setScrapeError('');
    try {
      const res = await fetch(`${WORKER_BASE}/api/scrape`, {
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
      loadSources();
    } catch (err: unknown) {
      setScrapeError(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Scrape URL */}
      <Card>
        <CardHeader>
          <CardTitle>Add Sources from URL</CardTitle>
          <CardDescription>
            Paste a blog URL containing Xtream accounts or M3U links to scrape new sources.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="https://www.iptvregion.eu.org/2026/04/..."
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleScrape} disabled={scraping || !scrapeUrl.trim()}>
              {scraping ? 'Scraping...' : 'Scrape'}
            </Button>
          </div>
          {scrapeResult && (
            <p className="mt-2 text-sm text-green-600">
              Added {scrapeResult.added} sources, updated {scrapeResult.updated}.
            </p>
          )}
          {scrapeError && (
            <p className="mt-2 text-sm text-destructive">{scrapeError}</p>
          )}
        </CardContent>
      </Card>

      {/* Sync all */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sync Sources</CardTitle>
            <CardDescription>Manually trigger catalog sync for each source.</CardDescription>
          </div>
          <Button onClick={handleSyncAll} disabled={sources.length === 0}>
            Sync All
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Sync Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => {
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
                          <Progress value={job.progress || 0} className="h-1.5 mt-1" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{s.sync_status || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSync(s.id)}
                        disabled={syncing[s.id] || !!job}
                      >
                        {syncing[s.id] ? 'Starting...' : 'Sync'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
