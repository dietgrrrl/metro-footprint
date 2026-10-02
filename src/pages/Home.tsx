import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { getCities, getCityCoverPhotos } from '../lib/db';
import type { City } from '../lib/types';
import WorldMap from '../components/WorldMap';

function fmtMonthYear(s: string | undefined, style: 'short' | 'long' = 'short'): string {
  if (!s) return '';
  const [y, m] = s.split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: style, year: 'numeric' });
}

type View = 'map' | 'list';
type GroupBy = 'none' | 'year' | 'country';
type SortBy = 'date-desc' | 'date-asc' | 'country' | 'name' | 'coverage';

function sortCities(list: City[], sort: SortBy): City[] {
  return [...list].sort((a, b) => {
    switch (sort) {
      case 'date-desc': {
        const da = a.tripDate || a.createdAt || '';
        const db = b.tripDate || b.createdAt || '';
        if (da && !db) return -1;
        if (!da && db) return 1;
        const cmp = db.localeCompare(da);
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }
      case 'date-asc': {
        const da = a.tripDate || a.createdAt || '';
        const db = b.tripDate || b.createdAt || '';
        if (da && !db) return 1;
        if (!da && db) return -1;
        const cmp = da.localeCompare(db);
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }
      case 'country': {
        const c = a.country.localeCompare(b.country);
        if (c !== 0) return c;
        return a.name.localeCompare(b.name);
      }
      case 'name':
        return a.name.localeCompare(b.name);
      case 'coverage': {
        const pctA = a.totalLines > 0 ? a.coveredLines / a.totalLines : 0;
        const pctB = b.totalLines > 0 ? b.coveredLines / b.totalLines : 0;
        if (pctB !== pctA) return pctB - pctA;
        return a.name.localeCompare(b.name);
      }
      default:
        return 0;
    }
  });
}

interface CityGroup {
  key: string;
  title: string;
  cities: City[];
}

function groupCities(list: City[], groupBy: GroupBy, sortBy: SortBy): CityGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', title: '', cities: sortCities(list, sortBy) }];
  }

  const map = new Map<string, City[]>();
  for (const c of list) {
    let key = 'Undated';
    if (groupBy === 'year') {
      if (c.tripDate) {
        const y = c.tripDate.split('-')[0];
        if (y && y.length === 4) key = y;
      }
    } else if (groupBy === 'country') {
      key = c.country || 'Other';
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }

  const keys = Array.from(map.keys());
  if (groupBy === 'year') {
    keys.sort((a, b) => {
      if (a === 'Undated') return 1;
      if (b === 'Undated') return -1;
      return sortBy === 'date-asc' ? a.localeCompare(b) : b.localeCompare(a);
    });
  } else if (groupBy === 'country') {
    keys.sort((a, b) => a.localeCompare(b));
  }

  return keys.map(k => ({
    key: k,
    title: k,
    cities: sortCities(map.get(k)!, sortBy),
  }));
}

function CityCard({ city, cover }: { city: City; cover?: string }) {
  const pct = city.totalLines > 0 ? Math.round((city.coveredLines / city.totalLines) * 100) : 0;
  const date = fmtMonthYear(city.tripDate, 'short');

  return (
    <Link
      to={`/city/${city.id}`}
      className="group block bg-surface border border-border rounded hover:border-muted transition-all overflow-hidden"
    >
      {/* Cover image or placeholder initial */}
      <div className="aspect-[4/3] bg-raised flex items-center justify-center relative overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={city.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="font-display text-6xl font-800 text-border group-hover:text-muted transition-colors select-none">
            {city.name.charAt(0)}
          </div>
        )}
        {/* Coverage arc overlay */}
        <div className="absolute bottom-2 right-2 bg-bg/80 rounded-full p-0.5 backdrop-blur-sm shadow">
          <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
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
  const [view, setView] = useState<View>('list');
  const [cities, setCities] = useState<City[]>([]);
  const [coverMap, setCoverMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // List view sorting & grouping state
  const [groupBy, setGroupBy] = useState<GroupBy>('year');
  const [sortBy, setSortBy] = useState<SortBy>('date-desc');

  useEffect(() => {
    Promise.all([getCities(), getCityCoverPhotos()]).then(([c, covers]) => {
      setCities(c);
      setCoverMap(covers);
      setLoading(false);
    });
  }, []);

  const totalCovered = cities.reduce((a, c) => a + c.coveredLines, 0);
  const totalAll = cities.reduce((a, c) => a + c.totalLines, 0);
  const totalOther = cities.reduce((a, c) => a + (c.otherLines || 0), 0);
  const totalTaken = totalCovered + totalOther;

  const groups = useMemo(() => {
    return groupCities(cities, groupBy, sortBy);
  }, [cities, groupBy, sortBy]);

  return (
    <div className="min-h-[calc(100vh-52px)]">
      {/* Stats + view toggle */}
      <div className="border-b border-border bg-surface/40">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-5 py-2.5 sm:py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <span className="font-mono text-xs text-ink-faint">
              <span className="text-ink font-600">{cities.length}</span> cities
            </span>
            <span className="text-border hidden xs:inline">·</span>
            <span className="font-mono text-xs text-ink-faint">
              <span className="text-ink font-600">{totalCovered}</span>/{totalAll} lines covered
              {totalOther > 0 && (
                <span className="text-ink-dim ml-1.5">(+{totalOther} other{totalTaken ? `, totally ${totalTaken} lines taken` : ''})</span>
              )}
            </span>
          </div>

          {/* Accessible, thumb-friendly Map / List toggle */}
          <div className="flex items-center bg-bg border border-border rounded-lg p-1 shadow-sm" role="tablist" aria-label="Explore view mode">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              onClick={() => setView('list')}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 sm:py-1.5 rounded-md font-mono text-xs sm:text-xs font-500 transition-all min-h-[42px] sm:min-h-[32px] min-w-[76px] select-none ${
                view === 'list'
                  ? 'bg-surface text-gold border border-gold/40 shadow-sm'
                  : 'text-ink-faint hover:text-ink border border-transparent active:bg-raised'
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>List</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'map'}
              onClick={() => setView('map')}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 sm:py-1.5 rounded-md font-mono text-xs sm:text-xs font-500 transition-all min-h-[42px] sm:min-h-[32px] min-w-[76px] select-none ${
                view === 'map'
                  ? 'bg-surface text-gold border border-gold/40 shadow-sm'
                  : 'text-ink-faint hover:text-ink border border-transparent active:bg-raised'
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span>Map</span>
            </button>
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
        <div className="max-w-screen-2xl mx-auto px-5 py-6">
          {/* Controls bar: Group by & Sort by */}
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6 sm:mb-8 bg-surface/50 border border-border rounded-lg px-4 py-3">
            {/* Group by controls */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-xs text-ink-faint uppercase tracking-wider">Group by:</span>
              <div className="flex items-center bg-bg border border-border rounded-lg p-0.5">
                {(['none', 'year', 'country'] as const).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupBy(g)}
                    className={`px-3.5 py-2 sm:py-1 rounded font-mono text-xs transition-colors min-h-[38px] sm:min-h-[28px] select-none ${
                      groupBy === g
                        ? 'bg-surface text-gold border border-gold/40 font-500 shadow-sm'
                        : 'text-ink-faint hover:text-ink-dim border border-transparent'
                    }`}
                  >
                    {g === 'none' ? 'None' : g === 'year' ? 'Year' : 'Country'}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort by dropdown */}
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-ink-faint uppercase tracking-wider">Sort by:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortBy)}
                className="bg-bg border border-border rounded-lg px-3 py-2 sm:py-1.5 font-mono text-xs text-ink focus:border-muted outline-none transition-colors cursor-pointer min-h-[38px] sm:min-h-[28px]"
              >
                <option value="date-desc">Trip Date (Newest first)</option>
                <option value="date-asc">Trip Date (Oldest first)</option>
                <option value="country">Country (A → Z)</option>
                <option value="name">City Name (A → Z)</option>
                <option value="coverage">Coverage % (High → Low)</option>
              </select>
            </div>
          </div>

          {/* Groups list */}
          <div className="flex flex-col gap-10">
            {groups.map(group => {
              const groupCovered = group.cities.reduce((a, c) => a + c.coveredLines, 0);
              const groupTotal = group.cities.reduce((a, c) => a + c.totalLines, 0);
              const groupOther = group.cities.reduce((a, c) => a + (c.otherLines || 0), 0);

              return (
                <div key={group.key}>
                  {group.title && (
                    <div className="flex items-baseline justify-between border-b border-border pb-2.5 mb-5">
                      <div className="flex items-baseline gap-3">
                        <h2 className="font-display text-2xl font-700 text-ink tracking-wide">{group.title}</h2>
                        <span className="font-mono text-xs text-ink-faint">
                          {group.cities.length} {group.cities.length === 1 ? 'city' : 'cities'}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-ink-dim">
                        <span className="text-ink font-500">{groupCovered}</span>/{groupTotal} lines covered
                        {groupOther > 0 && <span className="text-ink-faint ml-1">(+{groupOther} other)</span>}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                    {group.cities.map(city => {
                      const slug = city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                      const cover = coverMap[city.id] || coverMap[slug];
                      return <CityCard key={city.id} city={city} cover={cover} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
