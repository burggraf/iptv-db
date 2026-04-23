import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { pb, isAbortError } from '../lib/pocketbase';
import type { Category, Channel, Source } from '../types/database';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

export default function BrowseChannels() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelSources, setChannelSources] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState(categoryId || '');
  const [selectedSource, setSelectedSource] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const PER_PAGE = 50;

  // Load categories and sources
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [cats, srcs] = await Promise.all([
          pb.collection('categories').getFullList<Category>({ filter: 'type="live"', sort: 'name' }),
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

  // Load channels
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const filterParts = ['available=true'];
      if (selectedCategory) filterParts.push(`category_id="${selectedCategory}"`);
      if (selectedSource) filterParts.push(`source_id="${selectedSource}"`);
      if (search) filterParts.push(`name ~ "${search}"`);

      try {
        const res = await pb.collection('channels').getList<Channel>(page, PER_PAGE, {
          filter: filterParts.join(' && '),
          sort: 'name',
          expand: 'source_id',
        });
        if (!cancelled) {
          setChannels(res.items);
          setTotalPages(res.totalPages);
          setTotalItems(res.totalItems);
          // Cache source names
          const srcMap: Record<string, string> = { ...channelSources };
          for (const ch of res.items) {
            if (ch.expand?.source_id) {
              srcMap[ch.source_id] = ch.expand.source_id.name;
            }
          }
          setChannelSources(srcMap);
        }
      } catch (err) {
        if (!isAbortError(err)) console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
  }, [selectedCategory, selectedSource, search, page]);

  useEffect(() => {
    if (categoryId) setSelectedCategory(categoryId);
  }, [categoryId]);

  const handleCategoryChange = (val: string) => {
    setSelectedCategory(val);
    setPage(1);
  };

  const handleSourceChange = (val: string) => {
    setSelectedSource(val);
    setPage(1);
  };

  return (
    <div className="flex gap-6">
      {/* Sidebar filters */}
      <div className="w-56 shrink-0 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Category</label>
          <Select value={selectedCategory} onChange={(e) => handleCategoryChange(e.target.value)} className="w-full">
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Source</label>
          <Select value={selectedSource} onChange={(e) => handleSourceChange(e.target.value)} className="w-full">
            <option value="">All Sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search channels..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-sm"
          />
          <span className="text-sm text-muted-foreground">{totalItems.toLocaleString()} channels</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>EPG ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : channels.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No channels found.</TableCell></TableRow>
            ) : (
              channels.map((ch) => (
                <TableRow key={ch.id}>
                  <TableCell className="font-medium">{ch.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{channelSources[ch.source_id] || ch.source_id.slice(0, 8)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {categories.find((c) => c.id === ch.category_id)?.name || '—'}
                  </TableCell>
                  <TableCell>{ch.tvg_country || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{ch.epg_id || '—'}</TableCell>
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
