'use client';
import { useEffect, useState } from 'react';
import { Save, Store } from 'lucide-react';
import { useApp } from '@/components/provider';
import { ErrorState, Loading, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { patch } from '@/lib/api';
import type { Restaurant } from '@/lib/types';
import { OpeningHours } from '@/components/opening-hours';
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
            <form
              key={r.id}
              className="panel panel-body section-gap"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await run(
                  () =>
                    patch(`restaurants/${r.id}`, {
                      taxBps: Math.round(Number(f.get('tax')) * 100),
                      serviceBps: Math.round(Number(f.get('service')) * 100),
                      minimumOrderMinor: undefined,
                      minOrderMinor: Math.round(Number(f.get('minimum')) * 100),
                      deliveryRadiusKm: Number(f.get('radius')),
                      loyaltyEnabled: f.get('loyalty') === 'on',
                    }),
                  'Ordering policies saved.',
                );
              }}
            >
              <h2>Ordering policies</h2>
              <p className="form-hint">
                Changes apply to new orders. Existing order totals stay recorded at checkout.
              </p>
              <div className="form-grid section-gap">
                <label>
                  VAT (%)
                  <input
                    name="tax"
                    type="number"
                    min="0"
                    max="30"
                    step=".01"
                    defaultValue={(r.taxBps ?? 500) / 100}
                    required
                  />
                </label>
                <label>
                  Dine in service charge (%)
                  <input
                    name="service"
                    type="number"
                    min="0"
                    max="30"
                    step=".01"
                    defaultValue={(r.serviceBps ?? 500) / 100}
                    required
                  />
                </label>
                <label>
                  Minimum food order (BDT)
                  <input
                    name="minimum"
                    type="number"
                    min="0"
                    max="1000000"
                    step=".01"
                    defaultValue={(r.minOrderMinor ?? 0) / 100}
                    required
                  />
                </label>
                <label>
                  Delivery radius (km)
                  <input
                    name="radius"
                    type="number"
                    min="1"
                    max="100"
                    step=".1"
                    defaultValue={r.deliveryRadiusKm ?? 15}
                    required
                  />
                </label>
                <label className="check-row">
                  <input name="loyalty" type="checkbox" defaultChecked={r.loyaltyEnabled ?? true} />
                  Enable loyalty earn and redemption
                </label>
              </div>
              <button className="btn primary section-gap" disabled={busy}>
                Save ordering policies
              </button>
            </form>
            <section className="panel panel-body section-gap">
              <OpeningHours restaurant={r} />
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
