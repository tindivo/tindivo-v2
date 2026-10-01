/**
 * Distancia en línea recta (círculo máximo, fórmula haversine). Tercer uso de
 * esta fórmula en el repo (ya existía en `apps/customer/lib/coverage.ts` y
 * `apps/motorizados/lib/geo.ts`) — regla del repo: extraer con 3+ usos
 * (Docs/Encargos/03-plan-tecnico.md §1.3). `create_courier_order` la usa en el
 * servidor para guardar `distance_m` (no decide el precio todavía).
 */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
