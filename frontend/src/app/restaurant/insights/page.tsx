'use client';
import { useState } from 'react';
import { ChartNoAxesCombined, Clock3, Download, HeartHandshake, Percent } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Metric, PageHeading } from '@/components/ui';
import { useResource } from '@/lib/hooks';
import { date, money } from '@/lib/api';
import { downloadCsv } from '@/lib/export';
import type { Insights } from '@/lib/advanced';
export default function BusinessInsights() {
  const { user, restaurantId } = useApp();
  const {
    data: r,
    error,
    loading,
  } = useResource<Insights>(user ? `enterprise/${restaurantId}/insights` : null);
  const [tab, setTab] = useState('Menu engineering');
  return (
    <>
      <PageHeading
        eyebrow="BUSINESS INTELLIGENCE"
        title="A deeper understanding of good business."
        description="Connect guest behavior, menu contribution and labor planning using your real activity."
      >
        <button
          className="btn secondary"
          disabled={!r}
          onClick={() =>
            r &&
            downloadCsv('tablelane-menu-engineering.csv', [
              [
                'Dish',
                'Sold',
                'Food sales (minor)',
                'Current recipe cost (minor)',
                'Contribution (minor)',
                'Margin %',
                'Category',
              ],
              ...r.menuEngineering.map((i) => [
                i.name,
                i.qty,
                i.revenueMinor,
                i.costMinor,
                i.marginMinor,
                i.marginPercent,
                i.category,
              ]),
            ])
          }
        >
          <Download size={17} />
          Export menu analysis
        </button>
      </PageHeading>
      {loading && !r ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        r && (
          <>
            <div className="metrics">
              <Metric
                label="30-day completed sales"
                value={money(r.revenueMinor)}
                detail={`${r.completedOrders} completed orders`}
                icon={<ChartNoAxesCombined size={19} />}
              />
              <Metric
                label="Returning guests"
                value={r.repeatGuests}
                detail="Guests with more than one completed visit"
                icon={<HeartHandshake size={19} />}
              />
              <Metric
                label="Logged labor"
                value={`${r.labor.hours} h`}
                detail={`${r.labor.plannedHours} planned hours`}
                icon={<Clock3 size={19} />}
              />
              <Metric
                label="Recorded waste cost"
                value={money(r.wasteCostMinor)}
                detail="At current ingredient costs"
                icon={<Percent size={19} />}
              />
            </div>
            <div className="toolbar">
              <div className="tabs">
                {['Menu engineering', 'Guest segments', 'Demand & labor'].map((t) => (
                  <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <span className="muted">Last {r.periodDays} days · Asia/Dhaka</span>
            </div>
            {tab === 'Menu engineering' ? (
              <>
                <div className="engineering-legend">
                  <span>
                    <b className="legend-dot" />
                    Star: high demand, high contribution
                  </span>
                  <span>
                    <b className="legend-dot light" />
                    Plowhorse: popular, lower contribution
                  </span>
                  <span>
                    <b className="legend-dot pale" />
                    Puzzle: higher contribution, lower demand
                  </span>
                  <span>Dog: lower demand and contribution</span>
                </div>
                <section className="panel table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Dish</th>
                        <th>Sold</th>
                        <th>Food sales</th>
                        <th>Recipe cost</th>
                        <th>Contribution</th>
                        <th>Margin</th>
                        <th>Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.menuEngineering.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <strong>{i.name}</strong>
                            <small className="cell-meta">Price {money(i.priceMinor)}</small>
                          </td>
                          <td>{i.qty}</td>
                          <td>{money(i.revenueMinor)}</td>
                          <td>{money(i.costMinor)}</td>
                          <td>{money(i.marginMinor)}</td>
                          <td className={i.marginPercent < 0 ? 'danger-text' : 'green-text'}>
                            {i.marginPercent}%
                          </td>
                          <td>
                            <Badge value={i.category} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <p className="form-hint section-gap">
                  Contribution uses current base recipe costs and menu prices, not historical
                  accounting COGS. Categories compare demand and margin to this menu’s average.
                </p>
              </>
            ) : tab === 'Guest segments' ? (
              <section className="panel table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Segment</th>
                      <th>Completed visits</th>
                      <th>Period spending</th>
                      <th>Most recent visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.guests.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <strong>{g.name}</strong>
                          <small className="cell-meta">{g.email}</small>
                        </td>
                        <td>
                          <Badge value={g.visits > 1 ? 'RETURNING' : 'NEW_GUEST'} />
                        </td>
                        <td>{g.visits}</td>
                        <td>{money(g.spendMinor)}</td>
                        <td>{date(g.lastVisit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!r.guests.length && <Empty title="Your guest story starts with service" />}
              </section>
            ) : (
              <div className="report-grid">
                <section className="panel panel-body">
                  <h2>When your guests order</h2>
                  <p className="muted">Completed order count by local hour</p>
                  <div className="hourly-chart">
                    {r.hourly.map((h) => (
                      <div className="hourly-column" key={h.hour}>
                        <div
                          tabIndex={0}
                          title={`${h.hour}:00 · ${h.orders} orders · ${money(h.revenueMinor)}`}
                          aria-label={`${h.hour}:00 ${h.orders} completed orders`}
                          style={{
                            height: `${Math.max(2, (h.orders / Math.max(1, ...r.hourly.map((x) => x.orders))) * 100)}%`,
                          }}
                        />
                        {h.hour % 6 === 0 && <span>{String(h.hour).padStart(2, '0')}</span>}
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel panel-body">
                  <h2>Your labor picture</h2>
                  <div className="info-pair section-gap">
                    <span>Attendance hours</span>
                    <strong>{r.labor.hours} h</strong>
                  </div>
                  <div className="info-pair">
                    <span>Planned hours</span>
                    <strong>{r.labor.plannedHours} h</strong>
                  </div>
                  <div className="info-pair">
                    <span>Estimated attendance cost</span>
                    <strong>{money(r.labor.estimatedCostMinor)}</strong>
                  </div>
                  <div className="info-pair">
                    <span>Cancelled orders</span>
                    <strong>{r.cancelledOrders}</strong>
                  </div>
                  <p className="form-hint section-gap">
                    Attendance cost uses current teammate hourly rates; planned shifts retain their
                    rate snapshots. These estimates do not perform payroll payments.
                  </p>
                </section>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}
