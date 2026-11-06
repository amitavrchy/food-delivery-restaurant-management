'use client';
import { useEffect, useState } from 'react';
import { Check, ChefHat, Clock3, Flame } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { label, patch } from '@/lib/api';
import type { Restaurant, Ticket } from '@/lib/types';
export default function Kitchen() {
  const { user, restaurantId, socket } = useApp();
  const { data: menu } = useResource<Restaurant>(user ? `restaurants/${restaurantId}/menu` : null);
  const [station, setStation] = useState('all'),
    [filter, setFilter] = useState('Active'),
    [now, setNow] = useState(Date.now());
  const { data, error, loading } = useResource<Ticket[]>(
    user ? `kds/${restaurantId}${station === 'all' ? '' : `?station=${station}`}` : null,
  );
  const { run, busy } = useAction();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!socket || !menu?.stations) return;
    const join = () =>
      menu.stations
        ?.filter((s) => station === 'all' || s.id === station)
        .forEach((s) => socket.emit('join', { room: `kds:${restaurantId}:${s.id}` }));
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
    };
  }, [socket, menu, station, restaurantId]);
  const tickets = (data || []).filter(
    (t) =>
      filter === 'All tickets' || (filter === 'Done' ? t.status === 'DONE' : t.status !== 'DONE'),
  );
  return (
    <>
      <PageHeading
        title="A good rhythm in the kitchen."
        description="One station, one ticket, one thoughtfully made meal at a time."
      >
        <span className="live-indicator">
          <i />
          Live kitchen
        </span>
      </PageHeading>
      <div className="toolbar">
        <div className="tabs">
          {[{ id: 'all', name: 'All stations' }, ...(menu?.stations || [])].map((s) => (
            <button
              key={s.id}
              onClick={() => setStation(s.id)}
              className={station === s.id ? 'active' : ''}
            >
              {s.name}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter kitchen tickets"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 150 }}
        >
          {['Active', 'Done', 'All tickets'].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : tickets.length ? (
        <div className="kitchen-grid">
          {tickets.map((t) => {
            const delay = new Date(t.fireAt).getTime() - now;
            const age = Math.max(0, Math.floor(-delay / 60000));
            const next = (
              { QUEUED: 'COOKING', COOKING: 'DONE', DONE: 'BUMPED' } as Record<string, string>
            )[t.status];
            return (
              <article key={t.id} className={`ticket-card ${t.status.toLowerCase()}`}>
                <header className="ticket-header">
                  <div>
                    <h3>#{String(t.order.number).padStart(4, '0')}</h3>
                    <Badge value={t.status} />
                  </div>
                  <div style={{ marginTop: 9 }}>
                    <small>
                      {t.order.check?.table.code || label(t.order.channel)} · {t.station.name}
                    </small>
                    <span
                      className={age > 20 ? 'danger-text' : 'muted'}
                      style={{ display: 'flex', gap: 5, alignItems: 'center' }}
                    >
                      <Clock3 size={15} />
                      {delay > 0 ? `Fire in ${Math.ceil(delay / 1000)}s` : `${age} min`}
                    </span>
                  </div>
                </header>
                <div className="ticket-items">
                  {t.items.map((i, j) => (
                    <div className="ticket-line" key={j}>
                      <span className="ticket-qty">{i.qty}</span>
                      <div>
                        <strong>{i.name}</strong>
                        {i.modifiers.length > 0 && (
                          <p>{i.modifiers.map((m) => m.name).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {t.order.notes && <div className="note-box">{t.order.notes}</div>}
                </div>
                <footer className="ticket-footer">
                  <span className="form-hint">{label(t.course)} course</span>
                  <button
                    className="btn primary wide"
                    disabled={busy || delay > 0}
                    onClick={() =>
                      void run(
                        () => patch(`kds/${t.id}`, { status: next }),
                        next === 'DONE'
                          ? 'Ticket done. Recipe stock updated.'
                          : next === 'BUMPED'
                            ? 'Ticket bumped.'
                            : 'Cooking started.',
                      )
                    }
                  >
                    {t.status === 'QUEUED' ? (
                      <>
                        <Flame size={17} />
                        Start cooking
                      </>
                    ) : t.status === 'COOKING' ? (
                      <>
                        <Check size={17} />
                        Mark done
                      </>
                    ) : (
                      <>
                        <Check size={17} />
                        Bump ticket
                      </>
                    )}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty title="A calm moment in the kitchen">
          Tickets appear here when an order is accepted. Choose a station to focus your queue.
        </Empty>
      )}
    </>
  );
}
