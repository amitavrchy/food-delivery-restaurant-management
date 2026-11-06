'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Bike,
  MoreHorizontal,
  Printer,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react';
import { Badge, Empty, Modal } from './ui';
import { date, label, money, nextStatus, patch, terminal, time } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { OrderExtras } from './order-extras';
import type { Order } from '@/lib/types';
export function OrderTable({ orders }: { orders: Order[] }) {
  const [selected, setSelected] = useState<Order | null>(null);
  return (
    <>
      {orders.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Items</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Amount</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const Icon =
                  o.channel === 'DELIVERY'
                    ? Bike
                    : o.channel === 'DINE_IN'
                      ? UtensilsCrossed
                      : ShoppingBag;
                return (
                  <tr key={o.id}>
                    <td>
                      <button className="order-id" onClick={() => setSelected(o)}>
                        #{String(o.number).padStart(4, '0')}
                      </button>
                      <span className="cell-meta">
                        {date(o.placedAt)} · {time(o.placedAt)}
                      </span>
                    </td>
                    <td>
                      <strong>{o.lines[0]?.nameSnapshot || 'Order'}</strong>
                      <span className="cell-meta">
                        {o.lines.reduce((s, l) => s + l.qty, 0)} items
                        {o.lines.length > 1 ? ` · +${o.lines.length - 1} more` : ''}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{ display: 'flex', gap: 7, alignItems: 'center', color: '#849078' }}
                      >
                        <Icon size={16} />
                        {label(o.channel)}
                      </span>
                    </td>
                    <td>
                      <Badge value={o.status} />
                    </td>
                    <td>
                      <strong>{money(o.grandMinor)}</strong>
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        aria-label={`View order ${o.number}`}
                        onClick={() => setSelected(o)}
                      >
                        <ArrowRight size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No orders in this view">
          Your next great service starts with the first order.
        </Empty>
      )}
      {selected && (
        <OrderModal
          order={orders.find((o) => o.id === selected.id) || selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
export function OrderModal({ order: o, onClose }: { order: Order; onClose: () => void }) {
  const { run, busy } = useAction();
  const [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(''),
    [pin, setPin] = useState('');
  const next = nextStatus(o);
  return (
    <Modal title={`Order #${String(o.number).padStart(4, '0')}`} onClose={onClose}>
      <div className="summary-row">
        <Badge value={o.status} />
        <span className="muted">
          {label(o.channel)} · {time(o.placedAt)}
        </span>
      </div>
      {o.lines.map((l) => (
        <div className="bill-line" key={l.id}>
          <div>
            <strong>
              {l.qty} × {l.nameSnapshot}
            </strong>
            <small>
              {l.modifiers.map((m) => m.name).join(', ')}
              {o.channel === 'DINE_IN' ? ` · Seat ${l.seat} · ${label(l.course)}` : ''}
            </small>
          </div>
          <strong>{money(l.qty * l.unitPriceMinor)}</strong>
        </div>
      ))}
      <div className="bill-totals">
        <div>
          <span>Food subtotal</span>
          <span>{money(o.goodsMinor)}</span>
        </div>
        <div>
          <span>VAT & service</span>
          <span>{money(o.taxMinor + o.serviceMinor)}</span>
        </div>
        <div>
          <span>Delivery & tip</span>
          <span>{money(o.deliveryFeeMinor + o.tipMinor)}</span>
        </div>
        {o.discountMinor > 0 && (
          <div>
            <span>Discount</span>
            <span>−{money(o.discountMinor)}</span>
          </div>
        )}
        <div className="total">
          <span>Total</span>
          <strong>{money(o.grandMinor)}</strong>
        </div>
      </div>
      {o.deliveryAddress && <div className="note-box">{o.deliveryAddress}</div>}
      {o.notes && <div className="note-box section-gap">Kitchen notes: {o.notes}</div>}
      <OrderExtras order={o} management />
      {cancel ? (
        <form
          className="form-stack section-gap"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await run(
              () =>
                patch(`orders/${o.id}/status`, {
                  status: 'CANCELLED',
                  reason,
                  managerPin: pin || undefined,
                }),
              'Order cancelled with a recorded reason.',
            );
            if (result) onClose();
          }}
        >
          <label>
            Cancellation reason
            <textarea
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {o.channel === 'DINE_IN' && o.status !== 'PLACED' && (
            <label>
              Manager PIN
              <input
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                maxLength={20}
              />
            </label>
          )}
          {['READY', 'ASSIGNING_RIDER'].includes(o.status) && (
            <p className="form-hint">Late cancellation incurs a ৳25 restaurant penalty.</p>
          )}
          <div className="form-actions">
            <button className="btn secondary" type="button" onClick={() => setCancel(false)}>
              Keep order
            </button>
            <button className="btn danger" disabled={busy}>
              Confirm cancellation
            </button>
          </div>
        </form>
      ) : (
        <div className="form-actions" style={{ flexWrap: 'wrap' }}>
          {!terminal.includes(o.status) &&
            !['PICKED_UP', 'ARRIVING', 'SERVED'].includes(o.status) && (
              <button className="btn danger" onClick={() => setCancel(true)}>
                Cancel
              </button>
            )}
          <button className="btn secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Print
          </button>
          {next && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () => patch(`orders/${o.id}/status`, { status: next }),
                  `Order ${label(next).toLowerCase()}.`,
                )
              }
            >
              {next === 'ACCEPTED' ? 'Accept order' : label(next)}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      <details className="section-gap">
        <summary>Order history</summary>
        <div className="timeline section-gap">
          {o.history.map((h) => (
            <div className="timeline-item" key={h.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{label(h.toStatus)}</strong>
                <small style={{ display: 'block' }}>
                  {date(h.at)} · {time(h.at)}
                </small>
                {h.reason && <p>{h.reason}</p>}
              </div>
            </div>
          ))}
        </div>
      </details>
    </Modal>
  );
}
