export interface RawObservation {
  sourceId: string;
  stationId: string;
  lat: number;
  lon: number;
  timestampUtc: string;
  pollutants: {
    pm25?: number;
    no2?: number;
    o3?: number;
  };
  weather?: {
    windSpeedMs?: number;
    windDegrees?: number;
    humidityPct?: number;
    tempC?: number;
  };
  trafficIndex?: number;
  rawPayload: unknown;
}

export interface FetchResult {
  sourceId: string;
  fetchedAt: string;
  count: number;
  errors: string[];
}
