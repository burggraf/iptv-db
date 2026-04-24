import { useState, useEffect, useCallback } from 'react';
import { pb } from '../lib/pocketbase';
import type { ChannelExpanded, Source, Category } from '../types/database';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { proxyImageUrl } from '../lib/utils';
import { Save, X, Pencil, Check, Loader2 } from 'lucide-react';

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

/** Inline-editable field */
function EditableField({
  label,
  value,
  editing,
  onStartEdit,
  onSave,
  onCancel,
  renderInput,
  displayValue,
}: {
  label: string;
  value: unknown;
  editing: boolean;
  onStartEdit: () => void;
  onSave: (val: string) => Promise<void>;
  onCancel: () => void;
  renderInput: (val: string, onChange: (v: string) => void) => React.ReactNode;
  displayValue: React.ReactNode;
}) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(String(value ?? '')); }, [value, editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-4 py-2 text-sm items-start">
      <span className="w-24 shrink-0 text-muted-foreground pt-1">{label}</span>
      <div className="flex-1 break-all">
        {editing ? (
          <div className="flex items-center gap-2">
            <div className="flex-1">{renderInput(draft, setDraft)}</div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 rounded p-1 text-green-600 hover:bg-muted transition-colors"
              title="Save"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={onCancel}
              className="shrink-0 rounded p-1 text-red-500 hover:bg-muted transition-colors"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group">
            <span>{displayValue}</span>
            <button
              onClick={onStartEdit}
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
              title="Edit"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChannelDetailModal({ channelId, onClose }: ChannelDetailModalProps) {
  const [channel, setChannel] = useState<ChannelExpanded | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const reload = useCallback(async (cid: string) => {
    try {
      const record = await pb.collection('channels').getOne<ChannelExpanded>(cid, {
        expand: 'source_id,category_id',
      });
      setChannel(record);
    } catch (err) {
      console.error('Failed to load channel:', err);
    }
  }, []);

  useEffect(() => {
    if (!channelId) {
      setChannel(null);
      setEditingField(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      await reload(channelId);
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [channelId, reload]);

  // Load categories for the source when channel loads
  useEffect(() => {
    if (!channel) return;
    const src = channel.expand?.source_id as Source | undefined;
    if (!src?.id) return;
    let cancelled = false;
    const loadCats = async () => {
      try {
        const res = await pb.collection('categories').getList<Category>(1, 500, {
          filter: `source_id="${src.id}"`,
        });
        if (!cancelled) setCategories(res.items);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    loadCats();
    return () => { cancelled = true; };
  }, [channel]);

  const handleSave = async (field: string, value: string) => {
    if (!channelId) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      // Convert boolean
      if (field === 'available') {
        body[field] = value === 'true';
      } else {
        body[field] = value;
      }
      await pb.collection('channels').update(channelId, body);
      await reload(channelId);
      setEditingField(null);
    } catch (err) {
      console.error('Failed to update channel:', err);
    } finally {
      setSaving(false);
    }
  };

  const source = channel?.expand?.source_id as Source | undefined;
  const category = channel?.expand?.category_id as Category | undefined;

  const readonlyFields = [
    { label: 'ID', value: channel?.id },
    { label: 'Stream ID', value: channel?.stream_id },
    { label: 'Stream URL', value: source && channel?.stream_id ? (
      <StreamUrls base={source.base_url} username={source.username} password={source.password} streamId={channel.stream_id} />
    ) : '—'},
    { label: 'Source', value: source ? source.name : '—' },
    { label: 'Created', value: channel?.created ? new Date(channel.created).toLocaleString() : '—' },
    { label: 'Updated', value: channel?.updated ? new Date(channel.updated).toLocaleString() : '—' },
  ];

  const editableFields = [
    { label: 'Name', field: 'name', value: channel?.name || '' },
    { label: 'Logo', field: 'logo', value: channel?.logo || '' },
    { label: 'EPG ID', field: 'epg_id', value: channel?.epg_id || '' },
    { label: 'TVG ID', field: 'tvg_id', value: channel?.tvg_id || '' },
    { label: 'Country', field: 'tvg_country', value: channel?.tvg_country || '' },
    { label: 'Added', field: 'added', value: channel?.added || '' },
  ];

  return (
    <Dialog open={!!channelId} onOpenChange={(open) => { if (!open) onClose(); }}>
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
            {/* Read-only fields */}
            {readonlyFields.map((f) => (
              <div key={f.label} className="flex gap-4 py-2 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{f.label}</span>
                <span className="break-all">{f.value}</span>
              </div>
            ))}

            {/* Logo preview */}
            {channel?.logo && (
              <div className="flex gap-4 py-2 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">Preview</span>
                <img src={proxyImageUrl(channel.logo) ?? ''} alt="" className="w-16 h-16 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
              </div>
            )}

            {/* Editable fields */}
            {editableFields.map(({ label, field, value }) => (
              <EditableField
                key={field}
                label={label}
                value={value}
                editing={editingField === field}
                onStartEdit={() => { setEditingField(field); }}
                onCancel={() => setEditingField(null)}
                onSave={(v) => handleSave(field, v)}
                renderInput={(val, onChange) => (
                  <Input
                    value={val}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.closest('.flex')?.querySelector<HTMLButtonElement>('button[title="Save"]')?.click(); if (e.key === 'Escape') setEditingField(null); }}
                    className="h-8 text-sm"
                  />
                )}
                displayValue={
                  field === 'logo' && value
                    ? <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{value}</a>
                    : value || <span className="text-muted-foreground">—</span>
                }
              />
            ))}

            {/* Category (special: dropdown) */}
            <EditableField
              label="Category"
              value={category?.name || ''}
              editing={editingField === 'category_id'}
              onStartEdit={() => setEditingField('category_id')}
              onCancel={() => setEditingField(null)}
              onSave={(v) => handleSave('category_id', v)}
              renderInput={(val, onChange) => (
                <Select value={val} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm">
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              )}
              displayValue={category ? category.name : <span className="text-muted-foreground">—</span>}
            />

            {/* Available (special: select true/false) */}
            <EditableField
              label="Available"
              value={String(channel?.available)}
              editing={editingField === 'available'}
              onStartEdit={() => setEditingField('available')}
              onCancel={() => setEditingField(null)}
              onSave={(v) => handleSave('available', v)}
              renderInput={(val, onChange) => (
                <Select value={val} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm">
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </Select>
              )}
              displayValue={channel?.available ? <Badge variant="success">Yes</Badge> : <Badge variant="destructive">No</Badge>}
            />
          </div>
        ) : null}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}
