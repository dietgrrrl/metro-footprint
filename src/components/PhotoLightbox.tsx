import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Zoom & Pan state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);

  // Reset zoom whenever navigating to another photo
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{
    x: number;
    y: number;
    dist?: number;
    scale: number;
    pan: { x: number; y: number };
  }>({ x: 0, y: 0, scale: 1, pan: { x: 0, y: 0 } });

  const lastTapRef = useRef<number>(0);

  // Non-passive touchmove listener to prevent whole-page zoom while pinching
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1 || scale > 1) {
        e.preventDefault();
      }
    };

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [scale]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        dist,
        scale,
        pan,
      };
      setIsPinching(true);
    } else if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        scale,
        pan,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current.dist) {
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = newDist / touchStartRef.current.dist;
      const newScale = Math.min(Math.max(touchStartRef.current.scale * factor, 0.8), 5);
      setScale(newScale);
    } else if (e.touches.length === 1 && scale > 1) {
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      const maxPanX = (window.innerWidth * (scale - 1)) / 2 + 50;
      const maxPanY = (window.innerHeight * (scale - 1)) / 2 + 50;

      setPan({
        x: Math.min(Math.max(touchStartRef.current.pan.x + dx, -maxPanX), maxPanX),
        y: Math.min(Math.max(touchStartRef.current.pan.y + dy, -maxPanY), maxPanY),
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      setIsPinching(false);

      if (scale < 1.05) {
        setScale(1);
        setPan({ x: 0, y: 0 });
      }

      // Single-finger swipe left/right to advance when not zoomed in
      if (scale <= 1) {
        const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
        const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
        if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
          if (deltaX < 0) {
            next();
          } else {
            prev();
          }
        }
      }
    } else if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        scale,
        pan,
      };
    }
  };

  // Double-tap on image to toggle zoom
  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (scale > 1.2) {
        setScale(1);
        setPan({ x: 0, y: 0 });
      } else {
        setScale(2.5);
        setPan({ x: 0, y: 0 });
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

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
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-bg/96 backdrop-blur-md flex flex-col items-center justify-center select-none touch-none"
      onClick={() => {
        if (scale > 1) {
          setScale(1);
          setPan({ x: 0, y: 0 });
        } else {
          onClose();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto bg-surface/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-border/60">
          <span className="font-mono text-xs text-ink-faint">{index + 1} / {photos.length}</span>
          <span className="text-border">·</span>
          <span className="font-mono text-xs text-ink-dim max-w-[140px] sm:max-w-xs truncate">{photo.filename}</span>
        </div>

        {/* Highly accessible, easy-to-hit Close button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="pointer-events-auto flex items-center justify-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2 rounded-full bg-surface/90 border border-border/80 hover:border-gold/60 text-ink hover:text-gold transition-all shadow-xl active:scale-95 min-h-[44px] min-w-[44px]"
          aria-label="Close photo viewer"
        >
          <span className="font-mono text-xs uppercase tracking-wider font-500 hidden sm:inline">Close</span>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image container */}
      <div
        className="relative max-w-[92vw] max-h-[80vh] flex items-center justify-center overflow-visible"
        onClick={handleImageClick}
      >
        <img
          src={photo.data}
          alt={photo.caption || photo.filename}
          className="max-w-full max-h-[80vh] object-contain select-none"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isPinching ? 'none' : 'transform 0.15s ease-out',
            boxShadow: '0 0 80px rgba(0,0,0,0.9)',
            touchAction: 'none',
            willChange: 'transform',
          }}
          draggable={false}
        />
      </div>

      {/* Floating reset button when zoomed in */}
      {scale > 1.1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
          className="absolute bottom-20 z-30 px-3.5 py-1.5 rounded-full bg-surface/90 border border-gold/40 text-gold text-xs font-mono shadow-xl backdrop-blur-sm hover:bg-gold/10 transition-all flex items-center gap-1.5 active:scale-95"
        >
          <span>{Math.round(scale * 100)}%</span>
          <span className="text-ink-faint">· Tap to reset</span>
        </button>
      )}

      {/* Caption */}
      {photo.caption && scale === 1 && (
        <p
          className="mt-4 font-sans text-sm text-ink-dim text-center max-w-lg px-6 z-10"
          onClick={e => e.stopPropagation()}
        >
          {photo.caption}
        </p>
      )}

      {/* Prev / Next controls */}
      {scale === 1 && (
        <>
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-4 z-20" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={prev}
              disabled={index === 0}
              aria-label="Previous photo"
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-surface/85 border border-border flex items-center justify-center text-ink hover:text-gold hover:border-gold/50 disabled:opacity-20 transition-all shadow-lg active:scale-95"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 sm:pr-4 z-20" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={next}
              disabled={index === photos.length - 1}
              aria-label="Next photo"
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-surface/85 border border-border flex items-center justify-center text-ink hover:text-gold hover:border-gold/50 disabled:opacity-20 transition-all shadow-lg active:scale-95"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Filmstrip */}
      {photos.length > 1 && scale === 1 && (
        <div
          className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 px-6 overflow-x-auto z-20"
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
