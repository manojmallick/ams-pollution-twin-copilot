import type { RawObservation, FetchResult } from './types';

// TODO: replace with persistent store in production
// In-memory store for hackathon reliability
const observationsStore: RawObservation[] = [];
const fetchLogStore: FetchResult[] = [];

export function saveObservations(observations: RawObservation[]): void {
  // Append new observations
  observationsStore.push(...observations);
  // Keep only the most recent 1000 to prevent memory leak
  if (observationsStore.length > 1000) {
    observationsStore.splice(0, observationsStore.length - 1000);
  }
}

export function saveFetchLog(result: FetchResult): void {
  fetchLogStore.push(result);
  if (fetchLogStore.length > 100) {
    fetchLogStore.splice(0, fetchLogStore.length - 100);
  }
}

export function getLatestFetchStatus(): Array<{ sourceId: string; lastSeenUtc: string; freshnessMinutes: number }> {
  // Find the latest fetch for each source
  const latestBySource = new Map<string, string>();
  for (const log of fetchLogStore) {
    const existing = latestBySource.get(log.sourceId);
    if (!existing || new Date(log.fetchedAt) > new Date(existing)) {
      latestBySource.set(log.sourceId, log.fetchedAt);
    }
  }

  const results: Array<{ sourceId: string; lastSeenUtc: string; freshnessMinutes: number }> = [];
  for (const [sourceId, lastSeenUtc] of latestBySource.entries()) {
    results.push({
      sourceId,
      lastSeenUtc,
      freshnessMinutes: Math.floor((Date.now() - new Date(lastSeenUtc).getTime()) / 60_000),
    });
  }

  return results;
}

export function getLatestObservations(): RawObservation[] {
  // Return recent observations, sorted by timestamp descending
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).getTime();
  const recent = observationsStore.filter(o => new Date(o.timestampUtc).getTime() >= twoHoursAgo);
  recent.sort((a, b) => new Date(b.timestampUtc).getTime() - new Date(a.timestampUtc).getTime());
  return recent.slice(0, 100);
}
