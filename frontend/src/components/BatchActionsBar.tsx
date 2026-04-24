import { useState, useEffect, useCallback } from 'react';
import { pb } from '../lib/pocketbase';
import type { Category } from '../types/database';
import { useChannelSelection } from '../hooks/useChannelSelection';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Badge } from './ui/badge';
import { Trash2, Pencil, X, Loader2 } from 'lucide-react';

/** Batch update modal */
function BatchUpdateModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { selectedIds, clear } = useChannelSelection();
  const [categories, setCategories] = useState<Category[]>([]);
  const [updating, setUpdating] = useState(false);

  // Fields to update
  const [updateCountry, setUpdateCountry] = useState(false);
  const [countryValue, setCountryValue] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [availableValue, setAvailableValue] = useState('true');
  const [updateCategory, setUpdateCategory] = useState(false);
  const [categoryValue, setCategoryValue] = useState('');
  const [updateLogo, setUpdateLogo] = useState(false);
  const [logoValue, setLogoValue] = useState('');

  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await pb.collection('categories').getList<Category>(1, 500, {});
        if (!cancelled) setCategories(res.items);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open]);

  const handleUpdate = async () => {
    const body: Record<string, unknown> = {};
    if (updateCountry) body.tvg_country = countryValue;
    if (updateAvailable) body.available = availableValue === 'true';
    if (updateCategory) body.category_id = categoryValue;
    if (updateLogo) body.logo = logoValue;

    if (Object.keys(body).length === 0) {
      setError('Select at least one field to update.');
      return;
    }

    setUpdating(true);
    setError('');
    try {
      // PocketBase batch: create a batch request
      const ids = Array.from(selectedIds);
      // Process in chunks of 100 to avoid payload limits
      const chunkSize = 100;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const batch = pb.createBatch();
        for (const id of chunk) {
          batch.collection('channels').update(id, body);
        }
        await batch.send();
      }
      clear();
      onSuccess();
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch update failed');
    } finally {
      setUpdating(false);
    }
  };

  const resetForm = () => {
    setUpdateCountry(false); setCountryValue('');
    setUpdateAvailable(false); setAvailableValue('true');
    setUpdateCategory(false); setCategoryValue('');
    setUpdateLogo(false); setLogoValue('');
    setError('');
  };

  if (!open) return null;

  const anyActive = updateCountry || updateAvailable || updateCategory || updateLogo;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => !updating && onClose()}>
      <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Batch Update Channels</h2>
          <button onClick={() => !updating && onClose()} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Updating <strong>{selectedIds.size}</strong> channel{selectedIds.size !== 1 ? 's' : ''}
        </p>

        <div className="space-y-4">
          {/* Country */}
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={updateCountry} onChange={(e) => setUpdateCountry(e.target.checked)} className="mt-1 h-4 w-4" />
            <div className="flex-1">
              <label className="text-sm font-medium">Country</label>
              <Input
                value={countryValue}
                onChange={(e) => setCountryValue(e.target.value)}
                disabled={!updateCountry}
                placeholder="e.g. US"
                className="mt-1 h-8"
              />
            </div>
          </div>

          {/* Available */}
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={updateAvailable} onChange={(e) => setUpdateAvailable(e.target.checked)} className="mt-1 h-4 w-4" />
            <div className="flex-1">
              <label className="text-sm font-medium">Available</label>
              <Select value={availableValue} onChange={(e) => setAvailableValue(e.target.value)} disabled={!updateAvailable} className="mt-1 h-8">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </div>
          </div>

          {/* Category */}
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={updateCategory} onChange={(e) => setUpdateCategory(e.target.checked)} className="mt-1 h-4 w-4" />
            <div className="flex-1">
              <label className="text-sm font-medium">Category</label>
              <Select value={categoryValue} onChange={(e) => setCategoryValue(e.target.value)} disabled={!updateCategory} className="mt-1 h-8">
                <option value="">— Select —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Logo */}
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={updateLogo} onChange={(e) => setUpdateLogo(e.target.checked)} className="mt-1 h-4 w-4" />
            <div className="flex-1">
              <label className="text-sm font-medium">Logo URL</label>
              <Input
                value={logoValue}
                onChange={(e) => setLogoValue(e.target.value)}
                disabled={!updateLogo}
                placeholder="https://..."
                className="mt-1 h-8"
              />
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => { resetForm(); onClose(); }} disabled={updating}>
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={!anyActive || updating}>
            {updating ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Updating...</> : 'Update All'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Delete confirmation modal */
function BatchDeleteModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { selectedIds, clear } = useChannelSelection();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const ids = Array.from(selectedIds);
      const chunkSize = 100;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const batch = pb.createBatch();
        for (const id of chunk) {
          batch.collection('channels').delete(id);
        }
        await batch.send();
      }
      clear();
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => !deleting && onClose()}>
      <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Delete Channels</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This will permanently delete <strong>{selectedIds.size}</strong> channel{selectedIds.size !== 1 ? 's' : ''}.
        </p>
        <p className="mt-1 text-sm font-medium text-destructive">This action cannot be undone.</p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent h-10 px-4 py-2 border"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2 disabled:opacity-50"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Deleting...</> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Floating bar shown when channels are selected */
export default function BatchActionsBar({ onSuccess }: { onSuccess: () => void }) {
  const { selectedIds, clear } = useChannelSelection();
  const [showDelete, setShowDelete] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);

  if (selectedIds.size === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border bg-background px-5 py-3 shadow-xl">
        <Badge variant="secondary" className="text-sm font-medium">
          {selectedIds.size} selected
        </Badge>
        <button
          onClick={() => setShowUpdate(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> Update
        </button>
        <button
          onClick={() => setShowDelete(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
        <button
          onClick={clear}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <BatchUpdateModal open={showUpdate} onClose={() => setShowUpdate(false)} onSuccess={onSuccess} />
      <BatchDeleteModal open={showDelete} onClose={() => setShowDelete(false)} onSuccess={onSuccess} />
    </>
  );
}
