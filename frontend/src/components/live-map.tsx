'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
type Point = { lat: number; lng: number; at: string };
export function LiveMap({
  restaurant,
  drop,
  location,
}: {
  restaurant: { name: string; lat: number; lng: number };
  drop: { lat: number; lng: number } | null;
  location: Point | null;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    rider = useRef<Leaflet.CircleMarker | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    void import('leaflet')
      .then((L) => {
        if (disposed || !container.current) return;
        const instance = L.map(container.current, { scrollWheelZoom: false }).setView(
          [restaurant.lat, restaurant.lng],
          15,
        );
        map.current = instance;
        L.tileLayer(
          process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution:
              process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        )
          .on('tileerror', () => {
            if (!disposed) setError(true);
          })
          .addTo(instance);
        const caption = document.createElement('span');
        caption.textContent = restaurant.name;
        L.circleMarker([restaurant.lat, restaurant.lng], {
          radius: 11,
          color: '#fff',
          weight: 3,
          fillColor: '#245c42',
          fillOpacity: 1,
        })
          .bindTooltip(caption)
          .addTo(instance);
        if (drop) {
          L.circleMarker([drop.lat, drop.lng], {
            radius: 10,
            color: '#fff',
            weight: 3,
            fillColor: '#7e9856',
            fillOpacity: 1,
          })
            .bindTooltip('Your delivery location')
            .addTo(instance);
          instance.fitBounds(
            [
              [restaurant.lat, restaurant.lng],
              [drop.lat, drop.lng],
            ],
            { padding: [35, 35], maxZoom: 16 },
          );
        }
        setReady(true);
      })
      .catch(() => setError(true));
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      rider.current = null;
    };
  }, [restaurant.lat, restaurant.lng, restaurant.name, drop?.lat, drop?.lng]);
  useEffect(() => {
    if (!ready || !location || !map.current) return;
    void import('leaflet').then((L) => {
      if (!map.current) return;
      const point: Leaflet.LatLngTuple = [location.lat, location.lng];
      if (rider.current) rider.current.setLatLng(point);
      else
        rider.current = L.circleMarker(point, {
          radius: 12,
          color: '#fff',
          weight: 3,
          fillColor: '#d49c48',
          fillOpacity: 1,
        })
          .bindTooltip('Your delivery partner')
          .addTo(map.current);
      if (!map.current.getBounds().contains(point))
        map.current.panTo(point, {
          animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
    });
  }, [ready, location]);
  return (
    <>
      <div
        ref={container}
        className="leaflet-map"
        role="region"
        aria-label="Live restaurant and rider map"
      />
      {error && (
        <p className="form-hint" role="status">
          Map tiles are unavailable. Coordinates and delivery updates still work.
        </p>
      )}
      <p className="form-hint" style={{ marginTop: 8 }}>
        Green: restaurant · Light green: delivery point · Amber: last rider position
      </p>
    </>
  );
}
