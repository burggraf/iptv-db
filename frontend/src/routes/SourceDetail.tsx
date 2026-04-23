import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Source, Category, Channel, Movie, Series } from '../types/database';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import { formatDateTime, formatDate } from '../lib/utils';

export default function SourceDetail() {
  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<Source | null>(null);
  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [vodCategories, setVodCategories] = useState<Category[]>([]);
  const [seriesCategories, setSeriesCategories] = useState<Category[]>([]);
  const [selectedLiveCat, setSelectedLiveCat] = useState('');
  const [selectedVodCat, setSelectedVodCat] = useState('');
  const [selectedSeriesCat, setSelectedSeriesCat] = useState('');
  const [liveChannels, setLiveChannels] = useState<Channel[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeriesData] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const src = await pb.collection('sources').getOne<Source>(id);
        if (!cancelled) setSource(src);

        // Use raw fetch — pb.collection().getList() causes ERR_ABORTED
        // in PocketBase SDK v0.25.2 when called on the categories collection.
        const headers: Record<string, string> = {};
        if (pb.authStore.token) headers['Authorization'] = pb.authStore.token;
        const fetchCats = async (type: string) => {
          const url = `/api/collections/categories/records?page=1&perPage=500&filter=${encodeURIComponent(`source_id="${id}" && type="${type}"`)}`;
          const res = await fetch(url, { headers });
          if (!res.ok) throw new Error(`Failed to fetch ${type} categories: ${res.status}`);
          return res.json();
        };
        const [liveCatsData, vodCatsData, seriesCatsData] = await Promise.all([
          fetchCats('live'),
          fetchCats('vod'),
          fetchCats('series'),
        ]);
        if (!cancelled) {
          setLiveCategories(liveCatsData.items as Category[]);
          setVodCategories(vodCatsData.items as Category[]);
          setSeriesCategories(seriesCatsData.items as Category[]);
        }
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
        /* skip */
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, selectedLiveCat, search]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      const filterParts = [`source_id="${id}"`, 'available=true'];
      if (selectedVodCat) filterParts.push(`category_id="${selectedVodCat}"`);
      if (search) filterParts.push(`name ~ "${search}"`);
      try {
        const res = await pb.collection('movies').getList<Movie>(1, 100, {
          filter: filterParts.join(' && '),
          sort: 'name',
        });
        if (!cancelled) setMovies(res.items);
      } catch (err) {
        if (isAbortError(err)) return;
        /* skip */
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, selectedVodCat, search]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      const filterParts = [`source_id="${id}"`, 'available=true'];
      if (selectedSeriesCat) filterParts.push(`category_id="${selectedSeriesCat}"`);
      if (search) filterParts.push(`name ~ "${search}"`);
      try {
        const res = await pb.collection('series').getList<Series>(1, 100, {
          filter: filterParts.join(' && '),
          sort: 'name',
        });
        if (!cancelled) setSeriesData(res.items);
      } catch (err) {
        if (isAbortError(err)) return;
        /* skip */
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, selectedSeriesCat, search]);

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
              <Badge variant={source.status === 'active' ? 'success' : source.status === 'error' ? 'destructive' : 'secondary'}>
                {source.status}
              </Badge>
              <Badge variant="secondary">{source.type}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
          {source.sync_status && source.sync_status !== 'ok' && (
            <p className="mt-2 text-sm text-destructive">{source.sync_status}</p>
          )}
        </CardContent>
      </Card>

      {/* Content tabs */}
      <Tabs defaultValue="live">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="live">Live ({liveCategories.length})</TabsTrigger>
            <TabsTrigger value="vod">Movies ({vodCategories.length})</TabsTrigger>
            <TabsTrigger value="series">Series ({seriesCategories.length})</TabsTrigger>
          </TabsList>
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
          />
        </div>

        <TabsContent value="live">
          <div className="flex gap-4 mb-4">
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
          <ContentTable
            columns={['Name', 'Country', 'EPG ID', 'Added']}
            rows={liveChannels.map((ch) => [
              <span key={ch.id} className="flex items-center gap-2">
                {ch.logo && <img src={ch.logo} alt="" className="w-5 h-5 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                {ch.name}
              </span>,
              ch.tvg_country || '—',
              ch.epg_id || '—',
              ch.added || '—',
            ])}
          />
        </TabsContent>

        <TabsContent value="vod">
          <div className="flex gap-4 mb-4">
            <Select
              value={selectedVodCat}
              onChange={(e) => setSelectedVodCat(e.target.value)}
              className="w-64"
            >
              <option value="">All Categories</option>
              {vodCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <ContentTable
            columns={['Name', 'Year', 'Genre', 'Rating']}
            rows={movies.map((m) => [
              m.name,
              m.year || '—',
              m.genre || '—',
              m.rating ? `${m.rating}/10` : '—',
            ])}
          />
        </TabsContent>

        <TabsContent value="series">
          <div className="flex gap-4 mb-4">
            <Select
              value={selectedSeriesCat}
              onChange={(e) => setSelectedSeriesCat(e.target.value)}
              className="w-64"
            >
              <option value="">All Categories</option>
              {seriesCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <ContentTable
            columns={['Name', 'Year', 'Genre', 'Rating']}
            rows={series.map((s) => [
              s.name,
              s.year || '—',
              s.genre || '—',
              s.rating ? `${s.rating}/10` : '—',
            ])}
          />
        </TabsContent>
      </Tabs>

      <Link to="/app/dashboard">
        <Button variant="outline">← Back to Dashboard</Button>
      </Link>
    </div>
  );
}

function ContentTable({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((h) => <TableHead key={h}>{h}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">No items found.</TableCell></TableRow>
        ) : (
          rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => <TableCell key={j}>{cell}</TableCell>)}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
