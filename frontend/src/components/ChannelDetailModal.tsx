import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';
import type { ChannelExpanded, Source, Category } from '../types/database';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { proxyImageUrl } from '../lib/utils';

interface ChannelDetailModalProps {
  channelId: string | null;
  onClose: () => void;
}

function StreamUrls({ base, username, password, streamId }: { base: string; username: string; password: string; streamId: number }) {
  const [copied, setCopied] = useState<string | null>(null);

  const urls = [
    { ext: 'm3u8', url: `${base}/live/${username}/${password}/${streamId}.m3u8` },
    { ext: 'ts', url: `${base}/live/${username}/${password}/${streamId}.ts` },
  ];

  const copy = async (ext: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(ext);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-1">
      {urls.map(({ ext, url }) => (
        <div key={ext} className="flex items-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all text-xs font-mono">
            …/{streamId}.{ext}
          </a>
          <button
            onClick={() => copy(ext, url)}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs border hover:bg-muted transition-colors"
            title="Copy full URL"
          >
            {copied === ext ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground mt-1">If VLC fails, try the .ts variant or check if the stream is currently broadcasting.</p>
    </div>
  );
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
    { label: 'Logo (preview)', value: channel?.logo ? (
      <img src={proxyImageUrl(channel.logo) ?? ''} alt="" className="w-16 h-16 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
    ) : '—' },
    { label: 'EPG ID', value: channel?.epg_id || '—' },
    { label: 'TVG ID', value: channel?.tvg_id || '—' },
    { label: 'Country', value: channel?.tvg_country || '—' },
    { label: 'Added', value: channel?.added || '—' },
    { label: 'Stream URL', value: source && channel?.stream_id ? (
      <StreamUrls base={source.base_url} username={source.username} password={source.password} streamId={channel.stream_id} />
    ) : '—'},
    { label: 'Available', value: channel?.available ? <Badge variant="success">Yes</Badge> : <Badge variant="destructive">No</Badge> },
    { label: 'Source', value: source ? source.name : '—' },
    { label: 'Category', value: category ? category.name : '—' },
    { label: 'Created', value: channel?.created ? new Date(channel.created).toLocaleString() : '—' },
    { label: 'Updated', value: channel?.updated ? new Date(channel.updated).toLocaleString() : '—' },
  ];

  return (
    <Dialog open={!!channelId} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Increase max-width for URLs */}
      <style>{`[role="dialog"] { max-width: min(90vw, 560px) !important; }`}</style>
      <DialogHeader>
        <DialogTitle>
          <div className="flex items-center gap-2">
            {(() => { const logoUrl = proxyImageUrl(channel?.logo); return logoUrl && <img src={logoUrl} alt="" className="w-6 h-6 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />; })()}
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
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}
