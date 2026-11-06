'use client';
import { useState, useRef } from 'react';
import { ArrowLeftRight, PackageCheck, Plus, ShoppingBasket, Truck } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Metric, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { date, money, patch, post, uuid } from '@/lib/api';
import { formText, formNumber, toIso, type Procurement, type Purchase } from '@/lib/advanced';
import type { Inventory } from '@/lib/types';
export default function ProcurementPage() {
  const transferKey = useRef<string | null>(null);
  const { user, restaurantId, restaurants } = useApp();
  const { data, error, loading } = useResource<Procurement>(
    user ? `procurement/${restaurantId}` : null,
  );
  const { data: inventory } = useResource<Inventory[]>(user ? `inventory/${restaurantId}` : null);
  const [tab, setTab] = useState('Purchase orders'),
    [modal, setModal] = useState<'supplier' | 'purchase' | 'transfer' | null>(null),
    [receiving, setReceiving] = useState<Purchase | null>(null),
    [destination, setDestination] = useState('');
  const { data: targetStock } = useResource<Inventory[]>(
    modal === 'transfer' && destination ? `inventory/${destination}` : null,
  );
  const { run, busy } = useAction();
  const [lines, setLines] = useState<
    { inventoryItemId: string; orderedQty: number; unitCostMinor: number }[]
  >([{ inventoryItemId: '', orderedQty: 1, unitCostMinor: 0 }]);
  const branch = restaurants.find((r) => r.id === restaurantId);
  const targets = (
    user?.role === 'PLATFORM_ADMIN'
      ? restaurants
      : user?.memberships
          .filter((m) => ['RESTAURANT_OWNER', 'MANAGER'].includes(m.role))
          .map((m) => m.restaurant) || []
  ).filter(
    (r) => r.id !== restaurantId && r.organizationId && r.organizationId === branch?.organizationId,
  );
  return (
    <>
      <PageHeading
        eyebrow="SUPPLY CHAIN & INVENTORY CONTROL"
        title="Keep every good service well supplied."
        description="Plan purchases, receive precisely, and move stock between your branches with a full trail."
      >
        <button className="btn secondary" onClick={() => setModal('supplier')}>
          <Plus size={17} />
          New supplier
        </button>
        <button
          className="btn secondary"
          disabled={!targets.length}
          onClick={() => {
            transferKey.current = null;
            setModal('transfer');
          }}
        >
          <ArrowLeftRight size={17} />
          Transfer stock
        </button>
        <button
          className="btn primary"
          disabled={!data?.suppliers.length}
          onClick={() => {
            setLines([{ inventoryItemId: '', orderedQty: 1, unitCostMinor: 0 }]);
            setModal('purchase');
          }}
        >
          <ShoppingBasket size={17} />
          Purchase order
        </button>
      </PageHeading>
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <Metric
          label="Supplier partners"
          value={data?.suppliers.length || 0}
          detail="Contacts and lead-time planning"
          icon={<Truck size={19} />}
        />
        <Metric
          label="Awaiting stock"
          value={data?.orders.filter((o) => ['ORDERED', 'PARTIAL'].includes(o.status)).length || 0}
          detail="Ordered or partially received"
          icon={<ShoppingBasket size={19} />}
        />
        <Metric
          label="Completed receipts"
          value={data?.orders.reduce((s, o) => s + o.receipts.length, 0) || 0}
          detail="Idempotent, audited stock additions"
          icon={<PackageCheck size={19} />}
        />
      </div>
      <div className="toolbar">
        <div className="tabs">
          {['Purchase orders', 'Suppliers', 'Transfers'].map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : tab === 'Purchase orders' ? (
        <div className="order-grid">
          {data?.orders.length ? (
            data.orders.map((o) => (
              <article className="panel panel-body" key={o.id}>
                <div className="summary-row">
                  <h3>{o.supplier.name}</h3>
                  <Badge value={o.status} />
                </div>
                <p className="muted">
                  Created {date(o.createdAt)}
                  {o.expectedAt ? ` · Expected ${date(o.expectedAt)}` : ''}
                </p>
                {o.lines.map((l) => (
                  <div className="info-pair" key={l.id}>
                    <div>
                      <strong>{l.ingredient.name}</strong>
                      <small className="cell-meta">
                        {Number(l.receivedQty)} / {Number(l.orderedQty)} {l.ingredient.uom} received
                      </small>
                    </div>
                    <strong>{money(Math.round(Number(l.orderedQty) * l.unitCostMinor))}</strong>
                  </div>
                ))}
                <div className="info-pair">
                  <span>Purchase value</span>
                  <strong>
                    {money(
                      Math.round(
                        o.lines.reduce((s, l) => s + Number(l.orderedQty) * l.unitCostMinor, 0),
                      ),
                    )}
                  </strong>
                </div>
                {o.notes && <p className="form-hint section-gap">{o.notes}</p>}
                {o.receipts.length > 0 && (
                  <details className="section-gap">
                    <summary>Receipt history ({o.receipts.length})</summary>
                    {o.receipts.map((r) => (
                      <div className="info-pair" key={r.id}>
                        <strong>{r.invoiceReference}</strong>
                        <span>{date(r.createdAt)}</span>
                      </div>
                    ))}
                  </details>
                )}
                <div className="form-actions" style={{ flexWrap: 'wrap' }}>
                  {o.status === 'DRAFT' && (
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => patch(`procurement/orders/${o.id}`, { status: 'ORDERED' }),
                          'Purchase order submitted.',
                        )
                      }
                    >
                      Submit order
                    </button>
                  )}
                  {['ORDERED', 'PARTIAL'].includes(o.status) && (
                    <button className="btn primary" onClick={() => setReceiving(o)}>
                      <PackageCheck size={17} />
                      Receive stock
                    </button>
                  )}
                  {['DRAFT', 'ORDERED', 'PARTIAL'].includes(o.status) && (
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => patch(`procurement/orders/${o.id}`, { status: 'CANCELLED' }),
                          'Remaining purchase cancelled. Previously received stock is preserved.',
                        )
                      }
                    >
                      Cancel remaining
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <Empty title="Your next well-planned purchase starts here">
              Add a supplier, then create a purchase order from your ingredients.
            </Empty>
          )}
        </div>
      ) : tab === 'Suppliers' ? (
        <div className="advanced-grid">
          {data?.suppliers.map((s) => (
            <article className="panel feature-card" key={s.id}>
              <span className="feature-icon">
                <Truck size={24} />
              </span>
              <h3>{s.name}</h3>
              <p>{s.phone}</p>
              <p>{s.email || 'No email provided'}</p>
              <div className="info-pair">
                <span>Typical lead time</span>
                <strong>{s.leadDays} days</strong>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data?.transfers.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.source.name}</strong>
                    <small className="cell-meta">
                      {restaurants.find((r) => r.id === t.source.restaurantId)?.name}
                    </small>
                  </td>
                  <td>
                    <strong>{t.target.name}</strong>
                    <small className="cell-meta">
                      {restaurants.find((r) => r.id === t.target.restaurantId)?.name}
                    </small>
                  </td>
                  <td>
                    {Number(t.qty)} {t.source.uom}
                  </td>
                  <td>{t.reason}</td>
                  <td>{date(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.transfers.length && (
            <Empty title="Stock, in the right place">
              Transfers are atomic and require access to both branches in the same organization.
            </Empty>
          )}
        </section>
      )}
      {modal === 'supplier' && (
        <Modal title="A new supply partner" onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post(`procurement/${restaurantId}/suppliers`, {
                    name: formText(f, 'name'),
                    phone: formText(f, 'phone'),
                    email: formText(f, 'email') || undefined,
                    leadDays: formNumber(f, 'lead'),
                  }),
                'Supplier saved.',
              );
              if (result) setModal(null);
            }}
          >
            <label>
              Supplier name
              <input name="name" minLength={2} maxLength={100} required />
            </label>
            <div className="form-grid">
              <label>
                Phone
                <input name="phone" type="tel" minLength={7} maxLength={25} required />
              </label>
              <label>
                Email
                <input name="email" type="email" />
              </label>
              <label>
                Lead time (days)
                <input type="number" name="lead" min={0} max={90} defaultValue={1} required />
              </label>
            </div>
            <button className="btn primary" disabled={busy}>
              Add supplier
            </button>
          </form>
        </Modal>
      )}
      {modal === 'purchase' && (
        <Modal title="Plan a purchase" onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post(`procurement/${restaurantId}/orders`, {
                    supplierId: formText(f, 'supplier'),
                    expectedAt: formText(f, 'expected')
                      ? toIso(formText(f, 'expected'))
                      : undefined,
                    notes: formText(f, 'notes'),
                    lines,
                  }),
                'Purchase draft saved. Submit it when you’re ready.',
              );
              if (result) setModal(null);
            }}
          >
            <label>
              Supplier
              <select name="supplier" required>
                {data?.suppliers
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Expected delivery
              <input name="expected" type="datetime-local" />
            </label>
            <div className="form-stack">
              {lines.map((l, i) => (
                <div className="purchase-line-editor" key={i}>
                  <label>
                    Ingredient
                    <select
                      required
                      value={l.inventoryItemId}
                      onChange={(e) => {
                        const stock = inventory?.find((s) => s.id === e.target.value);
                        setLines((rows) =>
                          rows.map((r, j) =>
                            i === j
                              ? {
                                  ...r,
                                  inventoryItemId: e.target.value,
                                  unitCostMinor: stock?.costMinor || 0,
                                }
                              : r,
                          ),
                        );
                      }}
                    >
                      <option value="">Choose ingredient</option>
                      {inventory?.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name} ({s.uom})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid">
                    <label>
                      Quantity
                      <input
                        required
                        type="number"
                        min={0.001}
                        step=".001"
                        max={100000}
                        value={l.orderedQty}
                        onChange={(e) =>
                          setLines((rows) =>
                            rows.map((r, j) =>
                              i === j ? { ...r, orderedQty: Number(e.target.value) } : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Unit cost (৳)
                      <input
                        required
                        type="number"
                        min={0}
                        step=".01"
                        value={l.unitCostMinor / 100}
                        onChange={(e) =>
                          setLines((rows) =>
                            rows.map((r, j) =>
                              i === j
                                ? { ...r, unitCostMinor: Math.round(Number(e.target.value) * 100) }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="text-link danger-text"
                      onClick={() => setLines((rows) => rows.filter((_, j) => i !== j))}
                    >
                      Remove line
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setLines((rows) => [
                  ...rows,
                  { inventoryItemId: '', orderedQty: 1, unitCostMinor: 0 },
                ])
              }
            >
              <Plus size={17} />
              Add purchase line
            </button>
            <label>
              Purchase notes
              <textarea name="notes" maxLength={500} />
            </label>
            <button className="btn primary" disabled={busy}>
              Save draft
            </button>
          </form>
        </Modal>
      )}
      {modal === 'transfer' && (
        <Modal title="Put stock where it’s needed" onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post('procurement/transfers', {
                    sourceItemId: formText(f, 'source'),
                    targetItemId: formText(f, 'target'),
                    qty: formNumber(f, 'qty'),
                    reason: formText(f, 'reason'),
                    idempotencyKey: (transferKey.current ||= uuid()),
                  }),
                'Stock transferred and both movement trails recorded.',
              );
              if (result) setModal(null);
            }}
          >
            <label>
              Source ingredient
              <select name="source" required>
                {inventory?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.qtyOnHand} {s.uom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destination branch
              <select value={destination} required onChange={(e) => setDestination(e.target.value)}>
                <option value="">Choose branch</option>
                {targets.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destination ingredient
              <select name="target" required>
                <option value="">Choose matching ingredient / unit</option>
                {targetStock?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.uom})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input name="qty" type="number" min={0.001} step=".001" max={100000} required />
            </label>
            <label>
              Transfer reason
              <textarea name="reason" minLength={3} maxLength={300} required />
            </label>
            <p className="form-hint">
              Both branches must belong to the same group. Unit compatibility and source balance are
              checked transactionally.
            </p>
            <button className="btn primary" disabled={busy}>
              Transfer stock
            </button>
          </form>
        </Modal>
      )}
      {receiving && (
        <Receive
          order={data?.orders.find((o) => o.id === receiving.id) || receiving}
          onClose={() => setReceiving(null)}
        />
      )}
    </>
  );
}
function Receive({ order, onClose }: { order: Purchase; onClose: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({}),
    [requestKey] = useState(uuid);
  const { run, busy } = useAction();
  return (
    <Modal title={`Receive · ${order.supplier.name}`} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const lines = order.lines
            .filter((l) => (quantities[l.id] || 0) > 0)
            .map((l) => ({ lineId: l.id, qty: quantities[l.id] }));
          const result = await run(
            () =>
              post(`procurement/orders/${order.id}/receive`, {
                invoiceReference: formText(f, 'invoice'),
                idempotencyKey: requestKey,
                lines,
              }),
            'Receipt recorded. Stock and weighted costs updated.',
          );
          if (result) onClose();
        }}
      >
        <label>
          Supplier invoice / delivery reference
          <input name="invoice" minLength={2} maxLength={100} required />
        </label>
        {order.lines
          .filter((l) => Number(l.receivedQty) < Number(l.orderedQty))
          .map((l) => (
            <label key={l.id}>
              {l.ingredient.name} ({l.ingredient.uom})
              <span className="form-hint">
                {Number(l.orderedQty) - Number(l.receivedQty)} outstanding
              </span>
              <input
                type="number"
                min={0}
                max={Number(l.orderedQty) - Number(l.receivedQty)}
                step=".001"
                value={quantities[l.id] || 0}
                onChange={(e) => setQuantities((q) => ({ ...q, [l.id]: Number(e.target.value) }))}
              />
            </label>
          ))}
        <p className="form-hint">
          Receive only what arrived. Repeating this submission uses the same receipt key, so stock
          cannot be added twice.
        </p>
        <button
          className="btn primary"
          disabled={busy || !Object.values(quantities).some((q) => q > 0)}
        >
          Confirm receipt
        </button>
      </form>
    </Modal>
  );
}
