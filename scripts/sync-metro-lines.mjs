import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const sourceMetroDir = path.resolve(rootDir, '../Metro lines');
const publicDir = path.resolve(rootDir, 'public');
const photosTargetDir = path.resolve(publicDir, 'photos');
const dataTargetDir = path.resolve(publicDir, 'data');
const archiveJsonPath = path.resolve(dataTargetDir, 'archive.json');

// City directory alias mapping
const DIR_NAME_MAP = {
  'Hongkong': 'Hong Kong',
  'Japan-Kyoto': 'Kyoto',
  'Japan-Osaka': 'Osaka',
  'Japan-Tokyo': 'Tokyo',
  'Japan-Yokohama': 'Yokohama',
  'Korea-Busan': 'Busan',
  'Korea-Seoul': 'Seoul',
};

// Import city presets from cities.ts
const citiesFileContent = fs.readFileSync(path.resolve(rootDir, 'src/lib/cities.ts'), 'utf-8');
const presetMatch = citiesFileContent.match(/export const CITY_PRESETS:\s*CityPreset\[\]\s*=\s*(\[[\s\S]*?\]);/);
let cityPresets = [];
if (presetMatch) {
  try {
    // Evaluate safely
    cityPresets = eval(presetMatch[1]);
  } catch (err) {
    console.warn('Failed to parse CITY_PRESETS, using fallback mapping:', err);
  }
}

function findPreset(dirName) {
  const targetName = DIR_NAME_MAP[dirName] || dirName;
  return cityPresets.find(p => p.name.toLowerCase() === targetName.toLowerCase()) || {
    name: targetName,
    country: 'Global',
    lat: 0,
    lon: 0,
    totalLines: 0,
  };
}

// Ensure target directories exist
fs.mkdirSync(photosTargetDir, { recursive: true });
fs.mkdirSync(dataTargetDir, { recursive: true });

// Read existing archive if present to preserve user edits (notes, tripDate, etc.)
let existingArchive = { cities: [], photos: [] };
if (fs.existsSync(archiveJsonPath)) {
  try {
    existingArchive = JSON.parse(fs.readFileSync(archiveJsonPath, 'utf-8'));
  } catch (e) {
    console.warn('Could not read existing archive.json, starting fresh');
  }
}

const existingCityMap = new Map();
for (const c of existingArchive.cities || []) {
  existingCityMap.set(c.name.toLowerCase(), c);
}

if (!fs.existsSync(sourceMetroDir)) {
  console.error(`Source directory not found: ${sourceMetroDir}`);
  process.exit(1);
}

const entries = fs.readdirSync(sourceMetroDir, { withFileTypes: true });
const cityDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

const generatedCities = [];
const generatedPhotos = [];

for (const dirName of cityDirs) {
  const dirPath = path.join(sourceMetroDir, dirName);
  const files = fs.readdirSync(dirPath).filter(f => !f.startsWith('.') && /\.(jpe?g|png|webp)$/i.test(f));
  
  if (files.length === 0) continue;

  const preset = findPreset(dirName);
  const cityName = preset.name;
  const cityId = cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const targetCityPhotoDir = path.join(photosTargetDir, dirName);
  fs.mkdirSync(targetCityPhotoDir, { recursive: true });

  const numLines = new Set();
  const otherLines = new Set();

  for (const f of files) {
    // Copy photo to public/photos/<Dir>/<File>
    const srcFile = path.join(dirPath, f);
    const destFile = path.join(targetCityPhotoDir, f);
    if (!fs.existsSync(destFile) || fs.statSync(srcFile).size !== fs.statSync(destFile).size) {
      fs.copyFileSync(srcFile, destFile);
    }

    // Determine line info
    const base = f.replace(/\.[^/.]+$/, '');
    let linePart = base;
    if (linePart.includes('-')) {
      linePart = linePart.substring(linePart.indexOf('-') + 1);
    }
    const match = linePart.match(/^(?:line\s*[-_]?\s*|l)?(\d+)/i);
    if (match) {
      numLines.add(parseInt(match[1], 10));
    } else {
      otherLines.add(linePart.toLowerCase());
    }

    generatedPhotos.push({
      id: `${cityId}-${f.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      cityId,
      filename: f,
      caption: '',
      data: `photos/${dirName}/${f}`,
    });
  }

  // Check if city already exists in existing archive to preserve user tripDate or manual notes
  const existing = existingCityMap.get(cityName.toLowerCase());

  const coveredCount = existing?.coveredLines ?? numLines.size;
  const otherCount = existing?.otherLines ?? otherLines.size;
  const totalCount = existing?.totalLines ?? Math.max(preset.totalLines || 0, coveredCount);

  generatedCities.push({
    id: existing?.id || cityId,
    name: cityName,
    country: existing?.country || preset.country,
    lat: existing?.lat || preset.lat,
    lon: existing?.lon || preset.lon,
    tripDate: existing?.tripDate || '',
    totalLines: totalCount,
    coveredLines: coveredCount,
    otherLines: otherCount,
    notes: existing?.notes || undefined,
    systemName: existing?.systemName || preset.systemName,
    createdAt: existing?.createdAt || new Date().toISOString(),
  });
}

// Write out archive.json
const outputArchive = {
  generatedAt: new Date().toISOString(),
  cities: generatedCities,
  photos: generatedPhotos,
};

fs.writeFileSync(archiveJsonPath, JSON.stringify(outputArchive, null, 2), 'utf-8');
console.log(`Synced ${generatedCities.length} cities and ${generatedPhotos.length} photos into public/photos and ${archiveJsonPath}`);
