import type { City, Photo } from './types';

// ── Static Archive Cache ──────────────────────────────────────────────────────
interface StaticArchive {
  cities: City[];
  photos: Photo[];
}

let staticArchiveCache: StaticArchive | null = null;
let staticArchivePromise: Promise<StaticArchive> | null = null;

async function loadStaticArchive(): Promise<StaticArchive> {
  if (staticArchiveCache) return staticArchiveCache;
  if (staticArchivePromise) return staticArchivePromise;

  staticArchivePromise = (async () => {
    try {
      const base = import.meta.env.BASE_URL || './';
      const cleanBase = base.endsWith('/') ? base : base + '/';
      const res = await fetch(`${cleanBase}data/archive.json`);
      if (res.ok) {
        const data = await res.json();
        const photos = (data.photos || []).map((p: Photo) => {
          if (p.data && !p.data.startsWith('data:') && !p.data.startsWith('http')) {
            return {
              ...p,
              data: `${cleanBase}${p.data.replace(/^\.?\//, '')}`,
            };
          }
          return p;
        });
        staticArchiveCache = {
          cities: data.cities || [],
          photos,
        };
        return staticArchiveCache;
      }
    } catch (e) {
      console.warn('Could not load static archive.json:', e);
    }
    staticArchiveCache = { cities: [], photos: [] };
    return staticArchiveCache;
  })();

  return staticArchivePromise;
}

// ── Cities → localStorage (fast, reliable, overlays static archive) ───────────
const CITIES_KEY = 'metro:cities';
const DELETED_CITIES_KEY = 'metro:deleted_cities';

function readLocalCities(): City[] {
  try {
    return JSON.parse(localStorage.getItem(CITIES_KEY) ?? '[]') as City[];
  } catch {
    return [];
  }
}

function writeLocalCities(cities: City[]): void {
  localStorage.setItem(CITIES_KEY, JSON.stringify(cities));
}

function readDeletedCityIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DELETED_CITIES_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function markCityDeleted(id: string): void {
  const deleted = readDeletedCityIds();
  deleted.add(id);
  localStorage.setItem(DELETED_CITIES_KEY, JSON.stringify(Array.from(deleted)));
}

export async function getCities(): Promise<City[]> {
  const staticData = await loadStaticArchive();
  const local = readLocalCities();
  const deleted = readDeletedCityIds();

  // Merge static cities and local cities.
  // Match primarily by ID, secondarily by city name (case-insensitive).
  const cityMap = new Map<string, City>();
  const nameToId = new Map<string, string>();

  // 1. Add static cities unless marked deleted
  for (const c of staticData.cities) {
    if (deleted.has(c.id)) continue;
    cityMap.set(c.id, c);
    nameToId.set(c.name.toLowerCase(), c.id);
  }

  // 2. Overlay local cities
  for (const c of local) {
    if (deleted.has(c.id)) continue;
    const existingId = nameToId.get(c.name.toLowerCase());
    if (existingId && existingId !== c.id) {
      cityMap.delete(existingId);
    }
    cityMap.set(c.id, c);
    nameToId.set(c.name.toLowerCase(), c.id);
  }

  return Array.from(cityMap.values());
}

export async function getCity(id: string): Promise<City | undefined> {
  const cities = await getCities();
  return cities.find(c => c.id === id);
}

export async function saveCity(city: City): Promise<void> {
  const cities = readLocalCities();
  const i = cities.findIndex(c => c.id === city.id || c.name.toLowerCase() === city.name.toLowerCase());
  if (i >= 0) cities[i] = city; else cities.push(city);
  writeLocalCities(cities);

  // Unmark from deleted if re-saving
  const deleted = readDeletedCityIds();
  if (deleted.has(city.id)) {
    deleted.delete(city.id);
    localStorage.setItem(DELETED_CITIES_KEY, JSON.stringify(Array.from(deleted)));
  }
}

export async function deleteCity(id: string): Promise<void> {
  markCityDeleted(id);
  writeLocalCities(readLocalCities().filter(c => c.id !== id));
  try { await _deletePhotosByCity(id); } catch { /* silent */ }
}

// ── Photos → IndexedDB + Static Archive Overlay ──────────────────────────────
const DB_NAME = 'metro-photos';
const DELETED_PHOTOS_KEY = 'metro:deleted_photos';

function readDeletedPhotoIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DELETED_PHOTOS_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function markPhotoDeleted(id: string): void {
  const deleted = readDeletedPhotoIds();
  deleted.add(id);
  localStorage.setItem(DELETED_PHOTOS_KEY, JSON.stringify(Array.from(deleted)));
}

function openPhotoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('cityId', 'cityId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPhotosByCity(cityId: string): Promise<Photo[]> {
  const staticData = await loadStaticArchive();
  const deleted = readDeletedPhotoIds();
  const cities = await getCities();
  const currentCity = cities.find(c => c.id === cityId);
  const citySlug = currentCity ? currentCity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : cityId;

  // Filter static photos matching cityId or normalized city name
  const staticPhotos = staticData.photos.filter(
    p => (p.cityId === cityId || p.cityId === citySlug) && !deleted.has(p.id)
  );

  let idbPhotos: Photo[] = [];
  try {
    const db = await openPhotoDB();
    idbPhotos = await new Promise<Photo[]>((resolve, reject) => {
      const idx = db.transaction('photos', 'readonly').objectStore('photos').index('cityId');
      const req = idx.getAll(IDBKeyRange.only(cityId));
      req.onsuccess = () => { resolve(req.result as Photo[]); db.close(); };
      req.onerror = () => { reject(req.error); db.close(); };
    });
  } catch {
    // IDB might not be populated on this client
  }

  const map = new Map<string, Photo>();
  for (const p of staticPhotos) {
    map.set(p.id, p);
  }
  for (const p of idbPhotos) {
    if (!deleted.has(p.id)) {
      map.set(p.id, p);
    }
  }

  return Array.from(map.values());
}

export async function savePhoto(photo: Photo): Promise<void> {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('photos', 'readwrite').objectStore('photos').put(photo);
    req.onsuccess = () => { resolve(); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function deletePhoto(id: string): Promise<void> {
  markPhotoDeleted(id);
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('photos', 'readwrite').objectStore('photos').delete(id);
    req.onsuccess = () => { resolve(); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

async function _deletePhotosByCity(cityId: string): Promise<void> {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('photos', 'readwrite');
    const cursor = t.objectStore('photos').index('cityId').openCursor(IDBKeyRange.only(cityId));
    cursor.onsuccess = (e) => {
      const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (c) { c.delete(); c.continue(); } else { resolve(); db.close(); }
    };
    cursor.onerror = () => { reject(cursor.error); db.close(); };
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Export / Import Backup Support ───────────────────────────────────────────
export async function exportArchiveData(): Promise<{ generatedAt: string; cities: City[]; photos: Photo[] }> {
  const cities = await getCities();
  const allPhotos: Photo[] = [];
  for (const c of cities) {
    const photos = await getPhotosByCity(c.id);
    allPhotos.push(...photos);
  }
  return {
    generatedAt: new Date().toISOString(),
    cities,
    photos: allPhotos,
  };
}

export async function importArchiveData(jsonContent: string): Promise<{ citiesCount: number; photosCount: number }> {
  const data = JSON.parse(jsonContent);
  if (!Array.isArray(data.cities)) {
    throw new Error('Invalid archive format: missing cities array');
  }

  for (const city of data.cities) {
    await saveCity(city);
  }

  if (Array.isArray(data.photos)) {
    for (const photo of data.photos) {
      if (photo.data && photo.data.startsWith('data:')) {
        await savePhoto(photo);
      }
    }
  }

  return { citiesCount: data.cities.length, photosCount: data.photos?.length || 0 };
}

export async function getCityCoverPhotos(): Promise<Record<string, string>> {
  const staticData = await loadStaticArchive();
  const map: Record<string, string> = {};
  for (const p of staticData.photos) {
    if (!map[p.cityId]) {
      map[p.cityId] = p.data;
    }
  }
  return map;
}
