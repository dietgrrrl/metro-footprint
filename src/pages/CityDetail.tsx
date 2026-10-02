import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { getCity, getPhotosByCity } from '../lib/db';

function fmtMonthYear(s: string | undefined): string {
  if (!s) return '';
  const [y, m] = s.split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
import type { City, Photo } from '../lib/types';
import PhotoLightbox from '../components/PhotoLightbox';
import { sortPhotos } from '../lib/photoSort';

export default function CityDetail() {
  const { id } = useParams<{ id: string }>();
  const [city, setCity] = useState<City | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([getCity(id), getPhotosByCity(id)]).then(([c, p]) => {
      setCity(c ?? null);
      setPhotos(sortPhotos(p, c?.name));
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-xs text-ink-faint animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!city) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="font-display text-3xl text-border">City not found</div>
        <Link to="/" className="font-mono text-xs text-gold">← Back</Link>
      </div>
    );
  }

  const pct = city.totalLines > 0 ? Math.round((city.coveredLines / city.totalLines) * 100) : 0;
  const uncovered = Math.max(0, city.totalLines - city.coveredLines);
  const tripDate = fmtMonthYear(city.tripDate);

  return (
    <>
      <div className="max-w-screen-xl mx-auto px-5 py-8">
        {/* Back */}
        <Link to="/" className="font-mono text-xs text-ink-faint hover:text-ink-dim transition-colors">
          ← Back to map
        </Link>

        {/* Header */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <h1 className="font-display text-7xl sm:text-8xl font-800 text-ink leading-none tracking-wide">
              {city.name}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="font-mono text-sm text-ink-faint">{city.country}</span>
              {city.systemName && (
                <>
                  <span className="text-border">·</span>
                  <span className="font-mono text-sm text-gold">{city.systemName}</span>
                </>
              )}
              {tripDate && (
                <>
                  <span className="text-border">·</span>
                  <span className="font-mono text-sm text-ink-faint">{tripDate}</span>
                </>
              )}
            </div>
          </div>

          {/* Coverage stat */}
          <div className="flex items-center gap-5 sm:text-right">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#1e3554" strokeWidth="5" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke="#f5c518" strokeWidth="5"
                  strokeDasharray={`${pct * 2.136} 213.6`}
                  strokeLinecap="round"
                  className="transition-all"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-sm font-600 text-ink">{pct}%</span>
              </div>
            </div>
            <div>
              <div className="font-display text-5xl font-700 text-gold leading-none">{city.coveredLines}</div>
              <div className="font-mono text-xs text-ink-faint mt-0.5">of {city.totalLines} lines covered</div>
              {city.otherLines ? (
                <div className="font-mono text-xs text-ink-dim mt-0.5">+{city.otherLines} other rail line{city.otherLines > 1 ? 's' : ''}</div>
              ) : null}
              {uncovered > 0 && (
                <div className="font-mono text-xs text-ink-faint">{uncovered} remaining</div>
              )}
            </div>
          </div>
        </div>

        {/* Line ticks */}
        {city.totalLines > 0 && (
          <div className="mt-6 flex gap-1">
            {Array.from({ length: city.totalLines }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full transition-colors"
                style={{ background: i < city.coveredLines ? '#f5c518' : '#1e3554' }}
              />
            ))}
          </div>
        )}

        {city.notes && (
          <p className="mt-5 font-sans text-sm text-ink-dim italic max-w-2xl">{city.notes}</p>
        )}

        {/* Photos */}
        <div className="mt-10">
          <div className="font-mono text-xs text-ink-faint uppercase tracking-widest mb-5">
            Photos
            {photos.length > 0 && <span className="text-ink ml-2">({photos.length})</span>}
          </div>

          {photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border rounded-lg">
              <div className="font-display text-3xl text-border">No photos yet</div>
              <p className="font-mono text-xs text-ink-faint mt-2">Upload photos via the admin panel</p>
              <Link
                to="/admin"
                className="mt-4 font-mono text-xs text-gold border border-gold/40 px-4 py-2 rounded hover:bg-gold/10 transition-colors"
              >
                Go to Admin →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxIndex(i)}
                  className="relative group aspect-square overflow-hidden rounded bg-raised focus:outline-none"
                >
                  <img
                    src={photo.data}
                    alt={photo.caption || photo.filename}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-bg/80 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="font-mono text-[11px] text-ink line-clamp-1">{photo.caption || photo.filename}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}
