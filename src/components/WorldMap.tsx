import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { City } from '../lib/types';

interface Props {
  cities: City[];
}

const W = 1200;
const H = 540;

function project(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

// Guangzhou coordinates: 23.1291° N, 113.2644° E
// project(23.1291, 113.2644) gives x ≈ 978, y ≈ 201
// At zoom 1 (vW = 1200), center is at minX + 600.
// Setting initial pan.x = 978 - 600 = 378 puts Guangzhou dead-center on map load.
const INITIAL_PAN = { x: 378, y: 0 };
const OFFSETS = [-W, 0, W];

const LANDMASSES = [
  'M50,56 L120,62 L165,90 L172,118 L165,131 L175,158 L192,169 L210,200 L300,228 L322,207 L344,151 L379,125 L420,115 L380,91 L350,61 L330,48 L280,48 L230,45 L175,45 L120,50',
  'M403,91 L475,91 L489,38 L440,20 L395,38',
  'M445,63 L480,60 L488,73 L470,82 L448,77',
  'M347,234 L435,254 L413,338 L385,375 L370,432 L337,424 L308,370 L296,310 L299,262',
  'M513,153 L513,133 L523,119 L554,90 L591,63 L625,63 L645,99 L625,143 L609,153 L579,161 L600,135 L573,153 L563,153',
  'M560,90 L575,60 L600,55 L610,72 L595,90 L578,98',
  'M521,165 L576,171 L635,180 L692,234 L661,270 L594,375 L583,372 L519,320 L487,233 L487,210',
  'M665,180 L706,180 L715,215 L698,235 L669,220 L651,200',
  'M616,153 L648,144 L671,135 L700,144 L720,153 L750,207 L769,207 L795,200 L813,180 L808,207 L768,234 L842,248 L895,252 L892,207 L920,205 L950,166 L1000,171 L1045,144 L1096,65 L1050,36 L940,38 L855,36 L780,36 L720,45 L660,63 L635,81 L620,100',
  'M765,162 L800,157 L812,200 L781,249 L755,232 L739,198',
  'M880,212 L927,203 L950,230 L927,252 L892,243',
  'M898,335 L985,305 L1040,310 L1067,333 L1065,385 L1025,376 L965,373 L935,378 L900,365',
  'M1080,372 L1097,365 L1103,385 L1087,393',
  'M1040,130 L1060,118 L1078,144 L1063,162 L1043,153',
  'M484,87 L502,81 L514,99 L499,111 L481,104',
  'M1093,90 L1120,72 L1140,90 L1120,117 L1100,110',
];

const GRATICULE_LONS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
const GRATICULE_LATS = [60, 30, -30, -60];

export default function WorldMap({ cities }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; city: City } | null>(null);

  // Zoom & Pan state (starting centered on Guangzhou)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(INITIAL_PAN);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const clampPan = useCallback((pX: number, pY: number, z: number) => {
    const vH = H / z;
    const maxY = (H - vH) / 2;
    // Allow panning across horizontally wrapped world
    const minPanX = INITIAL_PAN.x - W;
    const maxPanX = INITIAL_PAN.x + W;
    return {
      x: Math.max(minPanX, Math.min(maxPanX, pX)),
      y: Math.max(-maxY, Math.min(maxY, pY)),
    };
  }, []);

  const handleZoom = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setZoom(prevZoom => {
      const nextZoom = Math.max(1, Math.min(8, prevZoom * factor));
      if (nextZoom === 1) {
        setPan(INITIAL_PAN);
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

  const resetZoom = () => {
    setZoom(1);
    setPan(INITIAL_PAN);
  };

  // ViewBox dimensions based on zoom & pan
  const vW = W / zoom;
  const vH = H / zoom;
  const minX = (W - vW) / 2 + pan.x;
  const minY = (H - vH) / 2 + pan.y;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ paddingBottom: `${(H / W) * 100}%` }}
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

        {/* Wrapped World: Landmasses & Graticule */}
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

            {LANDMASSES.map((d, i) => (
              <path
                key={`${offsetX}-${i}`}
                d={d + ' Z'}
                transform={`translate(${offsetX}, 0)`}
                fill="#0d1929"
                stroke="#1e3554"
                strokeWidth={0.8 / zoom}
              />
            ))}
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
        {(zoom !== 1 || pan.x !== INITIAL_PAN.x || pan.y !== INITIAL_PAN.y) && (
          <button
            onClick={resetZoom}
            title="Reset to Guangzhou center"
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
