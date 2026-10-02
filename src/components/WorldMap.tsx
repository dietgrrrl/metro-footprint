import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { City } from '../lib/types';
import { WORLD_LAND_PATH, WORLD_BORDER_PATH } from './mapData';

interface Props {
  cities: City[];
}

const W = 1200;
const H = 600;

function project(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

// Guangzhou coordinates: 23.1291° N, 113.2644° E
// project(23.1291, 113.2644) gives x ≈ 978, y ≈ 223
// At zoom 1 (vW = 1200), center is at minX + 600.
// Setting initial pan.x = 978 - 600 = 378 puts Guangzhou dead-center on desktop.
const DESKTOP_VIEW = { zoom: 1, pan: { x: 378, y: 0 } };

// On mobile screens, zoom in to China (around lat 31°N, lon 113°E).
// project(31, 113) ≈ (977, 197).
// At zoom 2.5: vW = 480, vH = 240.
// pan.x = 977 - 600 = 377. pan.y = 197 - 300 = -103.
const MOBILE_VIEW = { zoom: 2.5, pan: { x: 377, y: -100 } };

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function getDefaultView(isMobile: boolean) {
  return isMobile ? MOBILE_VIEW : DESKTOP_VIEW;
}

const OFFSETS = [-W, 0, W];

const GRATICULE_LONS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
const GRATICULE_LATS = [60, 30, -30, -60];

export default function WorldMap({ cities }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; city: City } | null>(null);

  // Viewport-aware initial state
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const initialView = getDefaultView(isMobileViewport());
  const [zoom, setZoom] = useState(initialView.zoom);
  const [pan, setPan] = useState(initialView.pan);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  // Track window resize to update mobile state if necessary
  useEffect(() => {
    const handleResize = () => {
      const mobile = isMobileViewport();
      setIsMobile(mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const clampPan = useCallback((pX: number, pY: number, z: number) => {
    const vH = H / z;
    const maxY = Math.max(0, (H - vH) / 2);
    // Allow panning across horizontally wrapped world
    const minPanX = DESKTOP_VIEW.pan.x - W;
    const maxPanX = DESKTOP_VIEW.pan.x + W;
    return {
      x: Math.max(minPanX, Math.min(maxPanX, pX)),
      y: Math.max(-maxY, Math.min(maxY, pY)),
    };
  }, []);

  const handleZoom = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setZoom(prevZoom => {
      const nextZoom = Math.max(1, Math.min(8, prevZoom * factor));
      if (nextZoom === 1) {
        setPan(DESKTOP_VIEW.pan);
        return 1;
      }
      if (clientX !== undefined && clientY !== undefined && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const mouseXRatio = (clientX - rect.left) / rect.width - 0.5;
        const mouseYRatio = (clientY - rect.top) / rect.height - 0.5;

        setPan(prevPan => {
          const shiftX = -mouseXRatio * (W / prevZoom - W / nextZoom);
          const shiftY = -mouseYRatio * (H / prevZoom - H / nextZoom);
          return clampPan(prevPan.x + shiftX, prevPan.y + shiftY, nextZoom);
        });
      } else {
        setPan(prevPan => clampPan(prevPan.x, prevPan.y, nextZoom));
      }
      return nextZoom;
    });
  }, [clampPan]);

  // Wheel zoom handler
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.2 : 0.833;
      handleZoom(zoomFactor, e.clientX, e.clientY);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [handleZoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !svgRef.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (Math.hypot(dx, dy) > 3) {
      hasMoved.current = true;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = (W / zoom) / rect.width;
    const scaleY = (H / zoom) / rect.height;

    setPan(clampPan(panStart.current.x - dx * scaleX, panStart.current.y - dy * scaleY, zoom));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Non-passive native touch handlers for smooth dragging & pinch-to-zoom without page zoom
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(1);
  const pinchCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        setIsDragging(true);
        hasMoved.current = false;
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        panStart.current = { ...pan };
      } else if (e.touches.length === 2) {
        setIsDragging(false);
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartDist.current = dist;
        pinchStartZoom.current = zoom;
        pinchCenter.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      // Prevent browser viewport from zooming or scrolling while interacting with map
      if (e.cancelable) {
        e.preventDefault();
      }

      if (e.touches.length === 1 && isDragging && svgRef.current) {
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;

        if (Math.hypot(dx, dy) > 5) {
          hasMoved.current = true;
        }

        const rect = svgRef.current.getBoundingClientRect();
        const scaleX = (W / zoom) / rect.width;
        const scaleY = (H / zoom) / rect.height;

        setPan(clampPan(panStart.current.x - dx * scaleX, panStart.current.y - dy * scaleY, zoom));
      } else if (e.touches.length === 2 && pinchStartDist.current !== null && pinchStartDist.current > 0) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / pinchStartDist.current;
        const targetZoom = Math.max(1, Math.min(8, pinchStartZoom.current * factor));

        if (svgRef.current) {
          const rect = svgRef.current.getBoundingClientRect();
          const mouseXRatio = (pinchCenter.current.x - rect.left) / rect.width - 0.5;
          const mouseYRatio = (pinchCenter.current.y - rect.top) / rect.height - 0.5;

          setZoom(targetZoom);
          setPan(prevPan => {
            const shiftX = -mouseXRatio * (W / pinchStartZoom.current - W / targetZoom);
            const shiftY = -mouseYRatio * (H / pinchStartZoom.current - H / targetZoom);
            return clampPan(panStart.current.x + shiftX, panStart.current.y + shiftY, targetZoom);
          });
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        setIsDragging(false);
        pinchStartDist.current = null;
      } else if (e.touches.length === 1) {
        // Transitioned from pinch to 1 finger: restart drag baseline
        setIsDragging(true);
        pinchStartDist.current = null;
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        panStart.current = { ...pan };
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isDragging, zoom, pan, clampPan]);

  const resetZoom = () => {
    const def = getDefaultView(isMobile);
    setZoom(def.zoom);
    setPan(def.pan);
  };

  // ViewBox dimensions based on zoom & pan
  const vW = W / zoom;
  const vH = H / zoom;
  const minX = (W - vW) / 2 + pan.x;
  const minY = (H - vH) / 2 + pan.y;

  const defaultView = getDefaultView(isMobile);
  const isDefaultView = zoom === defaultView.zoom && pan.x === defaultView.pan.x && pan.y === defaultView.pan.y;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden select-none touch-none h-[50vh] min-h-[300px] sm:h-auto sm:min-h-0 sm:pb-[50%] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg
        ref={svgRef}
        viewBox={`${minX} ${minY} ${vW} ${vH}`}
        className="absolute inset-0 w-full h-full"
        style={{ background: '#09111f' }}
      >
        {/* Latitudes & horizontal lines across wrapped width */}
        {GRATICULE_LATS.map(lat => {
          const [, y] = project(lat, 0);
          return <line key={lat} x1={-W} y1={y} x2={2 * W} y2={y} stroke="#1e3554" strokeWidth={0.5 / zoom} opacity={0.5} />;
        })}
        <line x1={-W} y1={H / 2} x2={2 * W} y2={H / 2} stroke="#264268" strokeWidth={1 / zoom} opacity={0.8} />
        {[23.5, -23.5].map(lat => {
          const [, y] = project(lat, 0);
          return <line key={lat} x1={-W} y1={y} x2={2 * W} y2={y} stroke="#264268" strokeWidth={0.5 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} opacity={0.5} />;
        })}

        {/* Wrapped World: Landmasses, Country Borders & Graticule */}
        {OFFSETS.map(offsetX => (
          <g key={offsetX}>
            {GRATICULE_LONS.map(lon => {
              const [x] = project(0, lon);
              return (
                <line
                  key={`${offsetX}-${lon}`}
                  x1={x + offsetX}
                  y1={0}
                  x2={x + offsetX}
                  y2={H}
                  stroke="#1e3554"
                  strokeWidth={0.5 / zoom}
                  opacity={0.5}
                />
              );
            })}

            {/* Real world landmasses */}
            <path
              d={WORLD_LAND_PATH}
              transform={`translate(${offsetX}, 0)`}
              fill="#0d1929"
              stroke="#1e3554"
              strokeWidth={0.8 / zoom}
            />

            {/* Real world country borders */}
            <path
              d={WORLD_BORDER_PATH}
              transform={`translate(${offsetX}, 0)`}
              fill="none"
              stroke="#15263d"
              strokeWidth={0.5 / zoom}
              strokeDasharray={`${3 / zoom} ${3 / zoom}`}
            />
          </g>
        ))}

        {/* City pins across visible offsets */}
        {OFFSETS.map(offsetX => (
          <g key={`pins-${offsetX}`}>
            {cities.map(city => {
              const [rawX, cy] = project(city.lat, city.lon);
              const cx = rawX + offsetX;

              // Only render interactive pins within or near the visible viewport
              if (cx < minX - 40 || cx > minX + vW + 40) return null;

              const pinKey = `${city.id}-${offsetX}`;
              const isHov = hovered === pinKey;
              const pct = city.totalLines > 0 ? city.coveredLines / city.totalLines : 0;
              const dotColor = pct >= 1 ? '#f5c518' : pct >= 0.5 ? '#8aa8d4' : '#4a6a8a';

              const baseRadius = 8 / Math.pow(zoom, 0.4);
              const innerRadius = 4 / Math.pow(zoom, 0.4);

              return (
                <g
                  key={pinKey}
                  className="cursor-pointer"
                  onMouseEnter={() => {
                    setHovered(pinKey);
                    if (svgRef.current) {
                      const rect = svgRef.current.getBoundingClientRect();
                      const px = ((cx - minX) / vW) * rect.width;
                      const py = ((cy - minY) / vH) * rect.height;
                      setTooltip({ x: px, y: py, city });
                    }
                  }}
                  onMouseLeave={() => { setHovered(null); setTooltip(null); }}
                  onClick={e => {
                    e.stopPropagation();
                    if (!hasMoved.current) {
                      navigate(`/city/${city.id}`);
                    }
                  }}
                >
                  {/* Subtle ambient glow aura */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={baseRadius * 1.4}
                    fill={dotColor}
                    opacity={isHov ? 0.35 : 0.12}
                    className={isHov ? 'transition-all duration-300' : 'metro-glow'}
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                  />
                  {/* Outer ring */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHov ? baseRadius * 1.2 : baseRadius}
                    fill="none"
                    stroke={dotColor}
                    strokeWidth={(isHov ? 1.8 : 1.2) / Math.pow(zoom, 0.4)}
                    opacity={isHov ? 1 : 0.75}
                    className="transition-all duration-200"
                  />
                  {/* Inner dot */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHov ? innerRadius * 1.2 : innerRadius}
                    fill={dotColor}
                    className="transition-all duration-200"
                  />
                </g>
              );
            })}
          </g>
        ))}
      </svg>

      {/* Map Zoom Controls (Top Right) */}
      <div className="absolute top-4 right-4 flex items-center gap-1 bg-bg/80 border border-border rounded p-1 backdrop-blur-sm shadow-lg z-20">
        <button
          onClick={() => handleZoom(1.3)}
          title="Zoom In"
          className="w-7 h-7 rounded flex items-center justify-center font-mono text-sm text-ink hover:bg-surface transition-colors"
        >
          +
        </button>
        <button
          onClick={() => handleZoom(0.77)}
          title="Zoom Out"
          className="w-7 h-7 rounded flex items-center justify-center font-mono text-sm text-ink hover:bg-surface transition-colors"
        >
          −
        </button>
        {!isDefaultView && (
          <button
            onClick={resetZoom}
            title={isMobile ? "Reset to China view" : "Reset to world view"}
            className="px-2 h-7 rounded flex items-center justify-center font-mono text-xs text-gold hover:bg-surface transition-colors border-l border-border ml-0.5"
          >
            Reset
          </button>
        )}
        <span className="font-mono text-[10px] text-ink-faint px-2 border-l border-border select-none">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-30 bg-surface border border-border rounded p-3 min-w-36 shadow-xl backdrop-blur-sm"
          style={{ left: tooltip.x + 14, top: tooltip.y, transform: 'translateY(-50%)' }}
        >
          <div className="font-display text-lg font-700 text-ink leading-none">{tooltip.city.name}</div>
          <div className="font-mono text-xs text-ink-faint mt-0.5">{tooltip.city.country}</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gold rounded-full"
                style={{ width: `${tooltip.city.totalLines > 0 ? (tooltip.city.coveredLines / tooltip.city.totalLines) * 100 : 0}%` }}
              />
            </div>
            <span className="font-mono text-xs text-ink-dim whitespace-nowrap">
              {tooltip.city.coveredLines}/{tooltip.city.totalLines}
              {tooltip.city.otherLines ? ` (+${tooltip.city.otherLines})` : ''}
            </span>
          </div>
          {tooltip.city.tripDate && (
            <div className="font-mono text-xs text-ink-faint mt-1">
              {new Date(tooltip.city.tripDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
