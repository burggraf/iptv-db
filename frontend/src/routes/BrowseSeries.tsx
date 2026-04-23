import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Category, Series, Source } from '../types/database';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

export default function BrowseSeries() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [series, setSeriesData] = useState<Series[]>([]);
  const [seriesSources, setSeriesSources] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState(categoryId || '');
  const [selectedSource, setSelectedSource] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const PER_PAGE = 50;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [cats, srcs] = await Promise.all([
          pb.collection('categories').getFullList<Category>({ filter: 'type="series"', sort: 'name' }),
          pb.collection('sources').getFullList<Source>({ sort: 'name' }),
        ]);
        if (!cancelled) {
          setCategories(cats);
          setSources(srcs);
        }
      } catch (err) {
        if (!isAbortError(err)) console.error(err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const filterParts = ['available=true'];
      if (selectedCategory) filterParts.push(`category_id="${selectedCategory}"`);
      if (selectedSource) filterParts.push(`source_id="${selectedSource}"`);
      if (search) filterParts.push(`name ~ "${search}"`);

      try {
        const res = await pb.collection('series').getList<Series>(page, PER_PAGE, {
          filter: filterParts.join(' && '),
          sort: 'name',
          expand: 'source_id',
        });
        if (!cancelled) {
          setSeriesData(res.items);
          setTotalPages(res.totalPages);
          setTotalItems(res.totalItems);
          const srcMap: Record<string, string> = { ...seriesSources };
          for (const s of res.items) {
            if (s.expand?.source_id) srcMap[s.source_id] = s.expand.source_id.name;
          }
          setSeriesSources(srcMap);
        }
      } catch (err) {
        if (!isAbortError(err)) console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
  }, [selectedCategory, selectedSource, search, page]);

  useEffect(() => { if (categoryId) setSelectedCategory(categoryId); }, [categoryId]);

  return (
    <div className="flex gap-6">
      <div className="w-56 shrink-0 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Category</label>
          <Select value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }} className="w-full">
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Source</label>
          <Select value={selectedSource} onChange={(e) => { setSelectedSource(e.target.value); setPage(1); }} className="w-full">
            <option value="">All Sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        <div className="flex items-center gap-4">
          <Input placeholder="Search series..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="max-w-sm" />
          <span className="text-sm text-muted-foreground">{totalItems.toLocaleString()} series</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Genre</TableHead>
              <TableHead>Rating</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : series.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No series found.</TableCell></TableRow>
            ) : (
              series.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="secondary">{seriesSources[s.source_id] || s.source_id.slice(0, 8)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{categories.find((c) => c.id === s.category_id)?.name || '—'}</TableCell>
                  <TableCell>{s.year || '—'}</TableCell>
                  <TableCell>{s.genre || '—'}</TableCell>
                  <TableCell>{s.rating ? `${s.rating}/10` : '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
