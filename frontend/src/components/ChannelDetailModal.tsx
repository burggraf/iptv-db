import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';
import type { ChannelExpanded, Source, Category } from '../types/database';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from './ui/dialog';
import { Badge } from './ui/badge';

interface ChannelDetailModalProps {
  channelId: string | null;
  onClose: () => void;
}

export default function ChannelDetailModal({ channelId, onClose }: ChannelDetailModalProps) {
  const [channel, setChannel] = useState<ChannelExpanded | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!channelId) {
      setChannel(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const record = await pb.collection('channels').getOne<ChannelExpanded>(channelId, {
          expand: 'source_id,category_id',
        });
        if (!cancelled) setChannel(record);
      } catch (err) {
        console.error('Failed to load channel:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [channelId]);

  const source = channel?.expand?.source_id as Source | undefined;
  const category = channel?.expand?.category_id as Category | undefined;

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'ID', value: channel?.id },
    { label: 'Stream ID', value: channel?.stream_id },
    { label: 'Name', value: channel?.name },
    { label: 'Logo', value: channel?.logo ? (
      <a href={channel.logo} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{channel.logo}</a>
    ) : '—' },
    { label: 'EPG ID', value: channel?.epg_id || '—' },
    { label: 'TVG ID', value: channel?.tvg_id || '—' },
    { label: 'Country', value: channel?.tvg_country || '—' },
    { label: 'Added', value: channel?.added || '—' },
    { label: 'Available', value: channel?.available ? <Badge variant="success">Yes</Badge> : <Badge variant="destructive">No</Badge> },
    { label: 'Source', value: source ? source.name : '—' },
    { label: 'Category', value: category ? category.name : '—' },
    { label: 'Created', value: channel?.created ? new Date(channel.created).toLocaleString() : '—' },
    { label: 'Updated', value: channel?.updated ? new Date(channel.updated).toLocaleString() : '—' },
  ];

  return (
    <Dialog open={!!channelId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogHeader>
        <DialogTitle>
          <div className="flex items-center gap-2">
            {channel?.logo && (
              <img src={channel.logo} alt="" className="w-6 h-6 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
            )}
            {loading ? 'Loading...' : channel?.name || 'Channel Details'}
          </div>
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : channel ? (
          <div className="space-y-0 divide-y">
            {fields.map((f) => (
              <div key={f.label} className="flex gap-4 py-2 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{f.label}</span>
                <span className="break-all">{f.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
