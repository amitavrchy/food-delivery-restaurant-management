export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function rankRiders<
  T extends {
    userId: string;
    lat: number | null;
    lng: number | null;
    ratingAvg: number;
    capacity: number;
    active: number;
  },
>(riders: T[], origin: { lat: number; lng: number }, radius: number) {
  return riders
    .filter((r) => r.lat != null && r.lng != null && r.active < r.capacity)
    .map((r) => ({ ...r, distance: haversine(origin, { lat: r.lat!, lng: r.lng! }) }))
    .filter((r) => r.distance <= radius)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        b.ratingAvg - a.ratingAvg ||
        a.active - b.active ||
        a.userId.localeCompare(b.userId),
    );
}
export function expandedRadius(base: number, attempt: number) {
  return Math.min(base * 2 ** attempt, base * 8);
}
export function estimateMinutes(prep: number, queue: number, distance: number) {
  return Math.ceil(prep + Math.min(queue * 2, 20) + (distance / 18) * 60 * 1.25);
}
