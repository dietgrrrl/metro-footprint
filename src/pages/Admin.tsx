import { useState, useEffect, useRef } from 'react';
import { getCities, saveCity, deleteCity, getPhotosByCity, savePhoto, deletePhoto, fileToDataUrl, exportArchiveData, importArchiveData } from '../lib/db';

function fmtMonthYear(s: string | undefined): string {
  if (!s) return '—';
  const [y, m] = s.split('-').map(Number);
  if (!y || !m) return '—';
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
import { searchCities } from '../lib/cities';
import type { CityPreset } from '../lib/cities';
import type { City, Photo } from '../lib/types';
import { sortPhotos } from '../lib/photoSort';
import PhotoLightbox from '../components/PhotoLightbox';

// Change this to your own password
const ADMIN_PASSWORD = 'metro2024';

function uuid() { return crypto.randomUUID(); }

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState('');
  const [shake, setShake] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem('metro-auth', '1');
      onAuth();
    } else {
      setShake(true);
      setPw('');
      setTimeout(() => setShake(false), 600);
    }
  };

  return (
    <div className="min-h-[calc(100vh-52px)] flex items-center justify-center">
      <div className="w-full max-w-xs">
        <div className="font-display text-4xl font-800 text-ink mb-1 tracking-wide">Admin</div>
        <p className="font-mono text-xs text-ink-faint mb-8">Enter your password to continue</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Password"
            autoFocus
            className={`bg-surface border rounded px-4 py-2.5 font-mono text-sm text-ink placeholder-ink-faint outline-none focus:border-muted transition-all ${shake ? 'border-red-500' : 'border-border'}`}
          />
          <button type="submit" className="bg-gold text-bg font-display text-lg font-700 tracking-wide py-2 rounded hover:bg-gold/90 transition-colors">
            Enter
          </button>
        </form>
        <p className="font-mono text-[10px] text-ink-faint mt-8 opacity-40">Default: metro2024 — edit ADMIN_PASSWORD in Admin.tsx</p>
      </div>
    </div>
  );
}

// ─── City Search Picker ───────────────────────────────────────────────────────
interface CityPickerProps {
  value: CityPreset | null;
  onChange: (city: CityPreset | null) => void;
}

function CityPicker({ value, onChange }: CityPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = searchCities(query);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between bg-surface border border-border rounded px-4 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-sans text-sm text-ink font-500">{value.name}</span>
              <span className="font-mono text-xs text-ink-faint">{value.country}</span>
              {value.totalLines !== undefined && (
                <span className="font-mono text-[11px] text-gold bg-gold/10 px-2 py-0.5 rounded border border-gold/20">
                  {value.totalLines} lines
                </span>
              )}
            </div>
            {value.systemName && (
              <div className="font-mono text-xs text-ink-dim mt-0.5">{value.systemName}</div>
            )}
          </div>
          <span className="font-mono text-xs text-ink-faint ml-auto">
            {value.lat.toFixed(2)}°, {value.lon.toFixed(2)}°
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-ink-faint hover:text-ink transition-colors ml-4 text-sm"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search city name, country, or metro system…"
        className="w-full bg-surface border border-border rounded px-4 py-2.5 font-sans text-sm text-ink placeholder-ink-faint outline-none focus:border-muted transition-colors"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded shadow-xl z-30 max-h-64 overflow-y-auto line-scroll">
          {results.map(city => (
            <button
              key={`${city.name}-${city.country}`}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(city); setQuery(''); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 hover:bg-raised flex items-center justify-between transition-colors group"
            >
              <div className="flex flex-col">
                <span className="font-sans text-sm text-ink group-hover:text-gold transition-colors">{city.name}</span>
                {city.systemName && (
                  <span className="font-mono text-[11px] text-ink-dim">{city.systemName}</span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                {city.totalLines !== undefined && (
                  <span className="font-mono text-xs text-gold bg-gold/10 px-2 py-0.5 rounded border border-gold/20">
                    {city.totalLines} lines
                  </span>
                )}
                <span className="font-mono text-xs text-ink-faint">{city.country}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded px-4 py-3 text-xs text-ink-faint font-mono z-30">
          No cities found
        </div>
      )}
    </div>
  );
}

// ─── City Form ────────────────────────────────────────────────────────────────
interface CityFormProps {
  initial?: City;
  onSave: (city: City) => void;
  onCancel: () => void;
}

function CityForm({ initial, onSave, onCancel }: CityFormProps) {
  const [selectedCity, setSelectedCity] = useState<CityPreset | null>(
    initial ? { name: initial.name, country: initial.country, lat: initial.lat, lon: initial.lon, totalLines: initial.totalLines, systemName: initial.systemName } : null
  );
  const [tripDate, setTripDate] = useState(initial?.tripDate ?? '');
  const [totalLines, setTotalLines] = useState(String(initial?.totalLines ?? ''));
  const [coveredLines, setCoveredLines] = useState(String(initial?.coveredLines ?? ''));
  const [otherLines, setOtherLines] = useState(String(initial?.otherLines ?? ''));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCityChange = (preset: CityPreset | null) => {
    setSelectedCity(preset);
    if (preset) {
      if (preset.totalLines !== undefined) {
        setTotalLines(String(preset.totalLines));
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCity) { setError('Please select a city'); return; }
    const total = parseInt(totalLines) || 0;
    const covered = parseInt(coveredLines) || 0;
    const other = parseInt(otherLines) || 0;
    if (covered > total) { setError('Lines covered cannot exceed total lines'); return; }
    setSaving(true);
    setError('');
    try {
      const city: City = {
        id: initial?.id ?? uuid(),
        name: selectedCity.name,
        country: selectedCity.country,
        lat: selectedCity.lat,
        lon: selectedCity.lon,
        tripDate,
        totalLines: total,
        coveredLines: Math.min(covered, total),
        otherLines: other,
        notes: notes.trim() || undefined,
        systemName: selectedCity.systemName,
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      };
      await saveCity(city);
      onSave(city);
    } catch (err) {
      setError(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setSaving(false);
    }
  };

  const total = parseInt(totalLines) || 0;
  const covered = parseInt(coveredLines) || 0;
  const other = parseInt(otherLines) || 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <form onSubmit={submit} className="max-w-lg">
      <div className="font-display text-3xl font-700 text-ink mb-8 tracking-wide">
        {initial ? `Edit — ${initial.name}` : 'Add City'}
      </div>

      <div className="flex flex-col gap-5">
        {/* City selector */}
        <div>
          <label className="block font-mono text-xs text-ink-faint uppercase tracking-widest mb-2">City *</label>
          <CityPicker value={selectedCity} onChange={handleCityChange} />
        </div>

        {/* Trip date */}
        <div>
          <label className="block font-mono text-xs text-ink-faint uppercase tracking-widest mb-2">Trip Date</label>
          <input
            type="month"
            value={tripDate}
            onChange={e => setTripDate(e.target.value)}
            className="w-full bg-surface border border-border rounded px-4 py-2.5 font-mono text-sm text-ink focus:border-muted outline-none transition-colors"
          />
        </div>

        {/* Line counts */}
        <div>
          <label className="block font-mono text-xs text-ink-faint uppercase tracking-widest mb-2">Metro Lines & Coverage</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="font-mono text-xs text-ink-faint mb-1.5">Total lines</div>
              <input
                type="number"
                min="0"
                value={totalLines}
                onChange={e => setTotalLines(e.target.value)}
                placeholder="e.g. 19"
                className="w-full bg-surface border border-border rounded px-4 py-2.5 font-mono text-sm text-ink focus:border-muted outline-none transition-colors"
              />
            </div>
            <div>
              <div className="font-mono text-xs text-ink-faint mb-1.5">Lines covered</div>
              <input
                type="number"
                min="0"
                max={totalLines || undefined}
                value={coveredLines}
                onChange={e => setCoveredLines(e.target.value)}
                placeholder="e.g. 18"
                className="w-full bg-surface border border-border rounded px-4 py-2.5 font-mono text-sm text-ink focus:border-muted outline-none transition-colors"
              />
            </div>
            <div>
              <div className="font-mono text-xs text-ink-faint mb-1.5">Other lines covered</div>
              <input
                type="number"
                min="0"
                value={otherLines}
                onChange={e => setOtherLines(e.target.value)}
                placeholder="e.g. 2"
                className="w-full bg-surface border border-border rounded px-4 py-2.5 font-mono text-sm text-ink focus:border-muted outline-none transition-colors"
              />
              <span className="block font-mono text-[10px] text-ink-faint mt-1">Excluded from %</span>
            </div>
          </div>
          {total > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="font-mono text-xs text-ink-dim whitespace-nowrap">
                {pct}% coverage ({covered}/{total})
                {other > 0 && (
                  <span className="text-ink-faint ml-1.5">+ {other} other</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block font-mono text-xs text-ink-faint uppercase tracking-widest mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional notes about this trip…"
            className="w-full bg-surface border border-border rounded px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-muted outline-none transition-colors resize-none"
          />
        </div>

        {error && <p className="font-mono text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-gold text-bg font-display text-lg font-700 rounded hover:bg-gold/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save City'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2.5 bg-surface border border-border rounded font-mono text-xs text-ink-faint hover:text-ink hover:border-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────
interface PhotoUploadProps {
  city: City;
  onBack: () => void;
}

interface UploadItem {
  id: string;
  file: File;
  preview: string;
  caption: string;
  filename: string;
}

function PhotoUpload({ city, onBack }: PhotoUploadProps) {
  const [existing, setExisting] = useState<Photo[]>([]);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPhotosByCity(city.id).then(photos => setExisting(sortPhotos(photos, city.name)));
  }, [city.id, city.name]);

  const addFiles = (files: FileList | File[]) => {
    const items: UploadItem[] = Array.from(files).map(f => ({
      id: uuid(),
      file: f,
      preview: URL.createObjectURL(f),
      caption: '',
      filename: f.name,
    }));
    setQueue(prev => sortPhotos([...prev, ...items], city.name));
  };

  const removeQueued = (id: string) => {
    const item = queue.find(i => i.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    setQueue(prev => prev.filter(i => i.id !== id));
  };

  const updateCaption = (id: string, caption: string) =>
    setQueue(prev => prev.map(i => i.id === id ? { ...i, caption } : i));

  const saveAll = async () => {
    if (!queue.length) return;
    setSaving(true);
    let count = 0;
    for (const item of queue) {
      const data = await fileToDataUrl(item.file);
      await savePhoto({ id: item.id, cityId: city.id, filename: item.file.name, caption: item.caption, data });
      URL.revokeObjectURL(item.preview);
      count++;
    }
    setQueue([]);
    setSavedCount(c => c + count);
    setSaving(false);
    getPhotosByCity(city.id).then(photos => setExisting(sortPhotos(photos, city.name)));
  };

  const removeExisting = async (id: string) => {
    await deletePhoto(id);
    setExisting(prev => prev.filter(p => p.id !== id));
    setDeleteConfirmId(null);
    if (previewIndex !== null) setPreviewIndex(null);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="font-mono text-xs text-ink-faint hover:text-ink transition-colors">← Back</button>
        <div>
          <div className="font-display text-3xl font-700 text-ink tracking-wide">{city.name}</div>
          <div className="font-mono text-xs text-ink-faint">
            {city.country} · {city.coveredLines}/{city.totalLines} lines covered
            {city.otherLines ? ` (+${city.otherLines} other)` : ''}
          </div>
        </div>
      </div>

      {savedCount > 0 && (
        <div className="mb-5 px-4 py-2 bg-green-950/30 border border-green-800/30 rounded font-mono text-xs text-green-400">
          ✓ {savedCount} photos saved to archive
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg py-14 text-center cursor-pointer hover:border-muted transition-colors group"
      >
        <div className="font-display text-3xl font-600 text-border group-hover:text-muted transition-colors">
          Drop photos here
        </div>
        <p className="font-mono text-xs text-ink-faint mt-2">or click to select · multiple files supported</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-mono text-xs text-ink-faint uppercase tracking-widest">{queue.length} queued</div>
            <button
              onClick={saveAll}
              disabled={saving}
              className="px-5 py-2 bg-gold text-bg font-display text-base font-700 rounded hover:bg-gold/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Save ${queue.length} Photos`}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {queue.map(item => (
              <div key={item.id} className="bg-surface border border-border rounded overflow-hidden">
                <div className="relative aspect-square">
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeQueued(item.id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-bg/80 flex items-center justify-center text-ink-dim hover:text-ink text-sm transition-colors"
                  >×</button>
                </div>
                <div className="p-2">
                  <input
                    value={item.caption}
                    onChange={e => updateCaption(item.id, e.target.value)}
                    placeholder="Caption (optional)…"
                    className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-ink placeholder-ink-faint focus:border-muted outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing photos in archive */}
      {existing.length > 0 && (
        <div className="mt-10">
          <div className="font-mono text-xs text-ink-faint uppercase tracking-widest mb-4">
            In Archive <span className="text-ink">({existing.length})</span> · <span className="normal-case text-ink-dim">Click photo to preview</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
            {existing.map((p, i) => (
              <div
                key={p.id}
                onClick={() => setPreviewIndex(i)}
                onMouseLeave={() => { if (deleteConfirmId === p.id) setDeleteConfirmId(null); }}
                className="relative group aspect-square bg-raised rounded overflow-hidden cursor-pointer border border-border hover:border-gold/60 transition-all select-none"
              >
                <img
                  src={p.data}
                  alt={p.caption || p.filename}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />

                {/* Filename / caption overlay on hover */}
                <div className="absolute bottom-0 inset-x-0 bg-bg/85 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <span className="font-mono text-[10px] text-ink line-clamp-1">{p.caption || p.filename}</span>
                </div>

                {/* Delete button with safety confirmation */}
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  {deleteConfirmId === p.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeExisting(p.id);
                      }}
                      className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded font-mono text-[10px] shadow transition-colors"
                      title="Click again to confirm deletion"
                    >
                      Delete?
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(p.id);
                      }}
                      className="w-6 h-6 rounded-full bg-bg/90 hover:bg-red-500 hover:text-white text-ink-faint flex items-center justify-center transition-colors shadow"
                      title="Delete photo"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fullscreen Photo Lightbox Preview */}
      {previewIndex !== null && (
        <PhotoLightbox
          photos={existing}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
type AdminView = 'dashboard' | 'city-form' | 'photos';

interface DashboardProps {
  cities: City[];
  onAdd: () => void;
  onEdit: (city: City) => void;
  onPhotos: (city: City) => void;
  onDelete: (id: string) => void;
}

function Dashboard({ cities, onAdd, onEdit, onPhotos, onDelete }: DashboardProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const doDelete = async (id: string) => {
    await deleteCity(id);
    onDelete(id);
    setConfirmId(null);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportArchiveData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `archive-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await importArchiveData(text);
      alert(`Imported ${res.citiesCount} cities successfully!`);
      window.location.reload();
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : 'Invalid file'}`);
    }
  };

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSyncToProject = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const data = await exportArchiveData();
      const res = await fetch('/api/save-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 2),
      });
      if (res.ok) {
        setSyncMessage('Saved! Ready to push to GitHub.');
      } else {
        throw new Error('Save endpoint failed');
      }
    } catch (err: any) {
      setSyncMessage('Failed to save to project files.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="font-display text-3xl font-700 text-ink tracking-wide">Cities</div>
          <div className="font-mono text-xs text-ink-faint mt-1">Manage, add, and export your metro archive</div>
          {syncMessage && (
            <div className="font-mono text-xs text-gold mt-1 animate-pulse">{syncMessage}</div>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSyncToProject}
            disabled={syncing}
            className="px-3.5 py-2 border border-gold/40 text-gold rounded font-mono text-xs hover:bg-gold/10 transition-colors disabled:opacity-50"
            title="Saves your browser edits directly into public/data/archive.json so you can push to GitHub"
          >
            {syncing ? 'Saving…' : '💾 Save to Project'}
          </button>
          <label className="cursor-pointer px-3.5 py-2 border border-border rounded font-mono text-xs text-ink-faint hover:text-ink hover:border-muted transition-colors select-none">
            Import JSON
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3.5 py-2 border border-border rounded font-mono text-xs text-ink-faint hover:text-ink hover:border-muted transition-colors disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export JSON'}
          </button>
          <button
            onClick={onAdd}
            className="px-5 py-2 bg-gold text-bg font-display text-base font-700 rounded hover:bg-gold/90 transition-colors"
          >
            + Add City
          </button>
        </div>
      </div>

      {cities.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-24 text-center">
          <div className="font-display text-4xl text-border">No cities yet</div>
          <p className="font-mono text-xs text-ink-faint mt-3">Add your first metro city above</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {cities.map(city => {
            const pct = city.totalLines > 0 ? Math.round((city.coveredLines / city.totalLines) * 100) : 0;
            const date = fmtMonthYear(city.tripDate);
            return (
              <div key={city.id} className="bg-surface border border-border rounded px-5 py-4 flex items-center gap-5">
                {/* Coverage ring */}
                <div className="flex-shrink-0 relative w-10 h-10">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#1e3554" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15" fill="none"
                      stroke="#f5c518" strokeWidth="3"
                      strokeDasharray={`${pct * 0.942} 94.2`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] text-ink-dim">{pct}%</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-display text-xl font-700 text-ink">{city.name}</span>
                    <span className="font-mono text-xs text-ink-faint">{city.country}</span>
                    {city.systemName && (
                      <span className="font-mono text-[11px] text-ink-dim">· {city.systemName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="font-mono text-xs text-ink-faint">{date}</span>
                    <span className="font-mono text-xs text-ink-dim">
                      {city.coveredLines} / {city.totalLines} lines
                      {city.otherLines ? <span className="text-ink-faint ml-1">(+{city.otherLines} other)</span> : null}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onPhotos(city)}
                    className="px-3 py-1.5 border border-border rounded font-mono text-xs text-ink-faint hover:text-ink hover:border-muted transition-colors"
                  >
                    Photos
                  </button>
                  <button
                    onClick={() => onEdit(city)}
                    className="px-3 py-1.5 border border-border rounded font-mono text-xs text-ink-faint hover:text-ink hover:border-muted transition-colors"
                  >
                    Edit
                  </button>
                  {confirmId === city.id ? (
                    <>
                      <button
                        onClick={() => doDelete(city.id)}
                        className="px-3 py-1.5 border border-red-500/50 rounded font-mono text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="px-3 py-1.5 border border-border rounded font-mono text-xs text-ink-faint transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(city.id)}
                      className="px-3 py-1.5 border border-border rounded font-mono text-xs text-ink-faint hover:text-red-400 hover:border-red-500/50 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Admin Root ───────────────────────────────────────────────────────────────
export default function Admin() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('metro-auth') === '1');
  const [view, setView] = useState<AdminView>('dashboard');
  const [cities, setCities] = useState<City[]>([]);
  const [editing, setEditing] = useState<City | undefined>(undefined);
  const [photoCity, setPhotoCity] = useState<City | null>(null);

  useEffect(() => {
    if (authed) getCities().then(c => setCities(c.sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  }, [authed]);

  if (!authed) return <LoginGate onAuth={() => setAuthed(true)} />;

  const handleSave = (city: City) => {
    setCities(prev => {
      const exists = prev.find(c => c.id === city.id);
      return exists ? prev.map(c => c.id === city.id ? city : c) : [city, ...prev];
    });
    setView('dashboard');
    setEditing(undefined);
  };

  return (
    <div className="max-w-screen-xl mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-10 pb-4 border-b border-border">
        <div className="font-mono text-xs text-ink-faint uppercase tracking-widest">Admin Panel</div>
        <button
          onClick={() => { sessionStorage.removeItem('metro-auth'); setAuthed(false); }}
          className="font-mono text-xs text-ink-faint hover:text-ink transition-colors"
        >
          Sign out
        </button>
      </div>

      {view === 'dashboard' && (
        <Dashboard
          cities={cities}
          onAdd={() => { setEditing(undefined); setView('city-form'); }}
          onEdit={city => { setEditing(city); setView('city-form'); }}
          onPhotos={city => { setPhotoCity(city); setView('photos'); }}
          onDelete={id => setCities(prev => prev.filter(c => c.id !== id))}
        />
      )}

      {view === 'city-form' && (
        <CityForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setView('dashboard'); setEditing(undefined); }}
        />
      )}

      {view === 'photos' && photoCity && (
        <PhotoUpload city={photoCity} onBack={() => setView('dashboard')} />
      )}
    </div>
  );
}
