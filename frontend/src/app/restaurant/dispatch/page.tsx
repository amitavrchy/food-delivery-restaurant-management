'use client';
import { useState } from 'react';
import { Bike, Clock3, MapPin, RadioTower, Truck } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Metric, PageHeading } from '@/components/ui';
import { useResource } from '@/lib/hooks';
import { date, money, time } from '@/lib/api';
import type { DeliveryMonitor } from '@/lib/advanced';
export default function DispatchControl() {
  const { user, restaurantId } = useApp();
  const { data, error, loading } = useResource<DeliveryMonitor[]>(
    user ? `enterprise/${restaurantId}/dispatch` : null,
  );
  const [tab, setTab] = useState('All active');
  const orders = (data || []).filter(
    (o) =>
      tab === 'All active' ||
      (tab === 'Unassigned' ? !o.rider : ['PICKED_UP', 'ARRIVING'].includes(o.status)),
  );
  return (
    <>
      <PageHeading
        eyebrow="DELIVERY CONTROL TOWER"
        title="A clear picture of every journey."
        description="Watch assignment, offer expiry, rider freshness and the orders that need attention."
      >
        <span className="live-indicator">
          <i />
          Live operational view
        </span>
      </PageHeading>
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <Metric
          label="Active deliveries"
          value={data?.length || 0}
          detail="Across this branch’s kitchen and fleet"
          icon={<Truck size={19} />}
        />
        <Metric
          label="Need a rider"
          value={
            data?.filter((o) => !o.rider && ['READY', 'ASSIGNING_RIDER'].includes(o.status))
              .length || 0
          }
          detail="Dispatch retries with radius expansion"
          icon={<RadioTower size={19} />}
        />
        <Metric
          label="On the road"
          value={data?.filter((o) => ['PICKED_UP', 'ARRIVING'].includes(o.status)).length || 0}
          detail="Assigned partner, protected live position"
          icon={<Bike size={19} />}
        />
      </div>
      <div className="toolbar">
        <div className="tabs">
          {['All active', 'Unassigned', 'On the road'].map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : orders.length ? (
        <div className="order-grid">
          {orders.map((o) => {
            const fresh =
              o.rider?.lastPingAt && Date.now() - new Date(o.rider.lastPingAt).getTime() < 300000;
            return (
              <article className="panel panel-body" key={o.id}>
                <div className="summary-row">
                  <h3>Order #{o.number}</h3>
                  <Badge value={o.status} />
                </div>
                <div className="info-pair">
                  <span>Placed</span>
                  <strong>
                    {date(o.placedAt)} · {time(o.placedAt)}
                  </strong>
                </div>
                {o.scheduledFor && (
                  <div className="info-pair">
                    <span>Scheduled arrival</span>
                    <strong>
                      {date(o.scheduledFor)} · {time(o.scheduledFor)}
                    </strong>
                  </div>
                )}
                <div className="info-pair">
                  <span>Delivery address</span>
                  <strong className="wrap-value">{o.deliveryAddress}</strong>
                </div>
                <div className="info-pair">
                  <span>Partner</span>
                  <strong>
                    {o.rider ? `${o.rider.user.name} · ${o.rider.vehicle}` : 'Awaiting assignment'}
                  </strong>
                </div>
                {o.rider && (
                  <div className="info-pair">
                    <span>Last position</span>
                    <span className={fresh ? 'green-text' : 'danger-text'}>
                      {fresh ? 'Fresh location' : 'Stale / waiting for GPS'}
                    </span>
                  </div>
                )}
                {o.rider?.lat != null && o.rider.lng != null && (
                  <a
                    className="text-link section-gap"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${o.rider.lat}&mlon=${o.rider.lng}#map=16/${o.rider.lat}/${o.rider.lng}`}
                  >
                    <MapPin size={17} />
                    View last rider coordinates
                  </a>
                )}
                <details className="section-gap">
                  <summary>Offer trail ({o.offers.length})</summary>
                  {o.offers.length ? (
                    o.offers.map((offer) => (
                      <div className="info-pair" key={offer.id}>
                        <div>
                          <strong>{offer.rider.user.name}</strong>
                          <small className="cell-meta">Expires {time(offer.expiresAt)}</small>
                        </div>
                        <Badge value={offer.status} />
                      </div>
                    ))
                  ) : (
                    <p className="form-hint section-gap">
                      Offers are created when the kitchen marks this delivery ready.
                    </p>
                  )}
                </details>
                <div className="info-pair section-gap">
                  <span>Order value</span>
                  <strong>{money(o.grandMinor)}</strong>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty title="A clear road ahead">
          Active deliveries appear here as they move from kitchen to doorstep.
        </Empty>
      )}
    </>
  );
}
