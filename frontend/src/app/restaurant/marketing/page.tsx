'use client';
import { useState } from 'react';
import { Gift, Megaphone, Plus, TicketPercent } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Metric, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { date, money, patch, post } from '@/lib/api';
import { formNumber, formText, toIso, type Promotion } from '@/lib/advanced';
export default function Marketing() {
  const { user, restaurantId } = useApp();
  const { data, error, loading } = useResource<Promotion[]>(
    user ? `marketing/${restaurantId}` : null,
  );
  const [open, setOpen] = useState(false),
    [type, setType] = useState('PERCENT');
  const { run, busy } = useAction();
  return (
    <>
      <PageHeading
        eyebrow="GROWTH & RETENTION"
        title="Give good guests another reason to return."
        description="Create branch-specific offers with controlled budgets, expiry dates and per-customer limits."
      >
        <button className="btn primary" onClick={() => setOpen(true)}>
          <Plus size={17} />
          Create promotion
        </button>
      </PageHeading>
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <Metric
          label="Active offers"
          value={
            data?.filter((p) => p.active && (!p.expiresAt || new Date(p.expiresAt) > new Date()))
              .length || 0
          }
          detail="Available at this location"
          icon={<Megaphone size={19} />}
        />
        <Metric
          label="Reward redemptions"
          value={data?.reduce((s, p) => s + (p._count?.redemptions || 0), 0) || 0}
          detail="Persisted, server-validated use"
          icon={<TicketPercent size={19} />}
        />
        <Metric
          label="Loyalty program"
          value="Earn & redeem"
          detail="1 point per ৳100 of completed food"
          icon={<Gift size={19} />}
        />
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : data?.length ? (
        <div className="advanced-grid">
          {data.map((p) => (
            <article className="panel promotion-card" key={p.id}>
              <div className="summary-row">
                <span className="promo-code">{p.code}</span>
                <Badge value={p.active ? 'ACTIVE' : 'PAUSED'} />
              </div>
              <h2>
                {p.type === 'PERCENT' ? `${p.value}% off food` : `${money(p.value)} off food`}
              </h2>
              <p className="muted">
                Minimum food order {money(p.minOrderMinor)} · Savings capped at{' '}
                {money(p.maxDiscountMinor)}
              </p>
              <div className="info-pair">
                <span>Usage</span>
                <strong>
                  {p._count?.redemptions || 0} / {p.maxRedemptions}
                </strong>
              </div>
              <div className="info-pair">
                <span>Per guest</span>
                <strong>{p.maxPerCustomer} uses</strong>
              </div>
              <div className="info-pair">
                <span>Expires</span>
                <strong>{p.expiresAt ? date(p.expiresAt) : 'No expiry'}</strong>
              </div>
              <button
                className={`btn wide section-gap ${p.active ? 'secondary' : 'primary'}`}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => patch(`marketing/promotions/${p.id}`, { active: !p.active }),
                    p.active ? 'Promotion paused.' : 'Promotion activated.',
                  )
                }
              >
                {p.active ? 'Pause offer' : 'Activate offer'}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="Make your next good offer">
          Your promotions are scoped to this branch and validated again at checkout.
        </Empty>
      )}
      {open && (
        <Modal title="A thoughtful offer, with clear limits" onClose={() => setOpen(false)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post(`marketing/${restaurantId}`, {
                    code: formText(f, 'code').toUpperCase(),
                    type,
                    value:
                      type === 'PERCENT'
                        ? formNumber(f, 'value')
                        : Math.round(formNumber(f, 'value') * 100),
                    minOrderMinor: Math.round(formNumber(f, 'min') * 100),
                    maxDiscountMinor: Math.round(formNumber(f, 'cap') * 100),
                    maxPerCustomer: formNumber(f, 'perGuest'),
                    maxRedemptions: formNumber(f, 'max'),
                    expiresAt: formText(f, 'expires') ? toIso(formText(f, 'expires')) : undefined,
                  }),
                'Promotion created.',
              );
              if (result) setOpen(false);
            }}
          >
            <label>
              Offer code
              <input
                name="code"
                required
                pattern="[A-Za-z0-9]{3,30}"
                maxLength={30}
                placeholder="FRESH20"
                style={{ textTransform: 'uppercase' }}
              />
            </label>
            <div className="form-grid">
              <label>
                Discount type
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="PERCENT">Percentage off food</option>
                  <option value="FIXED">Fixed amount off food</option>
                </select>
              </label>
              <label>
                {type === 'PERCENT' ? 'Discount (%)' : 'Discount (৳)'}
                <input
                  name="value"
                  type="number"
                  min={1}
                  max={type === 'PERCENT' ? 100 : 10000}
                  step={type === 'PERCENT' ? 1 : '.01'}
                  required
                  defaultValue={15}
                />
              </label>
              <label>
                Minimum food order (৳)
                <input name="min" type="number" min={0} step=".01" defaultValue={300} required />
              </label>
              <label>
                Maximum saving (৳)
                <input name="cap" type="number" min={0} step=".01" defaultValue={150} required />
              </label>
              <label>
                Overall usage limit
                <input name="max" type="number" min={1} max={1000000} defaultValue={100} required />
              </label>
              <label>
                Uses per customer
                <input name="perGuest" type="number" min={1} max={1000} defaultValue={1} required />
              </label>
            </div>
            <label>
              Expires at
              <input name="expires" type="datetime-local" />
            </label>
            <p className="form-hint">
              Redemption limits are checked inside the order transaction, including simultaneous
              checkouts.
            </p>
            <button className="btn primary" disabled={busy}>
              Create promotion
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
