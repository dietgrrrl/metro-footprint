import type { Photo } from './types';

export interface ParsedPhotoLine {
  isNumeric: boolean;
  num: number;
  suffix: string;
  name: string;
  raw: string;
}

/**
 * Parses a photo filename into line sorting components.
 * e.g. "Changsha-1.jpeg" -> { isNumeric: true, num: 1, suffix: "", name: "1" }
 * e.g. "Chengdu-7n.jpeg"  -> { isNumeric: true, num: 7, suffix: "n", name: "7n" }
 * e.g. "Beijing-AirportExpress.jpeg" -> { isNumeric: false, num: Infinity, suffix: "", name: "airportexpress" }
 */
export function parsePhotoLine(filename: string, cityName?: string): ParsedPhotoLine {
  // Strip extension
  const base = filename.replace(/\.[^/.]+$/, '').trim();

  let linePart = base;
  if (cityName) {
    const escaped = cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-_\s]+/g, '[-_\\s]+');
    linePart = linePart.replace(new RegExp(`^${escaped}[-_\\s]*`, 'i'), '');
  }

  // If cityName was not matched or not provided, strip city prefix if separated by '-'
  if (linePart === base && base.includes('-')) {
    linePart = base.substring(base.indexOf('-') + 1);
  }

  linePart = linePart.trim();

  // Match lines with numbers: e.g. "1", "10", "7n", "Line 1", "Line-2"
  const match = linePart.match(/^(?:line\s*[-_]?\s*|l)?(\d+)(.*)$/i);
  if (match) {
    return {
      isNumeric: true,
      num: parseInt(match[1], 10),
      suffix: match[2].trim().toLowerCase(),
      name: linePart.toLowerCase(),
      raw: filename,
    };
  }

  return {
    isNumeric: false,
    num: Infinity,
    suffix: '',
    name: linePart.toLowerCase(),
    raw: filename,
  };
}

/**
 * Comparator function for sorting photos:
 * 1. Numbered lines appear first, sorted numerically (1, 2, ..., 9, 10, 11...).
 * 2. If line numbers match, suffixes/full names are compared naturally (e.g. 7n vs 7w).
 * 3. Other/named lines appear after, sorted in alphabetical order (e.g. AirportExpress, Maglev, Tram).
 */
export function comparePhotos(
  a: Photo | { filename: string } | string,
  b: Photo | { filename: string } | string,
  cityName?: string
): number {
  const fileA = typeof a === 'string' ? a : a.filename;
  const fileB = typeof b === 'string' ? b : b.filename;

  const pa = parsePhotoLine(fileA, cityName);
  const pb = parsePhotoLine(fileB, cityName);

  // Numbered lines come before non-numbered/named lines
  if (pa.isNumeric && !pb.isNumeric) return -1;
  if (!pa.isNumeric && pb.isNumeric) return 1;

  if (pa.isNumeric && pb.isNumeric) {
    // Sort by primary line number
    if (pa.num !== pb.num) return pa.num - pb.num;
    // Suffix comparison (e.g. 7n vs 7w)
    if (pa.suffix !== pb.suffix) {
      return pa.suffix.localeCompare(pb.suffix, undefined, { numeric: true });
    }
    return fileA.localeCompare(fileB, undefined, { numeric: true });
  }

  // Both are named lines: alphabetical order
  const cmp = pa.name.localeCompare(pb.name, undefined, { sensitivity: 'base' });
  if (cmp !== 0) return cmp;
  return fileA.localeCompare(fileB, undefined, { numeric: true });
}

/**
 * Returns a new sorted array of photos.
 */
export function sortPhotos<T extends { filename: string }>(photos: T[], cityName?: string): T[] {
  return [...photos].sort((a, b) => comparePhotos(a, b, cityName));
}
