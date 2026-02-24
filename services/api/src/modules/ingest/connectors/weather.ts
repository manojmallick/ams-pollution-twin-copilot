import type { RawObservation, FetchResult } from '../types.js';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const AMSTERDAM_LAT = 52.3676;
const AMSTERDAM_LON = 4.9041;

export async function fetchWeather(): Promise<{ result: FetchResult; observation: Partial<RawObservation> }> {
  const fetchedAt = new Date().toISOString();

  try {
    const url = `${OPEN_METEO_URL}?latitude=${AMSTERDAM_LAT}&longitude=${AMSTERDAM_LON}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&timezone=Europe/Amsterdam`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as {
      current: {
        temperature_2m: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        wind_direction_10m: number;
      };
    };

    const c = data.current;
    return {
      result: { sourceId: 'open-meteo', fetchedAt, count: 1, errors: [] },
      observation: {
        weather: {
          tempC: c.temperature_2m,
          humidityPct: c.relative_humidity_2m,
          windSpeedMs: c.wind_speed_10m / 3.6,
          windDegrees: c.wind_direction_10m,
        },
      },
    };
  } catch (err) {
    return {
      result: { sourceId: 'open-meteo', fetchedAt, count: 0, errors: [String(err)] },
      observation: {
        weather: { tempC: 12, humidityPct: 75, windSpeedMs: 4, windDegrees: 225 },
      },
    };
  }
}
