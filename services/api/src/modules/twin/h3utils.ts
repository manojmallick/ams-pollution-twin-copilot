// H3 utility wrappers — gracefully degrade if h3-js is unavailable
let h3: typeof import('h3-js') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  h3 = require('h3-js');
} catch {
  // h3-js not installed, use deterministic fallback
}

// Resolution 6 gives ~10km cells — ideal for a country-wide view of the Netherlands (~2000 cells)
const H3_RESOLUTION = 6;

export function latLonToCellId(lat: number, lon: number): string {
  if (h3) return h3.latLngToCell(lat, lon, H3_RESOLUTION);
  // Deterministic fallback: grid at ~5km resolution
  const latQ = Math.floor(lat * 20) / 20;
  const lonQ = Math.floor(lon * 20) / 20;
  return `FAKE_H3_${latQ}_${lonQ}_r${H3_RESOLUTION}`;
}

export function cellIdToCenter(cellId: string): { lat: number; lon: number } | null {
  if (h3) {
    try {
      const [lat, lon] = h3.cellToLatLng(cellId);
      return { lat, lon };
    } catch {
      return null;
    }
  }
  // Parse fallback
  const m = cellId.match(/FAKE_H3_(-?\d+\.\d+)_(-?\d+\.\d+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
}

// Netherlands bounding box cells at resolution 7 (real or synthetic)
export function getNetherlandsCells(): string[] {
  if (h3) {
    // Netherlands bbox corners [lat, lng]
    const polygon: [number, number][] = [
      [53.55, 3.36],
      [53.55, 7.23],
      [50.75, 7.23],
      [50.75, 3.36],
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (h3 as any).polygonToCells(polygon, H3_RESOLUTION);
  }
  // Synthetic grid at ~0.1° spacing (~10km) covering the Netherlands
  const cells: string[] = [];
  for (let lat = 50.75; lat <= 53.55; lat += 0.1) {
    for (let lon = 3.36; lon <= 7.23; lon += 0.1) {
      cells.push(latLonToCellId(lat, lon));
    }
  }
  return cells;
}

export { H3_RESOLUTION };
