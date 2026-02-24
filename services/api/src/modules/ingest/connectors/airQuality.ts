import type { RawObservation, FetchResult } from '../types.js';

// Amsterdam RIVM/Luchtmeetnet stations (representative subset)
const AMSTERDAM_STATIONS = [
  { id: 'NL10644', name: 'Amsterdam-Vondelpark', lat: 52.3600, lon: 4.8700 },
  { id: 'NL10013', name: 'Amsterdam-Einsteinweg', lat: 52.3386, lon: 4.8450 },
  { id: 'NL10636', name: 'Amsterdam-Stadhouderskade', lat: 52.3580, lon: 4.8920 },
  { id: 'NL10641', name: 'Amsterdam-Jan-van-Galenstraat', lat: 52.3750, lon: 4.8606 },
];

const BASE_URL = 'https://api.luchtmeetnet.nl/open_api';

export async function fetchAirQuality(): Promise<{ result: FetchResult; observations: RawObservation[] }> {
  const observations: RawObservation[] = [];
  const errors: string[] = [];
  const fetchedAt = new Date().toISOString();

  for (const station of AMSTERDAM_STATIONS) {
    try {
      const url = `${BASE_URL}/stations/${station.id}/measurements?formula=PM25&formula=NO2&page=1&order_by=timestamp_measured&order_direction=desc`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!res.ok) {
        errors.push(`${station.id}: HTTP ${res.status}`);
        observations.push(makeSyntheticObservation(station, fetchedAt));
        continue;
      }

      const data = await res.json() as {
        data: Array<{ formula: string; value: number; timestamp_measured: string }>;
      };
      const latest = data.data?.[0];

      if (!latest) {
        observations.push(makeSyntheticObservation(station, fetchedAt));
        continue;
      }

      const pm25entry = data.data.find((d) => d.formula === 'PM25');
      const no2entry = data.data.find((d) => d.formula === 'NO2');

      observations.push({
        sourceId: 'luchtmeetnet',
        stationId: station.id,
        lat: station.lat,
        lon: station.lon,
        timestampUtc: latest.timestamp_measured,
        pollutants: {
          pm25: pm25entry?.value,
          no2: no2entry?.value,
        },
        rawPayload: data.data,
      });
    } catch (err) {
      errors.push(`${station.id}: ${String(err)}`);
      observations.push(makeSyntheticObservation(station, fetchedAt));
    }
  }

  return {
    result: { sourceId: 'luchtmeetnet', fetchedAt, count: observations.length, errors },
    observations,
  };
}

function makeSyntheticObservation(
  station: { id: string; lat: number; lon: number },
  timestampUtc: string
): RawObservation {
  const hour = new Date(timestampUtc).getUTCHours();
  const trafficFactor = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) ? 1.4 : 1.0;
  return {
    sourceId: 'synthetic-fallback',
    stationId: station.id,
    lat: station.lat,
    lon: station.lon,
    timestampUtc,
    pollutants: {
      pm25: +(10 + Math.random() * 20 * trafficFactor).toFixed(1),
      no2: +(25 + Math.random() * 45 * trafficFactor).toFixed(1),
    },
    rawPayload: { synthetic: true },
  };
}
