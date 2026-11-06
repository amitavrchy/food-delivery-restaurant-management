'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, post } from '@/lib/api';
import type { CartLine, Restaurant, User } from '@/lib/types';
type Notice = { id: number; text: string; error: boolean };
type Context = {
  user: User | null;
  ready: boolean;
  reloadUser: () => Promise<void>;
  logout: () => Promise<void>;
  restaurantId: string;
  setRestaurantId: (id: string) => void;
  restaurants: Restaurant[];
  cart: CartLine[];
  setCart: (lines: CartLine[]) => void;
  notify: (text: string, error?: boolean) => void;
  refresh: () => void;
  version: number;
  socket: Socket | null;
};
const AppContext = createContext<Context>(null!);
export function Provider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [restaurantId, select] = useState('green-fork'),
    [restaurants, setRestaurants] = useState<Restaurant[]>([]),
    [cart, setLines] = useState<CartLine[]>([]),
    [notices, setNotices] = useState<Notice[]>([]),
    [version, setVersion] = useState(0),
    [socket, setSocket] = useState<Socket | null>(null);
  const notify = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n, { id, text, error }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 6000);
  }, []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const reloadUser = useCallback(async () => {
    try {
      const current = await api<User>('auth/me');
      setUser(current);
      if (current.memberships.length)
        select((previous) =>
          current.memberships.some((m) => m.restaurantId === previous)
            ? previous
            : current.memberships[0].restaurantId,
        );
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void reloadUser();
    api<Restaurant[]>('restaurants')
      .then(setRestaurants)
      .catch(() => {});
    try {
      select(localStorage.getItem('restaurant') || 'green-fork');
      setLines(JSON.parse(localStorage.getItem('cart') || '[]'));
    } catch {
      setLines([]);
    }
  }, [reloadUser]);
  useEffect(() => {
    if (!user) return;
    const connection = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
      withCredentials: true,
    });
    setSocket(connection);
    connection.on('order.updated', refresh);
    connection.on('rider.offer', refresh);
    connection.on('ticket.updated', refresh);
    const interval = setInterval(refresh, 15000);
    return () => {
      clearInterval(interval);
      connection.disconnect();
      setSocket(null);
    };
  }, [user, refresh]);
  const setCart = useCallback((lines: CartLine[]) => {
    setLines(lines);
    localStorage.setItem('cart', JSON.stringify(lines));
  }, []);
  const setRestaurantId = useCallback((id: string) => {
    select(id);
    localStorage.setItem('restaurant', id);
  }, []);
  const logout = async () => {
    await post('auth/logout');
    setUser(null);
    setCart([]);
  };
  return (
    <AppContext.Provider
      value={{
        user,
        ready,
        reloadUser,
        logout,
        restaurantId,
        setRestaurantId,
        restaurants,
        cart,
        setCart,
        notify,
        refresh,
        version,
        socket,
      }}
    >
      {children}
      <div className="toasts" aria-live="polite">
        {notices.map((n) => (
          <div
            role={n.error ? 'alert' : 'status'}
            key={n.id}
            className={`toast ${n.error ? 'error' : ''}`}
          >
            <span>{n.error ? '!' : '✓'}</span>
            {n.text}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotices((v) => v.filter((x) => x.id !== n.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
export const useApp = () => useContext(AppContext);
