'use client';
import { useRef } from 'react';
import Link from 'next/link';
import { useApp } from './provider';
import { useAction } from '@/lib/hooks';
import { money, post, uuid } from '@/lib/api';
import type { Order } from '@/lib/types';
export function OrderExtras({
  order: o,
  management = false,
}: {
  order: Order;
  management?: boolean;
}) {
  const { user } = useApp(),
    { run, busy } = useAction(),
    refundKey = useRef<string | null>(null);
  const manager =
    management &&
    (user?.role === 'PLATFORM_ADMIN' ||
      user?.memberships.some(
        (m) =>
          m.restaurantId === o.restaurantId && ['MANAGER', 'RESTAURANT_OWNER'].includes(m.role),
      ));
  return (
    <div className="section-gap form-stack">
      {o.scheduledFor && (
        <div className="note-box">
          Scheduled for{' '}
          {new Date(o.scheduledFor).toLocaleString('en-GB', {
            timeZone: o.restaurant.timezone || 'Asia/Dhaka',
          })}
        </div>
      )}
      {!!o.loyaltyRedeemed && <p className="form-hint">Rewards used: {o.loyaltyRedeemed} points</p>}
      {o.payments?.map((p) => (
        <div key={p.id} className="note-box">
          <div className="summary-row">
            <strong>
              {p.provider === 'STRIPE' ? 'Card' : p.provider} · {p.status}
            </strong>
            <span>{money(p.amountMinor)}</span>
          </div>
          {!management &&
            p.provider === 'STRIPE' &&
            p.status === 'PENDING' &&
            o.status === 'PLACED' && (
              <button
                className="btn primary section-gap"
                disabled={busy}
                onClick={async () => {
                  const session = await run(() =>
                    post<{ url: string }>('payments/stripe/session', { orderId: o.id }),
                  );
                  if (session) window.location.assign(session.url);
                }}
              >
                Continue secure payment
              </button>
            )}
          {p.refunds?.map((r) => (
            <p className="form-hint" key={r.id}>
              Refund {money(r.amountMinor)} · {r.status}
            </p>
          ))}
          {manager && p.provider === 'STRIPE' && p.status === 'CAPTURED' && (
            <details className="section-gap">
              <summary>Refund card payment</summary>
              <form
                className="form-stack section-gap"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  refundKey.current ||= uuid();
                  await run(
                    () =>
                      post('payments/stripe/refund', {
                        paymentId: p.id,
                        amountMinor: Math.round(Number(f.get('amount')) * 100),
                        reason: f.get('reason'),
                        managerPin: f.get('pin'),
                        idempotencyKey: refundKey.current,
                      }),
                    'Refund request processed.',
                  );
                }}
              >
                <label>
                  Refund amount (BDT)
                  <input
                    name="amount"
                    type="number"
                    min=".01"
                    step=".01"
                    max={p.amountMinor / 100}
                    required
                    onChange={() => {
                      refundKey.current = null;
                    }}
                  />
                </label>
                <label>
                  Reason
                  <input name="reason" required minLength={5} maxLength={300} />
                </label>
                <label>
                  Manager PIN
                  <input name="pin" type="password" required autoComplete="off" />
                </label>
                <button disabled={busy} className="btn danger">
                  Submit refund
                </button>
              </form>
            </details>
          )}
        </div>
      ))}
      {!!o.proofs?.length && (
        <div>
          <strong>Delivery evidence</strong>
          <div className="inline-fields section-gap">
            {o.proofs.map((p) => (
              <a
                className="btn secondary"
                key={p.id}
                href={`/api/delivery-proofs/${p.id}`}
                target="_blank"
                rel="noreferrer"
              >
                View photo
              </a>
            ))}
          </div>
        </div>
      )}
      {!management && (
        <div className="inline-fields">
          <Link href="/account?tab=support" className="btn secondary">
            Get order support
          </Link>
          <Link href={`/restaurants/${o.restaurantId}`} className="btn soft">
            Order from this kitchen again
          </Link>
        </div>
      )}
    </div>
  );
}
