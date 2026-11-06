'use client';
import { useState } from 'react';
import { CalendarDays, Clock3, Grip, Plus, Users } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Metric, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { date, label, patch, post, time } from '@/lib/api';
import { formText, formNumber, toIso, type Reservation, type Waitlist } from '@/lib/advanced';
import type { Table } from '@/lib/types';
export default function Hospitality() {
  const { user, restaurantId, notify } = useApp();
  const [tab, setTab] = useState('Reservations'),
    [modal, setModal] = useState<'booking' | 'waitlist' | 'table' | null>(null),
    [editing, setEditing] = useState<Table | null>(null);
  const {
    data: reservations,
    error,
    loading,
  } = useResource<Reservation[]>(
    user ? `hospitality/reservations?restaurantId=${restaurantId}` : null,
  );
  const { data: waitlist } = useResource<Waitlist[]>(
    user ? `hospitality/${restaurantId}/waitlist` : null,
  );
  const { data: tables } = useResource<Table[]>(user ? `pos/${restaurantId}/tables` : null);
  const { run, busy } = useAction();
  const privileged =
    user?.role === 'PLATFORM_ADMIN' ||
    user?.memberships.some(
      (m) => m.restaurantId === restaurantId && ['RESTAURANT_OWNER', 'MANAGER'].includes(m.role),
    );
  return (
    <>
      <PageHeading
        eyebrow="HOSPITALITY & FLOOR OPERATIONS"
        title="A thoughtful welcome starts before arrival."
        description="Manage reservations, your waiting guests and the shape of a good service."
      >
        {privileged && (
          <button
            className="btn secondary"
            onClick={() => {
              setEditing(null);
              setModal('table');
            }}
          >
            <Plus size={17} />
            Add table
          </button>
        )}
        <button
          className="btn primary"
          onClick={() => setModal(tab === 'Waitlist' ? 'waitlist' : 'booking')}
        >
          <Plus size={17} />
          {tab === 'Waitlist' ? 'Add waiting guest' : 'New reservation'}
        </button>
      </PageHeading>
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <Metric
          label="Booked gatherings"
          value={reservations?.filter((r) => r.status === 'BOOKED').length || 0}
          detail="Upcoming and active reservations"
          icon={<CalendarDays size={19} />}
        />
        <Metric
          label="Waiting guests"
          value={waitlist?.reduce((s, e) => s + e.partySize, 0) || 0}
          detail={`${waitlist?.length || 0} parties in the queue`}
          icon={<Clock3 size={19} />}
        />
        <Metric
          label="Dining capacity"
          value={tables?.reduce((s, t) => s + t.seats, 0) || 0}
          detail={`${tables?.length || 0} tables on your floor`}
          icon={<Users size={19} />}
        />
      </div>
      <div className="toolbar">
        <div className="tabs">
          {['Reservations', 'Waitlist', 'Floor plan'].map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Floor plan' && (
          <span className="muted">
            Drag tables to an empty position · Scroll the floor horizontally
          </span>
        )}
      </div>
      {loading && !reservations ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : tab === 'Reservations' ? (
        <section className="panel table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Arrival</th>
                <th>Party / table</th>
                <th>Status</th>
                <th>Service action</th>
              </tr>
            </thead>
            <tbody>
              {reservations?.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.guestName}</strong>
                    <small className="cell-meta">{r.phone}</small>
                  </td>
                  <td>
                    {date(r.startsAt)} · {time(r.startsAt)}
                    <small className="cell-meta">Until {time(r.endsAt)}</small>
                  </td>
                  <td>
                    {r.partySize} guests · {r.table?.code}
                  </td>
                  <td>
                    <Badge value={r.status} />
                  </td>
                  <td>
                    <div className="mobile-stack">
                      {r.status === 'BOOKED' && (
                        <>
                          <button
                            className="btn soft small"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  patch(`hospitality/reservations/${r.id}`, { status: 'SEATED' }),
                                'Guests seated and table check opened.',
                              )
                            }
                          >
                            Seat party
                          </button>
                          <button
                            className="text-link danger-text"
                            onClick={() =>
                              void run(
                                () =>
                                  patch(`hospitality/reservations/${r.id}`, { status: 'NO_SHOW' }),
                                'Marked no-show.',
                              )
                            }
                          >
                            No-show
                          </button>
                          <button
                            className="text-link"
                            onClick={() =>
                              void run(
                                () =>
                                  patch(`hospitality/reservations/${r.id}`, {
                                    status: 'CANCELLED',
                                  }),
                                'Reservation cancelled.',
                              )
                            }
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {r.status === 'SEATED' && (
                        <button
                          className="text-link"
                          onClick={() =>
                            void run(
                              () =>
                                patch(`hospitality/reservations/${r.id}`, { status: 'COMPLETED' }),
                              'Visit completed.',
                            )
                          }
                        >
                          Complete visit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!reservations?.length && <Empty title="Room for your next gathering" />}
        </section>
      ) : tab === 'Waitlist' ? (
        <div className="order-grid">
          {waitlist?.length ? (
            waitlist.map((w, i) => (
              <article className="panel panel-body" key={w.id}>
                <div className="summary-row">
                  <span className="queue-number">{String(i + 1).padStart(2, '0')}</span>
                  <Badge value={w.status} />
                </div>
                <h3>
                  {w.guestName} · {w.partySize} guests
                </h3>
                <p className="muted">
                  {w.phone} · Joined {time(w.createdAt)}
                </p>
                <div className="info-pair">
                  <span>Quoted wait</span>
                  <strong>{w.quotedMinutes} min</strong>
                </div>
                {w.notes && <p className="note-box section-gap">{w.notes}</p>}
                <div className="form-actions" style={{ flexWrap: 'wrap' }}>
                  {w.status === 'WAITING' && (
                    <button
                      className="btn secondary"
                      onClick={() =>
                        void run(
                          () => patch(`hospitality/waitlist/${w.id}`, { status: 'CONTACTED' }),
                          'Contact recorded. This does not send an SMS.',
                        )
                      }
                    >
                      Mark contacted
                    </button>
                  )}
                  <button
                    className="btn primary"
                    onClick={() =>
                      void run(
                        () => patch(`hospitality/waitlist/${w.id}`, { status: 'SEATED' }),
                        'Party removed from queue as seated.',
                      )
                    }
                  >
                    Mark seated
                  </button>
                  <button
                    className="text-link"
                    onClick={() =>
                      void run(
                        () => patch(`hospitality/waitlist/${w.id}`, { status: 'CANCELLED' }),
                        'Waitlist entry cancelled.',
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))
          ) : (
            <Empty title="A calm moment at the door" />
          )}
        </div>
      ) : (
        <section className="panel">
          <div className="floor-editor-scroll">
            <div className="floor-editor">
              {Array.from({ length: 36 }, (_, i) => {
                const x = i % 6,
                  y = Math.floor(i / 6),
                  table = tables?.find((t) => Math.round(t.posX) === x && Math.round(t.posY) === y);
                return (
                  <div
                    className={`floor-cell ${table ? 'has-table' : ''}`}
                    key={i}
                    aria-label={`Floor column ${x + 1} row ${y + 1}`}
                    onDragOver={(e) => {
                      if (privileged) e.preventDefault();
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const tableId = e.dataTransfer.getData('text/plain');
                      if (!privileged || !tables?.some((t) => t.id === tableId)) return;
                      if (table) {
                        notify('Choose an empty position.', true);
                        return;
                      }
                      await run(
                        () => patch(`hospitality/tables/${tableId}`, { posX: x, posY: y }),
                        'Floor plan saved.',
                      );
                    }}
                  >
                    {table ? (
                      <button
                        draggable={privileged}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', table.id)}
                        className={`floor-table ${table.checks.length ? 'occupied' : ''}`}
                        onClick={() => {
                          if (privileged) {
                            setEditing(table);
                            setModal('table');
                          }
                        }}
                      >
                        <Grip size={17} />
                        <strong>{table.code}</strong>
                        <small>{table.seats} seats</small>
                        <Badge value={table.checks.length ? 'OCCUPIED' : 'AVAILABLE'} />
                      </button>
                    ) : (
                      <span>
                        {x + 1} · {y + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      {modal === 'booking' && (
        <Modal title="A new reservation" onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post('hospitality/reservations', {
                    restaurantId,
                    tableId: formText(f, 'table') || undefined,
                    guestName: formText(f, 'name'),
                    phone: formText(f, 'phone'),
                    partySize: formNumber(f, 'party'),
                    startsAt: toIso(formText(f, 'start')),
                    durationMinutes: formNumber(f, 'duration'),
                    notes: formText(f, 'notes'),
                  }),
                'Reservation confirmed.',
              );
              if (result) setModal(null);
            }}
          >
            <div className="form-grid">
              <label>
                Guest name
                <input name="name" required minLength={2} maxLength={100} />
              </label>
              <label>
                Phone
                <input name="phone" type="tel" required minLength={7} maxLength={25} />
              </label>
              <label>
                Guests
                <input name="party" type="number" min={1} max={30} defaultValue={2} required />
              </label>
              <label>
                Arrival
                <input name="start" type="datetime-local" required />
              </label>
              <label>
                Duration
                <select name="duration">
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                  <option value={120}>120 minutes</option>
                </select>
              </label>
              <label>
                Table
                <select name="table">
                  <option value="">Best available</option>
                  {tables?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.seats} seats
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Requests
              <textarea name="notes" maxLength={500} />
            </label>
            <button className="btn primary" disabled={busy}>
              Book table
            </button>
          </form>
        </Modal>
      )}
      {modal === 'waitlist' && (
        <Modal title="Welcome a waiting party" onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post(`hospitality/${restaurantId}/waitlist`, {
                    guestName: formText(f, 'name'),
                    phone: formText(f, 'phone'),
                    partySize: formNumber(f, 'party'),
                    quotedMinutes: formNumber(f, 'wait'),
                    notes: formText(f, 'notes'),
                  }),
                'Party added to the waitlist.',
              );
              if (result) setModal(null);
            }}
          >
            <label>
              Guest name
              <input name="name" required minLength={2} />
            </label>
            <label>
              Phone
              <input name="phone" type="tel" required minLength={7} />
            </label>
            <div className="form-grid">
              <label>
                Guests
                <input name="party" type="number" min={1} max={30} defaultValue={2} required />
              </label>
              <label>
                Quoted wait (minutes)
                <input name="wait" type="number" min={1} max={240} defaultValue={15} required />
              </label>
            </div>
            <label>
              Requests
              <textarea name="notes" maxLength={500} />
            </label>
            <button className="btn primary" disabled={busy}>
              Add to waitlist
            </button>
          </form>
        </Modal>
      )}
      {modal === 'table' && (
        <Modal
          title={editing ? `Table ${editing.code}` : 'Add a table'}
          onClose={() => setModal(null)}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                body = {
                  code: formText(f, 'code'),
                  seats: formNumber(f, 'seats'),
                  posX: formNumber(f, 'x'),
                  posY: formNumber(f, 'y'),
                };
              const result = await run(
                () =>
                  editing
                    ? patch(`hospitality/tables/${editing.id}`, body)
                    : post(`hospitality/${restaurantId}/tables`, body),
                'Floor plan saved.',
              );
              if (result) setModal(null);
            }}
          >
            <div className="form-grid">
              <label>
                Table code
                <input name="code" required maxLength={20} defaultValue={editing?.code} />
              </label>
              <label>
                Seats
                <input
                  name="seats"
                  type="number"
                  min={1}
                  max={30}
                  required
                  defaultValue={editing?.seats || 4}
                />
              </label>
              <label>
                Floor column (0–5)
                <input
                  name="x"
                  type="number"
                  min={0}
                  max={5}
                  defaultValue={editing?.posX || 0}
                  required
                />
              </label>
              <label>
                Floor row (0–5)
                <input
                  name="y"
                  type="number"
                  min={0}
                  max={5}
                  defaultValue={editing?.posY || 0}
                  required
                />
              </label>
            </div>
            <button className="btn primary" disabled={busy}>
              Save table
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
