'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarDays,
  Gift,
  Heart,
  House,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import { Access, CustomerShell } from '@/components/shell';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Metric, Modal, PageHeading } from '@/components/ui';
import { useResource, useAction } from '@/lib/hooks';
import { api, date, label, money, patch, post, time } from '@/lib/api';
import type { Address, Loyalty, Reservation, SupportCase, PersonalWork } from '@/lib/advanced';
import { formText, formNumber, toIso } from '@/lib/advanced';
import type { Order, Restaurant } from '@/lib/types';
const tabs = [
  'Overview',
  'Addresses',
  'Favorites',
  'Rewards',
  'Reservations',
  'Support',
  'My work',
];
export default function Account() {
  const { user, restaurants, logout } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState('Overview'),
    [modal, setModal] = useState<'address' | 'reservation' | 'support' | 'leave' | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const { run, busy } = useAction();
  const { data: addresses, error: addressError } = useResource<Address[]>(
    user ? 'account/addresses' : null,
  );
  const { data: loyalty } = useResource<Loyalty>(user ? 'account/loyalty' : null);
  const { data: favorites } = useResource<{ id: string; restaurant: Restaurant }[]>(
    user ? 'account/favorites' : null,
  );
  const { data: reservations } = useResource<Reservation[]>(
    user ? 'hospitality/reservations' : null,
  );
  const { data: support } = useResource<SupportCase[]>(user ? 'support' : null);
  const { data: orders } = useResource<Order[]>(user ? 'orders' : null);
  const { data: work } = useResource<PersonalWork>(
    user && user.memberships.length ? 'team/my-work' : null,
  );
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested) {
      const match = tabs.find((t) => t.toLowerCase() === requested);
      if (match) setTab(match);
    }
  }, []);
  const selectedCase = support?.find((c) => c.id === caseId);
  return (
    <CustomerShell>
      <Access>
        <PageHeading
          eyebrow="YOUR TABLELANE"
          title={`Made for you, ${user?.name.split(' ')[0] || 'friend'}.`}
          description="Your favorites, rewards, reservations and support. A more personal food experience."
        >
          <button
            className="btn secondary"
            onClick={() => void logout().then(() => router.push('/login'))}
          >
            <LogOut size={17} />
            Sign out
          </button>
        </PageHeading>
        <div className="account-hero">
          <div>
            <span className="eyebrow">GOOD FOOD HAS ITS REWARDS</span>
            <h2>{loyalty?.points || 0} points. Your next good thing.</h2>
            <p>
              Earn with completed meals, redeem at checkout, and keep coming back to the kitchens
              you love.
            </p>
          </div>
          <div className="account-hero-icon">
            <Gift size={55} />
          </div>
        </div>
        <div className="toolbar">
          <div className="tabs">
            {tabs
              .filter((t) => t !== 'My work' || !!user?.memberships.length)
              .map((t) => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
          </div>
        </div>
        {tab === 'Overview' && (
          <>
            <div className="metrics">
              <Metric
                label="Reward points"
                value={loyalty?.points || 0}
                detail="1 point gives ৳1 off food"
                icon={<Gift size={19} />}
              />
              <Metric
                label="Saved kitchens"
                value={favorites?.length || 0}
                detail="Your neighborhood favorites"
                icon={<Heart size={19} />}
              />
              <Metric
                label="Upcoming tables"
                value={
                  reservations?.filter(
                    (r) => r.status === 'BOOKED' && new Date(r.endsAt) > new Date(),
                  ).length || 0
                }
                detail="Your next gathering"
                icon={<CalendarDays size={19} />}
              />
              <Metric
                label="Orders enjoyed"
                value={
                  orders?.filter((o) => ['DELIVERED', 'COMPLETED', 'CLOSED'].includes(o.status))
                    .length || 0
                }
                detail="Meals with a little more care"
                icon={<Star size={19} />}
              />
            </div>
            <div className="advanced-grid">
              {[
                {
                  name: 'Your next meal, on your time',
                  text: 'Schedule delivery or pickup up to seven days ahead from checkout.',
                  href: '/',
                  icon: CalendarDays,
                },
                {
                  name: 'A table worth gathering around',
                  text: 'Book a table with live capacity and time-slot conflict checks.',
                  action: () => setModal('reservation'),
                  icon: House,
                },
                {
                  name: 'A real person, a real resolution',
                  text: 'Open an order-specific support case and keep every reply together.',
                  action: () => setModal('support'),
                  icon: MessageSquare,
                },
              ].map((card) => (
                <article className="panel feature-card" key={card.name}>
                  <span className="feature-icon">
                    <card.icon size={25} />
                  </span>
                  <h3>{card.name}</h3>
                  <p>{card.text}</p>
                  {card.href ? (
                    <Link className="text-link" href={card.href}>
                      Explore kitchens
                      <ArrowRight size={17} />
                    </Link>
                  ) : (
                    <button className="text-link" onClick={card.action}>
                      Get started
                      <ArrowRight size={17} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
        {tab === 'Addresses' && (
          <>
            <div className="summary-row">
              <h2>Places you call yours</h2>
              <button className="btn primary" onClick={() => setModal('address')}>
                <Plus size={17} />
                Save address
              </button>
            </div>
            {addressError ? (
              <ErrorState message={addressError} />
            ) : addresses?.length ? (
              <div className="advanced-grid">
                {addresses.map((a) => (
                  <article className="panel feature-card" key={a.id}>
                    <div className="summary-row">
                      <span className="feature-icon">
                        <MapPin size={23} />
                      </span>
                      {a.isDefault && <Badge value="DEFAULT" />}
                    </div>
                    <h3>{a.label}</h3>
                    <p>{a.address}</p>
                    <p>{a.phone}</p>
                    <div className="feature-actions">
                      {!a.isDefault && (
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => patch(`account/addresses/${a.id}/default`, {}),
                              'Default address updated.',
                            )
                          }
                        >
                          Make default
                        </button>
                      )}
                      <button
                        className="icon-btn danger-text"
                        aria-label={`Delete ${a.label} address`}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => api(`account/addresses/${a.id}`, { method: 'DELETE' }),
                            'Address removed.',
                          )
                        }
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="A little closer to home">
                Save a delivery address for quicker checkout.
              </Empty>
            )}
          </>
        )}
        {tab === 'Favorites' && (
          <div className="restaurant-grid">
            {favorites?.length ? (
              favorites.map((f) => (
                <article className="restaurant-card" key={f.id}>
                  <Link
                    href={`/restaurants/${f.restaurant.id}`}
                    className="restaurant-cover"
                    style={{ display: 'block' }}
                  >
                    <img src={f.restaurant.image} alt={f.restaurant.name} />
                  </Link>
                  <div className="restaurant-card-content">
                    <div className="restaurant-title">
                      <h3>{f.restaurant.name}</h3>
                      <button
                        className="icon-btn danger-text"
                        aria-label={`Unsave ${f.restaurant.name}`}
                        onClick={() =>
                          void run(
                            () => api(`account/favorites/${f.restaurant.id}`, { method: 'DELETE' }),
                            'Kitchen removed from favorites.',
                          )
                        }
                      >
                        <Heart size={21} fill="currentColor" />
                      </button>
                    </div>
                    <p>{f.restaurant.description}</p>
                    <Link className="text-link" href={`/restaurants/${f.restaurant.id}`}>
                      Something delicious?
                      <ArrowRight size={17} />
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <Empty title="Keep your favorites close">
                Tap the heart on a restaurant’s menu to save it here.
              </Empty>
            )}
          </div>
        )}
        {tab === 'Rewards' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Your rewards, accounted for.</h2>
                <p>{loyalty?.earnRule}</p>
              </div>
              <strong className="reward-balance">{loyalty?.points || 0} pts</strong>
            </div>
            <div className="panel-body">
              <div className="note-box">
                Use reward points in checkout. Cancelled orders restore their redeemed points
                automatically; fully refunded card payments reverse earned rewards.
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Date</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {loyalty?.entries.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.reason}</strong>
                        <small className="cell-meta">{label(e.kind)}</small>
                      </td>
                      <td>{date(e.createdAt)}</td>
                      <td>
                        <strong className={e.points > 0 ? 'green-text' : 'muted'}>
                          {e.points > 0 ? '+' : ''}
                          {e.points}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loyalty?.entries.length && <Empty title="Your first good meal is the start" />}
          </section>
        )}
        {tab === 'Reservations' && (
          <>
            <div className="summary-row">
              <h2>A seat for every occasion</h2>
              <button className="btn primary" onClick={() => setModal('reservation')}>
                <Plus size={17} />
                Reserve a table
              </button>
            </div>
            <div className="order-grid">
              {reservations?.length ? (
                reservations.map((r) => (
                  <article className="panel panel-body" key={r.id}>
                    <div className="summary-row">
                      <h3>{r.restaurant.name}</h3>
                      <Badge value={r.status} />
                    </div>
                    <p className="muted">
                      {date(r.startsAt)} · {time(r.startsAt)} – {time(r.endsAt)}
                    </p>
                    <div className="info-pair">
                      <span>Party</span>
                      <strong>
                        {r.partySize} guests · {r.table?.code || 'Assigned on arrival'}
                      </strong>
                    </div>
                    <div className="info-pair">
                      <span>Guest</span>
                      <strong>{r.guestName}</strong>
                    </div>
                    {r.notes && <p className="note-box section-gap">{r.notes}</p>}
                    {r.status === 'BOOKED' && (
                      <button
                        className="btn danger section-gap"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              patch(`hospitality/reservations/${r.id}`, { status: 'CANCELLED' }),
                            'Reservation cancelled.',
                          )
                        }
                      >
                        Cancel reservation
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <Empty title="Room for your next gathering">
                  Reserve a table at your favorite kitchen.
                </Empty>
              )}
            </div>
          </>
        )}
        {tab === 'Support' && (
          <>
            <div className="summary-row">
              <h2>A clearer way to get help</h2>
              <button className="btn primary" onClick={() => setModal('support')}>
                <Plus size={17} />
                Open a case
              </button>
            </div>
            <div className="order-grid">
              {support?.length ? (
                support.map((c) => (
                  <button
                    className="panel panel-body support-case"
                    key={c.id}
                    onClick={() => setCaseId(c.id)}
                  >
                    <div className="summary-row">
                      <h3>{c.subject}</h3>
                      <Badge value={c.status} />
                    </div>
                    <p className="muted">
                      Order #{c.order.number} · {label(c.category)}
                    </p>
                    <div className="info-pair">
                      <span>{c.messages.length} messages</span>
                      <span>{date(c.createdAt)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <Empty title="Everything feeling good?">
                  If an order needs attention, your case and every reply will live here.
                </Empty>
              )}
            </div>
          </>
        )}
        {tab === 'My work' && work && (
          <>
            <div className="summary-row">
              <h2>Your service schedule</h2>
              <div className="mobile-stack">
                <button className="btn secondary" onClick={() => setModal('leave')}>
                  Request leave
                </button>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        post(
                          `staff/${work.attendance.find((s) => !s.endedAt)?.restaurantId || user?.memberships[0]?.restaurantId}/${work.attendance.some((s) => !s.endedAt) ? 'clock-out' : 'clock-in'}`,
                        ),
                      'Attendance updated.',
                    )
                  }
                >
                  {work.attendance.some((s) => !s.endedAt) ? 'Clock out' : 'Clock in'}
                </button>
              </div>
            </div>
            <div className="order-grid">
              {work.planned.map((s) => (
                <article className="panel panel-body" key={s.id}>
                  <h3>{s.restaurant.name}</h3>
                  <p className="muted">
                    {date(s.startsAt)} · {time(s.startsAt)}–{time(s.endsAt)}
                  </p>
                  <Badge value={s.role} />
                </article>
              ))}
            </div>
            <section className="panel section-gap">
              <div className="panel-head">
                <h2>Your leave requests</h2>
              </div>
              <div className="panel-body">
                {work.leave.length ? (
                  work.leave.map((l) => (
                    <div className="info-pair" key={l.id}>
                      <div>
                        <strong>{l.reason}</strong>
                        <small className="cell-meta">
                          {date(l.startsAt)}–{date(l.endsAt)}
                        </small>
                      </div>
                      <Badge value={l.status} />
                    </div>
                  ))
                ) : (
                  <p className="muted">No leave requests yet.</p>
                )}
              </div>
            </section>
          </>
        )}
        {modal === 'address' && (
          <Modal title="Save a place you love" onClose={() => setModal(null)}>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const result = await run(
                  () =>
                    post('account/addresses', {
                      label: formText(f, 'label'),
                      address: formText(f, 'address'),
                      phone: formText(f, 'phone'),
                      isDefault: f.get('primary') === 'on',
                    }),
                  'Address saved.',
                );
                if (result) setModal(null);
              }}
            >
              <label>
                Label
                <input
                  name="label"
                  required
                  maxLength={40}
                  placeholder="Home, work, a favorite spot…"
                />
              </label>
              <label>
                Complete address
                <textarea name="address" minLength={8} maxLength={500} required />
              </label>
              <label>
                Contact number
                <input name="phone" required minLength={7} maxLength={25} type="tel" />
              </label>
              <label className="modifier-option">
                <input name="primary" type="checkbox" />
                Make this my default address
              </label>
              <div className="form-actions">
                <button className="btn primary" disabled={busy}>
                  Save address
                </button>
              </div>
            </form>
          </Modal>
        )}
        {modal === 'reservation' && (
          <Modal title="Make room for a good time" onClose={() => setModal(null)}>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const result = await run(
                  () =>
                    post('hospitality/reservations', {
                      restaurantId: formText(f, 'restaurant'),
                      guestName: formText(f, 'name'),
                      phone: formText(f, 'phone'),
                      partySize: formNumber(f, 'party'),
                      startsAt: toIso(formText(f, 'start')),
                      durationMinutes: formNumber(f, 'duration'),
                      notes: formText(f, 'notes'),
                    }),
                  'Your table is reserved.',
                );
                if (result) {
                  setModal(null);
                  setTab('Reservations');
                }
              }}
            >
              <label>
                Restaurant
                <select name="restaurant" required>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Guest name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={user?.name}
                  />
                </label>
                <label>
                  Contact number
                  <input name="phone" type="tel" minLength={7} maxLength={25} required />
                </label>
                <label>
                  Guests
                  <input name="party" type="number" min={1} max={30} defaultValue={2} required />
                </label>
                <label>
                  Arrival time
                  <input name="start" type="datetime-local" required />
                </label>
                <label>
                  Table time
                  <select name="duration">
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                    <option value={120}>120 minutes</option>
                  </select>
                </label>
              </div>
              <label>
                Occasion or requests
                <textarea name="notes" maxLength={500} />
              </label>
              <p className="form-hint">
                The smallest suitable available table is assigned automatically. Overlapping
                bookings are blocked.
              </p>
              <div className="form-actions">
                <button className="btn primary" disabled={busy}>
                  Confirm reservation
                </button>
              </div>
            </form>
          </Modal>
        )}
        {modal === 'support' && (
          <Modal title="Let’s make it right" onClose={() => setModal(null)}>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const result = await run(
                  () =>
                    post('support', {
                      orderId: formText(f, 'order'),
                      category: formText(f, 'category'),
                      subject: formText(f, 'subject'),
                      message: formText(f, 'message'),
                    }),
                  'Your case is open.',
                );
                if (result) {
                  setModal(null);
                  setTab('Support');
                }
              }}
            >
              <label>
                Order
                <select name="order" required>
                  <option value="">Choose your order</option>
                  {orders?.map((o) => (
                    <option key={o.id} value={o.id}>
                      #{o.number} · {o.restaurant.name} · {money(o.grandMinor)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What needs attention?
                <select name="category">
                  {['LATE_DELIVERY', 'MISSING_ITEM', 'QUALITY', 'PAYMENT', 'OTHER'].map((c) => (
                    <option value={c} key={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subject
                <input name="subject" minLength={5} maxLength={150} required />
              </label>
              <label>
                Tell us what happened
                <textarea name="message" minLength={10} maxLength={3000} required />
              </label>
              <div className="form-actions">
                <button className="btn primary" disabled={busy}>
                  Open support case
                </button>
              </div>
            </form>
          </Modal>
        )}
        {modal === 'leave' && (
          <Modal title="Request some time away" onClose={() => setModal(null)}>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const result = await run(
                  () =>
                    post(`enterprise/${formText(f, 'branch')}/leave`, {
                      startsAt: toIso(formText(f, 'start')),
                      endsAt: toIso(formText(f, 'end')),
                      reason: formText(f, 'reason'),
                    }),
                  'Leave request submitted.',
                );
                if (result) setModal(null);
              }}
            >
              <label>
                Branch
                <select name="branch">
                  {user?.memberships.map((m) => (
                    <option key={m.restaurantId} value={m.restaurantId}>
                      {m.restaurant.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  From
                  <input type="datetime-local" name="start" required />
                </label>
                <label>
                  Until
                  <input type="datetime-local" name="end" required />
                </label>
              </div>
              <label>
                Reason
                <textarea name="reason" required minLength={5} maxLength={1000} />
              </label>
              <div className="form-actions">
                <button className="btn primary" disabled={busy}>
                  Submit request
                </button>
              </div>
            </form>
          </Modal>
        )}
        {selectedCase && (
          <Modal title={selectedCase.subject} onClose={() => setCaseId(null)}>
            <div className="summary-row">
              <Badge value={selectedCase.status} />
              <span className="muted">Order #{selectedCase.order.number}</span>
            </div>
            <div className="conversation">
              {selectedCase.messages.map((m) => (
                <article
                  className={`message-bubble ${m.author.role === 'CUSTOMER' ? 'customer' : 'team'}`}
                  key={m.id}
                >
                  <strong>{m.author.name}</strong>
                  <p>{m.body}</p>
                  <small>
                    {date(m.createdAt)} · {time(m.createdAt)}
                  </small>
                </article>
              ))}
            </div>
            {selectedCase.status !== 'RESOLVED' && (
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const result = await run(
                    () =>
                      post(`support/${selectedCase.id}/messages`, {
                        message: formText(new FormData(form), 'message'),
                      }),
                    'Reply sent.',
                  );
                  if (result) form.reset();
                }}
              >
                <label>
                  Your reply
                  <textarea name="message" minLength={1} maxLength={3000} required />
                </label>
                <button className="btn primary" disabled={busy}>
                  Send reply
                </button>
              </form>
            )}
            {selectedCase.refundMinor > 0 && (
              <div className="note-box section-gap">
                External refund recorded: {money(selectedCase.refundMinor)} ·{' '}
                {selectedCase.refundReference}
              </div>
            )}
          </Modal>
        )}
      </Access>
    </CustomerShell>
  );
}
