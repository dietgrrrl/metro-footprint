import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { getCities } from '../lib/db';

function fmtMonthYear(s: string | undefined, style: 'short' | 'long' = 'short'): string {
  if (!s) return '';
  const [y, m] = s.split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: style, year: 'numeric' });
}
import type { City } from '../lib/types';
import WorldMap from '../components/WorldMap';

type View = 'map' | 'list';

function CityCard({ city }: { city: City }) {
  const pct = city.totalLines > 0 ? Math.round((city.coveredLines / city.totalLines) * 100) : 0;
  const date = fmtMonthYear(city.tripDate, 'short');

  return (
    <Link
      to={`/city/${city.id}`}
      className="group block bg-surface border border-border rounded hover:border-muted transition-all overflow-hidden"
    >
      {/* Cover or placeholder */}
      <div className="aspect-[4/3] bg-raised flex items-center justify-center relative overflow-hidden">
        <div className="font-display text-6xl font-800 text-border group-hover:text-muted transition-colors select-none">
          {city.name.charAt(0)}
        </div>
        {/* Coverage arc overlay */}
        <div className="absolute bottom-2 right-2">
          <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
            <circle cx="18" cy="18" r="14" fill="none" stroke="#1e3554" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="14" fill="none"
              stroke="#f5c518" strokeWidth="3"
              strokeDasharray={`${pct * 0.879} 87.9`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-[8px] text-ink-dim rotate-90">{pct}%</span>
          </div>
        </div>
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-1">
          <div>
            <h3 className="font-display text-xl font-700 text-ink leading-tight">{city.name}</h3>
            <p className="font-mono text-xs text-ink-faint">{city.country}</p>
          </div>
          {date && <span className="font-mono text-[10px] text-ink-faint whitespace-nowrap mt-0.5">{date}</span>}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-xs text-ink-faint">
            {city.coveredLines}/{city.totalLines}
            {city.otherLines ? ` (+${city.otherLines})` : ''}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const [view, setView] = useState<View>('map');
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCities().then(c => {
      setCities(c.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    });
  }, []);

  const totalCovered = cities.reduce((a, c) => a + c.coveredLines, 0);
  const totalAll = cities.reduce((a, c) => a + c.totalLines, 0);
  const totalOther = cities.reduce((a, c) => a + (c.otherLines || 0), 0);
  const totalTaken = totalCovered + totalOther;

  return (
    <div className="min-h-[calc(100vh-52px)]">
      {/* Stats + view toggle */}
      <div className="border-b border-border bg-surface/40">
        <div className="max-w-screen-2xl mx-auto px-5 py-2 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <span className="font-mono text-xs text-ink-faint">
              <span className="text-ink font-500">{cities.length}</span> cities
            </span>
            <span className="font-mono text-xs text-ink-faint">
              <span className="text-ink font-500">{totalCovered}</span>/{totalAll} lines covered
              {totalOther > 0 && (
                <span className="text-ink-dim ml-1.5">(+{totalOther} other, totally {totalTaken} lines taken)</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-0.5 bg-bg border border-border rounded p-0.5">
            {(['map', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded font-mono text-xs capitalize transition-colors ${view === v ? 'bg-surface text-ink' : 'text-ink-faint hover:text-ink-dim'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="font-mono text-xs text-ink-faint animate-pulse">Loading archive…</div>
        </div>
      ) : cities.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <div className="font-display text-4xl font-700 text-border">No cities yet</div>
          <p className="font-sans text-sm text-ink-faint text-center max-w-xs">
            Add your first city from the admin panel to start building your metro footprint
          </p>
          <Link
            to="/admin"
            className="font-mono text-xs text-gold border border-gold/40 px-5 py-2 rounded hover:bg-gold/10 transition-colors"
          >
            Go to Admin →
          </Link>
        </div>
      ) : view === 'map' ? (
        <div className="relative">
          <WorldMap cities={cities} />
          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-bg/80 border border-border rounded p-3 backdrop-blur-sm text-xs">
            <div className="font-mono text-ink-faint uppercase tracking-widest mb-2">Coverage</div>
            {[
              { color: '#f5c518', label: 'All lines' },
              { color: '#8aa8d4', label: '≥50%' },
              { color: '#4a6a8a', label: 'Partial' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="font-mono text-ink-dim">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-screen-2xl mx-auto px-5 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {cities.map(city => <CityCard key={city.id} city={city} />)}
          </div>
        </div>
      )}
    </div>
  );
}
