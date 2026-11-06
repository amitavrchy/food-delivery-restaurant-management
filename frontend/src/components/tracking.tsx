'use client';
import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from './provider';
import { LiveMap } from './live-map';
import { useResource } from '@/lib/hooks';
import type { Order } from '@/lib/types';
export function TrackingMap({ order }: { order: Order }) {
  const { socket } = useApp();
  const [location, setLocation] = useState<{ lat: number; lng: number; at: string } | null>(null);
  useEffect(() => {
    if (!socket) return;
    const join = () => socket.emit('join', { room: `order:${order.id}` });
    const update = (data: { orderId: string; lat: number; lng: number; at: string }) => {
      if (data.orderId === order.id) setLocation(data);
    };
    join();
    socket.on('connect', join);
    socket.on('rider.location', update);
    return () => {
      socket.off('connect', join);
      socket.off('rider.location', update);
    };
  }, [socket, order.id]);
  const { data: tracking } = useResource<{
    location: { lat: number; lng: number; at: string } | null;
  }>(`orders/${order.id}/tracking`);
  useEffect(() => {
    if (tracking) setLocation(tracking.location);
  }, [tracking]);
  const destination =
    order.dropLat && order.dropLng
      ? `${order.dropLat},${order.dropLng}`
      : order.deliveryAddress || order.restaurant.address;
  return (
    <>
      <LiveMap
        restaurant={order.restaurant}
        drop={
          order.dropLat != null && order.dropLng != null
            ? { lat: order.dropLat, lng: order.dropLng }
            : null
        }
        location={location}
      />
      {location && (
        <p className="form-hint" role="status" style={{ marginTop: 10 }}>
          Rider location: {location.lat.toFixed(5)}, {location.lng.toFixed(5)} · Updated{' '}
          {new Date(location.at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka' })}
        </p>
      )}
      <a
        href={
          order.dropLat != null && order.dropLng != null
            ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${order.restaurant.lat},${order.restaurant.lng};${order.dropLat},${order.dropLng}`
            : `https://www.openstreetmap.org/search?query=${encodeURIComponent(order.deliveryAddress || order.restaurant.address)}`
        }
        target="_blank"
        rel="noreferrer"
        className="text-link"
        style={{ marginTop: 14 }}
      >
        <MapPin size={17} />
        Open delivery map
      </a>
    </>
  );
}
