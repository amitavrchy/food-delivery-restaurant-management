'use client';
import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Check,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { ComplimentaryCheck } from '@/components/operational-editors';
import { useApp } from '@/components/provider';
import { FoodCard, ProductModal, linePrice } from '@/components/product';
import { OrderModal } from '@/components/order-table';
import { Badge, Empty, ErrorState, Loading, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { money, post, uuid } from '@/lib/api';
import type { CartLine, MenuItem, Order, Restaurant, Table } from '@/lib/types';
type Split = {
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  equal: number[];
  bySeat: { seat: number; amountMinor: number; paidMinor: number }[];
  byItem: { lineId: string; name: string; qty: number; amountMinor: number; paidMinor: number }[];
  hasUnallocatedPayments: boolean;
};
export default function TablesPage() {
  const { user, restaurantId } = useApp();
  const {
    data: tables,
    error,
    loading,
  } = useResource<Table[]>(user ? `pos/${restaurantId}/tables` : null);
  const { data: menu } = useResource<Restaurant>(user ? `restaurants/${restaurantId}/menu` : null);
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState('All tables'),
    [product, setProduct] = useState<MenuItem | null>(null),
    [draft, setDraft] = useState<CartLine[]>([]),
    [query, setQuery] = useState(''),
    [order, setOrder] = useState<Order | null>(null),
    [payment, setPayment] = useState(false),
    [comp, setComp] = useState(false);
  const { run, busy } = useAction();
  const checkoutKey = useRef<string | null>(null);
  const table = tables?.find((t) => t.id === selected),
    check = table?.checks[0];
  const { data: split } = useResource<Split>(check ? `pos/checks/${check.id}/split` : null);
  async function open(t: Table) {
    if (!t.checks.length) {
      const result = await run(() => post(`pos/tables/${t.id}/open`), 'Table check opened.');
      if (!result) return;
    }
    setSelected(t.id);
    setDraft([]);
    checkoutKey.current = null;
  }
  async function send() {
    if (!check || !draft.length) return;
    checkoutKey.current ||= uuid();
    const result = await run(
      () =>
        post('orders', {
          restaurantId,
          channel: 'DINE_IN',
          tableCheckId: check.id,
          lines: draft.map((l) => ({
            menuItemId: l.item.id,
            qty: l.qty,
            modifierIds: l.modifierIds,
            seat: l.seat,
            course: l.course,
          })),
          idempotencyKey: checkoutKey.current,
        }),
      'Order sent to the kitchen.',
    );
    if (result) {
      setDraft([]);
      checkoutKey.current = null;
    }
  }
  return (
    <>
      <PageHeading
        title={table ? `A little service for ${table.code}.` : 'Make room for a good time.'}
        description={
          table
            ? `${table.seats} seats · Every round, on one check`
            : 'A clear view of your floor, from the first seating to the last bill.'
        }
      >
        {table ? (
          <button
            className="btn secondary"
            onClick={() => {
              setSelected(null);
              setDraft([]);
            }}
          >
            <ArrowLeft size={17} />
            Floor plan
          </button>
        ) : (
          <span className="date-chip">
            <UtensilsCrossed size={17} />
            {tables?.filter((t) => t.checks.length).length || 0} of {tables?.length || 0} tables
            occupied
          </span>
        )}
      </PageHeading>
      {loading && !tables ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : table ? (
        <div className="pos-layout">
          <div>
            <div className="toolbar">
              <h2>Something for the table</h2>
              <div className="search-field">
                <Search size={17} />
                <input
                  placeholder="Find a dish…"
                  aria-label="Search POS menu"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="menu-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
              {menu?.items
                ?.filter((i) => i.isAvailable && i.name.toLowerCase().includes(query.toLowerCase()))
                .map((i) => (
                  <FoodCard item={i} key={i.id} onAdd={() => setProduct(i)} />
                ))}
            </div>
          </div>
          <aside>
            <section className="panel panel-body">
              <div className="summary-row">
                <h2>{table.code} check</h2>
                <span className="badge active">Open</span>
              </div>
              {check?.orders
                .filter((o) => o.status !== 'CANCELLED')
                .map((o) => (
                  <div key={o.id} className="bill-line">
                    <div>
                      <button className="text-link" onClick={() => setOrder(o)}>
                        Order #{o.number}
                      </button>
                      <small>{o.lines.map((l) => `${l.qty}× ${l.nameSnapshot}`).join(', ')}</small>
                      <Badge value={o.status} />
                    </div>
                    <strong>{money(o.grandMinor)}</strong>
                  </div>
                ))}
              {draft.length > 0 && <h3 className="section-gap">This round</h3>}
              {draft.map((l) => (
                <div className="bill-line" key={l.key}>
                  <div>
                    <strong>
                      {l.qty} × {l.item.name}
                    </strong>
                    <small>
                      Seat {l.seat} · {l.course.toLowerCase()}
                    </small>
                  </div>
                  <strong>{money(linePrice(l))}</strong>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${l.item.name}`}
                    onClick={() => {
                      setDraft((d) => d.filter((x) => x.key !== l.key));
                      checkoutKey.current = null;
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              {!check?.orders.length && !draft.length && (
                <Empty title="Let’s start a good meal">
                  Choose a dish to add a round to this table.
                </Empty>
              )}
              {draft.length > 0 && (
                <button
                  className="btn primary wide section-gap"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  <UtensilsCrossed size={17} />
                  Send to kitchen · {money(draft.reduce((s, l) => s + linePrice(l), 0))}
                </button>
              )}
              <div className="bill-totals">
                <div>
                  <span>Check total</span>
                  <span>{money(split?.totalMinor || 0)}</span>
                </div>
                <div>
                  <span>Already paid</span>
                  <span>{money(split?.paidMinor || 0)}</span>
                </div>
                <div className="total">
                  <span>Balance due</span>
                  <strong>{money(split?.dueMinor || 0)}</strong>
                </div>
              </div>
              {check && split && split.dueMinor > 0 && (
                <button
                  className="btn primary wide"
                  disabled={!!draft.length}
                  onClick={() => setPayment(true)}
                >
                  <Receipt size={17} />
                  Split & settle bill
                </button>
              )}
              <button className="btn secondary wide section-gap" onClick={() => window.print()}>
                <Printer size={17} />
                Print check
              </button>
              {check &&
                ['RESTAURANT_OWNER', 'MANAGER'].includes(user?.role || '') &&
                split &&
                split.totalMinor > 0 && (
                  <button className="text-link section-gap" onClick={() => setComp(true)}>
                    Make check complimentary
                  </button>
                )}
              {check && !draft.length && check.orders.every((o) => o.status === 'CANCELLED') && (
                <button
                  className="btn secondary wide section-gap"
                  disabled={busy}
                  onClick={async () => {
                    const result = await run(
                      () => post(`pos/checks/${check.id}/close-empty`),
                      'Table released.',
                    );
                    if (result) setSelected(null);
                  }}
                >
                  Release empty table
                </button>
              )}
              <p className="form-hint section-gap">
                Dine in includes 5% VAT and 5% service charge. All rounds must be served before
                settlement.
              </p>
            </section>
          </aside>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="tabs">
              {['All tables', 'Available', 'Occupied'].map((t) => (
                <button
                  className={t === filter ? 'active' : ''}
                  onClick={() => setFilter(t)}
                  key={t}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              <span className="muted">○ Available</span>
              <span className="green-text">● Occupied</span>
            </div>
          </div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>The main floor</h2>
                <p>A comfortable spot for every guest</p>
              </div>
              <Users size={22} color="#8b9f77" />
            </div>
            <div className="floor-grid">
              {tables
                ?.filter(
                  (t) =>
                    filter === 'All tables' ||
                    (filter === 'Occupied' ? t.checks.length : !t.checks.length),
                )
                .map((t) => (
                  <button
                    className={`dining-table ${t.checks.length ? 'occupied' : ''}`}
                    key={t.id}
                    disabled={busy}
                    onClick={() => void open(t)}
                  >
                    <strong>{t.code}</strong>
                    <small>{t.seats} seats</small>
                    <span className="table-status">
                      {t.checks.length ? 'Occupied · Open check' : 'Available · Open table'}
                    </span>
                  </button>
                ))}
            </div>
          </section>
        </>
      )}
      {product && (
        <ProductModal
          item={product}
          forPos
          onClose={() => setProduct(null)}
          onAdd={(line) => {
            setDraft((d) => [...d, line]);
            checkoutKey.current = null;
          }}
        />
      )}
      {order && (
        <OrderModal
          order={check?.orders.find((o) => o.id === order.id) || order}
          onClose={() => setOrder(null)}
        />
      )}
      {comp && check && (
        <ComplimentaryCheck
          checkId={check.id}
          onClose={() => setComp(false)}
          onDone={() => {
            setComp(false);
            setSelected(null);
          }}
        />
      )}
      {payment && check && split && (
        <SettleBill
          checkId={check.id}
          split={split}
          onClose={() => setPayment(false)}
          onDone={() => {
            setPayment(false);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
function SettleBill({
  checkId,
  split,
  onClose,
  onDone,
}: {
  checkId: string;
  split: Split;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState('Full bill'),
    [amount, setAmount] = useState(split.dueMinor / 100),
    [method, setMethod] = useState('CASH'),
    [seat, setSeat] = useState<number | undefined>(),
    [lineId, setLineId] = useState<string | undefined>();
  const key = useRef<string | null>(null);
  const { run, busy } = useAction();
  return (
    <Modal title="A good meal, all settled." onClose={onClose}>
      <div className="tabs" style={{ marginBottom: 20 }}>
        {['Full bill', 'By seat', 'By item', 'Equal split'].map((m) => (
          <button
            key={m}
            className={mode === m ? 'active' : ''}
            onClick={() => {
              setMode(m);
              key.current = null;
            }}
          >
            {m}
          </button>
        ))}
      </div>
      {mode === 'By seat' && (
        <div style={{ marginBottom: 20 }}>
          {split.bySeat.map((s) => (
            <button
              key={s.seat}
              type="button"
              className="btn secondary"
              style={{ margin: 4 }}
              onClick={() => {
                setSeat(s.seat);
                setAmount(Math.max(0, s.amountMinor - s.paidMinor) / 100);
                key.current = null;
              }}
            >
              Seat {s.seat} · {money(Math.max(0, s.amountMinor - s.paidMinor))}
            </button>
          ))}
        </div>
      )}
      {mode === 'Equal split' && (
        <div className="note-box" style={{ marginBottom: 20 }}>
          Equal shares: {split.equal.map(money).join(' · ')}. Enter the share you’re collecting now.
        </div>
      )}
      {mode === 'By item' &&
        (split.hasUnallocatedPayments ? (
          <div className="note-box" style={{ marginBottom: 20 }}>
            A general or seat payment has already been recorded. Use the remaining balance to
            continue settlement.
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            {split.byItem.map((item) => (
              <button
                type="button"
                key={item.lineId}
                disabled={item.paidMinor >= item.amountMinor}
                className={`btn ${lineId === item.lineId ? 'soft' : 'secondary'}`}
                style={{ margin: 4, whiteSpace: 'normal', textAlign: 'left' }}
                onClick={() => {
                  setLineId(item.lineId);
                  setAmount((item.amountMinor - item.paidMinor) / 100);
                  key.current = null;
                }}
              >
                {item.qty} × {item.name} · {money(Math.max(0, item.amountMinor - item.paidMinor))}
              </button>
            ))}
          </div>
        ))}
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          key.current ||= uuid();
          const result = await run(
            () =>
              post(`pos/checks/${checkId}/pay`, {
                amountMinor: Math.round(amount * 100),
                method,
                seat: mode === 'By seat' ? seat : undefined,
                lineId: mode === 'By item' ? lineId : undefined,
                idempotencyKey: key.current,
              }),
            'Payment recorded.',
          );
          if (result) onDone();
        }}
      >
        <div className="info-pair">
          <span>Balance due</span>
          <strong>{money(split.dueMinor)}</strong>
        </div>
        <label>
          Amount to collect (৳)
          <input
            required
            type="number"
            min={0.01}
            step=".01"
            max={split.dueMinor / 100}
            value={amount}
            onChange={(e) => {
              setAmount(Number(e.target.value));
              key.current = null;
            }}
          />
        </label>
        <label>
          Payment method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash received</option>
            <option value="CARD">Paid on external card terminal</option>
          </select>
        </label>
        <p className="form-hint">
          Record a payment only after collecting it. The check closes automatically when the full
          balance is paid.
        </p>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={
              busy ||
              (mode === 'By item' && (!lineId || split.hasUnallocatedPayments)) ||
              (mode === 'By seat' && !seat)
            }
          >
            <Banknote size={17} />
            Record payment
          </button>
        </div>
      </form>
    </Modal>
  );
}
