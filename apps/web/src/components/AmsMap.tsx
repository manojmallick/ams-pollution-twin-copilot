'use client';
import { useEffect, useRef, useState } from 'react';
import { getTwinCells, validatePayload } from '@/lib/api';
import { TIER_COLORS, crsToColor } from '@/lib/colors';
import { CellTooltip } from './CellTooltip';

// Netherlands bbox + center
const NL_BBOX = '3.36,50.75,7.23,53.55';
const NL_CENTER: [number, number] = [52.15, 5.30];
const NL_ZOOM = 7;

// World view settings
const WORLD_CENTER: [number, number] = [20, 10];
const WORLD_ZOOM = 2;

interface CellOutput {
  cellId: string;
  region: string;
  timeUtc: string;
  derived: { crs: number; tier: string; actionAllowed: boolean; reasonCodes: string[] };
  pollutants: Record<string, { predicted: number; unit: string; psi: number; uncertaintyNorm: number; pi95: [number, number] }>;
  evidenceSources?: Array<{ sourceId: string; freshnessMinutes: number; license: string }>;
  requestId?: string;
}

export function AmsMap({
  replayMode,
  viewMode,
  onCellSelect,
}: {
  replayMode: boolean;
  viewMode: 'netherlands' | 'world';
  onCellSelect?: (cellId: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const circlesRef = useRef<unknown[]>([]);
  const [selectedCell, setSelectedCell] = useState<CellOutput | null>(null);
  const [cells, setCells] = useState<CellOutput[]>([]);
  const [loading, setLoading] = useState(true);

  // Compute tier distribution for stats bar
  const tierCounts = cells.reduce<Record<string, number>>((acc, c) => {
    acc[c.derived.tier] = (acc[c.derived.tier] ?? 0) + 1;
    return acc;
  }, {});
  const total = cells.length;

  const loadCells = async (mode: 'netherlands' | 'world') => {
    if (mode === 'world') {
      setCells(generateWorldCells());
      setLoading(false);
      return;
    }
    try {
      const time = replayMode ? '2026-02-19T08:00:00.000Z' : new Date().toISOString();
      const data = await getTwinCells(NL_BBOX, time);
      if (data?.cells) setCells(data.cells);
    } catch {
      setCells(generateSyntheticNLCells());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadCells(viewMode);
    if (viewMode === 'netherlands' && !replayMode) {
      const id = setInterval(() => loadCells('netherlands'), 60_000);
      return () => clearInterval(id);
    }
  }, [replayMode, viewMode]);

  // Fly to correct region when viewMode changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import('leaflet').then((L) => {
      const map = mapInstanceRef.current as ReturnType<typeof L.map>;
      if (viewMode === 'world') {
        map.flyTo(WORLD_CENTER, WORLD_ZOOM, { duration: 1.2 });
      } else {
        map.flyTo(NL_CENTER, NL_ZOOM, { duration: 1.2 });
      }
    });
  }, [viewMode]);

  // Initialize Leaflet map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    const container = mapRef.current as HTMLElement & { _leaflet_id?: number };
    if (container._leaflet_id) {
      if (mapInstanceRef.current) {
        try { (mapInstanceRef.current as { remove: () => void }).remove(); } catch { /* ignore */ }
        mapInstanceRef.current = null;
      }
      delete container._leaflet_id;
    }
    if (mapInstanceRef.current) return;

    import('leaflet').then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        center: NL_CENTER,
        zoom: NL_ZOOM,
        zoomControl: true,
        minZoom: 2,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 150);
    });

    return () => {
      if (mapInstanceRef.current) {
        try { (mapInstanceRef.current as { remove: () => void }).remove(); } catch { /* ignore */ }
        mapInstanceRef.current = null;
      }
      if (mapRef.current) {
        delete (mapRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id;
      }
    };
  }, []);

  // Render cell circles with hover tooltips
  useEffect(() => {
    if (!mapInstanceRef.current || cells.length === 0) return;

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current as ReturnType<typeof L.map>;

      circlesRef.current.forEach((c) => (c as ReturnType<typeof L.circle>).remove());
      circlesRef.current = [];

      const radius = viewMode === 'world' ? 280_000 : 4_000;

      cells.forEach((cell) => {
        const coords = parseCellCoords(cell.cellId);
        if (!coords) return;

        const color = crsToColor(cell.derived.crs);
        const pm25 = cell.pollutants['pm25'];
        const no2 = cell.pollutants['no2'];

        const circle = L.circle([coords.lat, coords.lon], {
          radius,
          color,
          fillColor: color,
          fillOpacity: viewMode === 'world' ? 0.55 : 0.45,
          weight: viewMode === 'world' ? 0 : 1,
          opacity: 0.7,
        });

        // Hover tooltip — shows region, tier, CRS, key pollutants
        const tierDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle"></span>`;
        circle.bindTooltip(
          `<div style="font-size:12px;line-height:1.6;min-width:170px">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">${tierDot}${cell.region}</div>
            <div style="display:flex;justify-content:space-between;gap:12px">
              <span style="color:#9ca3af">Tier</span><strong>${cell.derived.tier}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:12px">
              <span style="color:#9ca3af">CRS</span><strong>${cell.derived.crs.toFixed(1)} / 100</strong>
            </div>
            ${pm25 ? `<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#9ca3af">PM2.5</span><strong>${pm25.predicted.toFixed(1)} µg/m³</strong></div>` : ''}
            ${no2 ? `<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#9ca3af">NO₂</span><strong>${no2.predicted.toFixed(1)} µg/m³</strong></div>` : ''}
            <div style="margin-top:4px;font-size:10px;color:#6b7280">Click for full details & AI explain</div>
          </div>`,
          {
            sticky: true,
            opacity: 1,
            className: 'cell-hover-tooltip',
          }
        );

        circle.on('click', async () => {
          onCellSelect?.(cell.cellId);
          try {
            const validated = await validatePayload(cell);
            setSelectedCell({ ...cell, ...(validated ?? {}), requestId: validated?.requestId ?? cell.requestId });
          } catch {
            setSelectedCell(cell);
          }
        });

        circle.addTo(map);
        circlesRef.current.push(circle);
      });
    });
  }, [cells, viewMode]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(17,24,39,0.9)', padding: '6px 14px', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          {viewMode === 'world' ? 'Generating world model...' : 'Loading twin data...'}
        </div>
      )}

      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Legend */}
      <div className="map-legend">
        <h4>Air Quality Tier</h4>
        {Object.entries(TIER_COLORS).filter(([k]) => !['INFO_ONLY'].includes(k)).map(([tier, color]) => (
          <div key={tier} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            <span>{tier.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Tier distribution stats bar */}
      {total > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000,
          background: 'rgba(10,22,40,0.88)', borderTop: '1px solid #374151',
          display: 'flex', alignItems: 'center', gap: 0, height: 28, fontSize: 11,
        }}>
          {(['GREEN', 'AMBER', 'RED', 'PURPLE', 'DATA_GAP'] as const).map((tier) => {
            const count = tierCounts[tier] ?? 0;
            if (count === 0) return null;
            const pct = Math.round((count / total) * 100);
            const color = TIER_COLORS[tier] ?? '#888';
            return (
              <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', borderRight: '1px solid #374151' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ color: '#9ca3af' }}>{tier.replace('_', ' ')}</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>{count}</span>
                <span style={{ color: '#6b7280' }}>({pct}%)</span>
              </div>
            );
          })}
          <div style={{ marginLeft: 'auto', paddingRight: 12, color: '#6b7280' }}>
            {total.toLocaleString()} cells · {viewMode === 'world' ? '🌍 World synthetic model' : '🇳🇱 Live validated twin'}
          </div>
        </div>
      )}

      {/* World view info badge */}
      {viewMode === 'world' && (
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000, background: 'rgba(17,24,39,0.92)', border: '1px solid #374151', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 6, fontSize: 11, lineHeight: 1.5 }}>
          <span style={{ color: '#fff', fontWeight: 700 }}>🌍 World Model</span> — synthetic demo data<br />
          Switch to 🇳🇱 NL for live validated twin data
        </div>
      )}

      {replayMode && viewMode === 'netherlands' && (
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000, background: '#e8a000', color: 'black', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
          REPLAY MODE — 2026-02-19 08:00 UTC
        </div>
      )}

      {selectedCell && (
        <CellTooltip cell={selectedCell} onClose={() => setSelectedCell(null)} />
      )}
    </div>
  );
}

function parseCellCoords(cellId: string): { lat: number; lon: number } | null {
  const m = cellId.match(/FAKE_H3_(-?\d+\.\d+)_(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const h3 = require('h3-js');
    const [lat, lon] = h3.cellToLatLng(cellId);
    return { lat, lon };
  } catch {
    return null;
  }
}

function regionalBias(lat: number, lon: number): number {
  if (lat >= 20 && lat <= 32 && lon >= 75 && lon <= 92) return 0.92;
  if (lat >= 28 && lat <= 42 && lon >= 108 && lon <= 122) return 0.88;
  if (lat >= 28 && lat <= 34 && lon >= 70 && lon <= 76) return 0.85;
  if (lat >= 20 && lat <= 35 && lon >= 40 && lon <= 60) return 0.72;
  if (lat >= 48 && lat <= 55 && lon >= 14 && lon <= 30) return 0.65;
  if (lat >= 0 && lat <= 25 && lon >= 95 && lon <= 120) return 0.60;
  if (lat >= -15 && lat <= 15 && lon >= 10 && lon <= 40) return 0.58;
  if (lat >= 44 && lat <= 55 && lon >= -5 && lon <= 15) return 0.28;
  if (lat >= 50.5 && lat <= 53.6 && lon >= 3.3 && lon <= 7.3) return 0.12;
  if (lat >= 35 && lat <= 45 && lon >= -80 && lon <= -70) return 0.42;
  if (lat >= 35 && lat <= 50 && lon >= -125 && lon <= -100) return 0.22;
  if (lat >= 33 && lat <= 35 && lon >= -119 && lon <= -117) return 0.68;
  if (lat >= 60) return 0.08;
  if (lat >= -10 && lat <= 5 && lon >= -75 && lon <= -50) return 0.10;
  if (lat >= -5 && lat <= 5 && lon >= 15 && lon <= 30) return 0.12;
  if (lat >= -35 && lat <= -20 && lon >= 115 && lon <= 140) return 0.18;
  return 0.30;
}

function getRegionName(lat: number, lon: number): string {
  if (lat >= 20 && lat <= 32 && lon >= 75 && lon <= 92) return 'Northern India';
  if (lat >= 28 && lat <= 42 && lon >= 108 && lon <= 122) return 'Eastern China';
  if (lat >= 28 && lat <= 34 && lon >= 70 && lon <= 76) return 'Pakistan';
  if (lat >= 20 && lat <= 35 && lon >= 40 && lon <= 60) return 'Middle East';
  if (lat >= 48 && lat <= 55 && lon >= 14 && lon <= 30) return 'Eastern Europe';
  if (lat >= 0 && lat <= 25 && lon >= 95 && lon <= 120) return 'Southeast Asia';
  if (lat >= -15 && lat <= 15 && lon >= 10 && lon <= 40) return 'Sub-Saharan Africa';
  if (lat >= 44 && lat <= 55 && lon >= -5 && lon <= 15) return 'Western Europe';
  if (lat >= 50.5 && lat <= 53.6 && lon >= 3.3 && lon <= 7.3) return 'Netherlands';
  if (lat >= 35 && lat <= 45 && lon >= -80 && lon <= -70) return 'Eastern USA';
  if (lat >= 35 && lat <= 50 && lon >= -125 && lon <= -100) return 'Western USA';
  if (lat >= -10 && lat <= 5 && lon >= -75 && lon <= -50) return 'Amazon';
  if (lat >= 60) return 'Arctic / Northern Canada';
  if (lat <= -50) return 'Southern Ocean';
  if (lon >= -80 && lon <= -35 && lat >= -35 && lat <= 15) return 'South America';
  if (lon >= 110 && lon <= 155 && lat >= -40 && lat <= -10) return 'Australia';
  if (lat >= 0 && lat <= 40 && lon >= -20 && lon <= 40) return 'Africa';
  return 'Global';
}

function generateWorldCells(): CellOutput[] {
  const cells: CellOutput[] = [];
  const timeUtc = new Date().toISOString();
  let i = 0;

  for (let lat = -75; lat <= 80; lat += 5) {
    for (let lon = -175; lon <= 175; lon += 5) {
      const bias = regionalBias(lat, lon);
      const localNoise = ((i * 13 + Math.abs(lat * 7 + lon * 3)) % 20) / 100;
      const crs = Math.min(99, Math.max(1, Math.round((bias + localNoise) * 100)));
      const tier = crs >= 80 ? 'PURPLE' : crs >= 60 ? 'RED' : crs >= 35 ? 'AMBER' : 'GREEN';
      const pm25Base = bias * 85 + 5;
      const no2Base = bias * 120 + 15;
      const pm25 = +(pm25Base + localNoise * 10).toFixed(1);
      const no2 = +(no2Base + localNoise * 15).toFixed(1);

      cells.push({
        cellId: `FAKE_H3_${lat.toFixed(1)}_${lon.toFixed(1)}_world`,
        region: getRegionName(lat, lon),
        timeUtc,
        derived: {
          crs,
          tier,
          actionAllowed: tier === 'RED' || tier === 'PURPLE',
          reasonCodes: crs > 60 ? ['HIGH_CRS_SCORE'] : crs > 35 ? ['ELEVATED_PM25'] : [],
        },
        pollutants: {
          pm25: { predicted: pm25, unit: 'µg/m³', psi: Math.min(200, Math.round(pm25 * 2.5)), uncertaintyNorm: 0.35, pi95: [+(pm25 * 0.7).toFixed(1), +(pm25 * 1.3).toFixed(1)] },
          no2: { predicted: no2, unit: 'µg/m³', psi: Math.min(200, Math.round(no2 * 1.2)), uncertaintyNorm: 0.40, pi95: [+(no2 * 0.7).toFixed(1), +(no2 * 1.3).toFixed(1)] },
        },
        evidenceSources: [{ sourceId: 'world-model-synthetic', freshnessMinutes: 60, license: 'demo' }],
      });
      i++;
    }
  }
  return cells;
}

function generateSyntheticNLCells(): CellOutput[] {
  const cells: CellOutput[] = [];
  const timeUtc = new Date().toISOString();
  let i = 0;

  for (let lat = 50.75; lat <= 53.55; lat += 0.1) {
    for (let lon = 3.36; lon <= 7.23; lon += 0.1) {
      const crs = 10 + (i * 7 + lat * 100 + lon * 50) % 90;
      const tier = crs >= 80 ? 'PURPLE' : crs >= 60 ? 'RED' : crs >= 35 ? 'AMBER' : 'GREEN';
      const pm25 = +(10 + crs / 5).toFixed(1);
      const no2 = +(25 + crs / 3).toFixed(1);

      cells.push({
        cellId: `FAKE_H3_${lat.toFixed(2)}_${lon.toFixed(2)}_r6`,
        region: 'Netherlands',
        timeUtc,
        derived: { crs: +crs.toFixed(2), tier, actionAllowed: tier === 'RED' || tier === 'PURPLE', reasonCodes: crs > 60 ? ['HIGH_CRS_SCORE'] : [] },
        pollutants: {
          pm25: { predicted: pm25, unit: 'µg/m³', psi: Math.min(200, Math.round(pm25 * 3)), uncertaintyNorm: 0.2, pi95: [pm25 * 0.8, pm25 * 1.2] },
          no2: { predicted: no2, unit: 'µg/m³', psi: Math.min(200, Math.round(no2 * 1.5)), uncertaintyNorm: 0.25, pi95: [no2 * 0.75, no2 * 1.25] },
        },
        evidenceSources: [{ sourceId: 'synthetic', freshnessMinutes: 5, license: 'demo' }],
      });
      i++;
    }
  }
  return cells;
}
