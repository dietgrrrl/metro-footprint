import { useEffect, useCallback } from 'react';
import type { Photo } from '../lib/types';

interface Props {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function PhotoLightbox({ photos, index, onClose, onNavigate }: Props) {
  const photo = photos[index];

  const prev = useCallback(() => { if (index > 0) onNavigate(index - 1); }, [index, onNavigate]);
  const next = useCallback(() => { if (index < photos.length - 1) onNavigate(index + 1); }, [index, photos.length, onNavigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-bg/96 backdrop-blur-sm flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink-faint">{index + 1} / {photos.length}</span>
          <span className="text-border">·</span>
          <span className="font-mono text-xs text-ink-dim">{photo.filename}</span>
        </div>
        <button
          className="font-mono text-xs text-ink-faint hover:text-ink transition-colors tracking-widest uppercase"
          onClick={onClose}
        >
          Close ×
        </button>
      </div>

      {/* Image */}
      <div
        className="relative max-w-[90vw] max-h-[80vh] flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={photo.data}
          alt={photo.caption || photo.filename}
          className="max-w-full max-h-[80vh] object-contain"
          style={{ boxShadow: '0 0 80px rgba(0,0,0,0.9)' }}
        />
      </div>

      {/* Caption */}
      {photo.caption && (
        <p
          className="mt-4 font-sans text-sm text-ink-dim text-center max-w-lg px-6"
          onClick={e => e.stopPropagation()}
        >
          {photo.caption}
        </p>
      )}

      {/* Prev / Next */}
      <div className="absolute inset-y-0 left-0 flex items-center pl-4" onClick={e => e.stopPropagation()}>
        <button
          onClick={prev}
          disabled={index === 0}
          className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-ink-dim hover:text-ink hover:border-muted disabled:opacity-20 transition-all"
        >←</button>
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center pr-4" onClick={e => e.stopPropagation()}>
        <button
          onClick={next}
          disabled={index === photos.length - 1}
          className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-ink-dim hover:text-ink hover:border-muted disabled:opacity-20 transition-all"
        >→</button>
      </div>

      {/* Filmstrip */}
      {photos.length > 1 && (
        <div
          className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 px-6 overflow-x-auto"
          onClick={e => e.stopPropagation()}
        >
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onNavigate(i)}
              className={`flex-shrink-0 w-12 h-8 rounded overflow-hidden border transition-all ${i === index ? 'border-gold opacity-100' : 'border-border opacity-40 hover:opacity-70'}`}
            >
              <img src={p.data} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
