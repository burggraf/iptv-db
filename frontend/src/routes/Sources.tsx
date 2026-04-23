import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Source } from '../types/database';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { formatDateTime } from '../lib/utils';

export default function Sources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [counts, setCounts] = useState<Record<string, { channels: number; movies: number; series: number }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await pb.collection('sources').getFullList({ sort: '-created' });
        if (!cancelled) setSources(res as Source[]);
      } catch (err) {
        if (!isAbortError(err)) console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load counts for each source
  useEffect(() => {
    if (sources.length === 0) return;
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
      setCounts(newCounts);
    };
    loadCounts();
  }, [sources]);

  const filtered = sources.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.base_url || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search sources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground">{sources.length} source{sources.length !== 1 ? 's' : ''}</span>
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
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={11} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
          ) : filtered.length === 0 ? (
            <TableRow><TableCell colSpan={11} className="h-24 text-center text-muted-foreground">No sources found. Add one in Settings.</TableCell></TableRow>
          ) : (
            filtered.map((s) => (
              <TableRow key={s.id}>
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
                <TableCell>
                  <Link to={`/app/sources/${s.id}`}>
                    <Button variant="ghost" size="sm">View</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
