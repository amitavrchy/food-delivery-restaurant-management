'use client';
import { useEffect, useState } from 'react';
import { Save, Store } from 'lucide-react';
import { useApp } from '@/components/provider';
import { ErrorState, Loading, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { patch } from '@/lib/api';
import type { Restaurant } from '@/lib/types';
export default function SettingsPage() {
  const { user, restaurantId } = useApp();
  const {
    data: r,
    error,
    loading,
  } = useResource<Restaurant>(user ? `restaurants/${restaurantId}/menu` : null);
  const { run, busy } = useAction();
  const [name, setName] = useState(''),
    [fee, setFee] = useState(49);
  useEffect(() => {
    if (r) {
      setName(r.name);
      setFee(r.deliveryFeeMinor / 100);
    }
  }, [r?.id]);
  return (
    <>
      <PageHeading
        title="Your restaurant, your way."
        description="A few thoughtful settings for a smoother daily service."
      />
      {loading && !r ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        r && (
          <div style={{ maxWidth: 850 }}>
            <form
              className="panel panel-body"
              onSubmit={async (e) => {
                e.preventDefault();
                await run(
                  () =>
                    patch(`restaurants/${r.id}`, { name, deliveryFeeMinor: Math.round(fee * 100) }),
                  'Restaurant details saved.',
                );
              }}
            >
              <h2 style={{ marginBottom: 24 }}>The essentials</h2>
              <div className="form-grid">
                <label>
                  Restaurant name
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Delivery fee (৳)
                  <input
                    type="number"
                    step=".01"
                    min={0}
                    max={1000000}
                    required
                    value={fee}
                    onChange={(e) => setFee(Number(e.target.value))}
                  />
                </label>
                <label className="form-full">
                  Restaurant address
                  <input value={r.address} readOnly />
                </label>
              </div>
              <div className="form-actions">
                <button className="btn primary" disabled={busy}>
                  <Save size={17} />
                  Save details
                </button>
              </div>
            </form>
            <section className="panel panel-body section-gap">
              <h2>Find your service rhythm</h2>
              <div className="settings-row">
                <div>
                  <strong>Accept delivery orders</strong>
                  <p>Take a breather when it gets busy. Dine in and takeaway keep running.</p>
                </div>
                <button
                  role="switch"
                  aria-label="Accept delivery orders"
                  aria-checked={r.isOnline}
                  disabled={busy}
                  className={`toggle ${r.isOnline ? 'on' : ''}`}
                  onClick={() =>
                    void run(
                      () => patch(`restaurants/${r.id}`, { isOnline: !r.isOnline }),
                      r.isOnline
                        ? 'Delivery paused. Dine in is still open.'
                        : 'Delivery orders are back on.',
                    )
                  }
                />
              </div>
              <div className="settings-row">
                <div>
                  <strong>Automatically accept orders</strong>
                  <p>Send new orders straight into your kitchen queue.</p>
                </div>
                <button
                  role="switch"
                  aria-label="Automatically accept orders"
                  aria-checked={r.autoAccept}
                  disabled={busy}
                  className={`toggle ${r.autoAccept ? 'on' : ''}`}
                  onClick={() =>
                    void run(
                      () => patch(`restaurants/${r.id}`, { autoAccept: !r.autoAccept }),
                      'Order acceptance setting updated.',
                    )
                  }
                />
              </div>
              <div className="info-pair section-gap">
                <span>Restaurant timezone</span>
                <strong>{r.timezone || 'Asia/Dhaka'}</strong>
              </div>
              <div className="info-pair">
                <span>Platform commission</span>
                <strong>{r.commissionBps / 100}%</strong>
              </div>
              <div className="info-pair">
                <span>Payment collection</span>
                <strong>Cash on delivery / at counter</strong>
              </div>
            </section>
          </div>
        )
      )}
    </>
  );
}
