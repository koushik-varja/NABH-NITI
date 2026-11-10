/** Display-space mapping. Does NOT modify the authoritative simulation grid.
 * Spacing is deliberately larger than the UAV meshes to prevent the 500-agent
 * simulation from looking like a pile of overlapping aircraft.
 */
import type { Drone, Frame, Point } from './types';

export const CITY_CELL_METERS = 3.2; // illustrative display units per discrete simulator cell
export const ALTITUDE_GAP = 5.6;
export const BASE_FLIGHT_HEIGHT = 13;
export const cityDimensions = (g: Frame['grid']) => ({ width: Math.round(g.width * CITY_CELL_METERS), height: Math.round(g.height * CITY_CELL_METERS) });
export const worldPosition = (p: Point, g: Frame['grid']): [number, number, number] => [
  (p[0] - (g.width - 1) / 2) * CITY_CELL_METERS,
  BASE_FLIGHT_HEIGHT + p[2] * ALTITUDE_GAP,
  (p[1] - (g.height - 1) / 2) * CITY_CELL_METERS,
];

export type RenderScope = 'smart' | 'all' | 'priority' | 'density';
export type FleetFilters = { scope: RenderScope; kind: string; sector: string; altitude: number };

/** Stable, deterministic screen-space decluttering. The full fleet stays in the backend.
 * 'All' is an explicit opt-in diagnostic view; 'Smart' is presentation default.
 */
export function displayFleet(drones: Drone[], filter: FleetFilters, selectedId: number | null): Drone[] {
  const matches = drones.filter(d =>
    (filter.scope !== 'priority' || d.kind === 'medical' || d.priority >= 8 || d.waiting >= 7 || d.id === selectedId) &&
    (filter.kind === 'all' || d.kind === filter.kind || d.id === selectedId) &&
    (filter.sector === 'all' || d.sector === filter.sector || d.id === selectedId) &&
    (filter.altitude === -1 || d.pos[2] === filter.altitude || d.id === selectedId));
  if (filter.scope === 'all') return matches;
  const cap = filter.scope === 'priority' ? 38 : filter.scope === 'density' ? 20 : drones.length <= 80 ? 38 : drones.length <= 250 ? 65 : 78;
  const isPriority = (d: Drone) => d.id === selectedId || (d.kind === 'medical' && d.priority >= 9);
  const score = (d: Drone) =>
    (d.id === selectedId ? 10_000 : 0) +
    (isPriority(d) ? 1_000 : 0) +
    (d.waiting > 4 ? 45 : 0) +
    // Stable pseudorandom ranking to avoid presenting only the lowest IDs.
    (((d.id * 2654435761) >>> 0) % 991) / 991 * 20;
  const ordered = [...matches].sort((a, b) => score(b) - score(a) || a.id - b.id);
  const occupied = new Map<string, number>();
  const chosen: Drone[] = [];
  for (const d of ordered) {
    const bucket = `${Math.floor(d.pos[0] / 2)}:${Math.floor(d.pos[1] / 2)}:${d.pos[2]}`;
    const seen = occupied.get(bucket) || 0;
    if (!isPriority(d) && seen >= 1) continue;
    chosen.push(d);
    occupied.set(bucket, seen + 1);
    if (chosen.length >= cap) break;
  }
  // If dense sectors exhausted a cap prematurely, preserve broad airspace coverage.
  if (chosen.length < Math.min(cap, matches.length)) {
    const ids = new Set(chosen.map(d => d.id));
    for (const d of ordered) {
      if (chosen.length >= cap) break;
      if (!ids.has(d.id)) { chosen.push(d); ids.add(d.id); }
    }
  }
  return chosen;
}

export function detailedFleet(drones: Drone[], selectedId: number | null): Drone[] {
  const cap = drones.length > 55 ? 13 : 21;
  const chosen = [...drones].sort((a, b) => {
    const val = (d: Drone) => (d.id === selectedId ? 1e7 : 0)
      + (d.kind === 'medical' && d.priority >= 9 ? 1000 : 0)
      - ((d.pos[0] - 11.5) ** 2) - ((d.pos[1] - 9.5) ** 2)
      - ((d.pos[2] - 1.5) ** 2) * 9;
    return val(b) - val(a) || a.id - b.id;
  });
  return chosen.slice(0, cap);
}
