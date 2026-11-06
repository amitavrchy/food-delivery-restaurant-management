'use client';
import { Bike, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { date, label, money } from '@/lib/api';
import type { Report } from '@/lib/types';
export function RevenueChart({ report }: { report: Report }) {
  const values = report.daily.slice(-7);
  const max = Math.max(...values.map((d) => d.revenueMinor), 1);
  return (
    <>
      <div className="chart-summary">
        <strong>{money(report.revenueMinor)}</strong>
        <span>over the last {report.period} days</span>
      </div>
      <div className="revenue-chart" aria-label="Daily revenue bar chart">
        {values.map((d, i) => (
          <div className="chart-column" key={d.day}>
            <div
              className="chart-bar"
              tabIndex={0}
              style={{
                height: `${Math.max(1, (d.revenueMinor / max) * 95)}%`,
                animationDelay: `${i * 40}ms`,
              }}
              aria-label={`${date(d.day)}: ${money(d.revenueMinor)}, ${d.orders} orders`}
            >
              <span className="chart-tooltip">{money(d.revenueMinor)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="chart-labels">
        {values.map((d) => (
          <span key={d.day}>
            {new Date(d.day + 'T12:00:00+06:00').toLocaleDateString('en', {
              weekday: 'short',
              timeZone: 'Asia/Dhaka',
            })}
          </span>
        ))}
      </div>
    </>
  );
}
export function ChannelChart({ report }: { report: Report }) {
  const total = report.channels.reduce((s, c) => s + c.count, 0);
  const delivery = ((report.channels[0]?.count || 0) / (total || 1)) * 100;
  const dine = ((report.channels[1]?.count || 0) / (total || 1)) * 100;
  return (
    <>
      <div className="donut-wrap">
        <div
          className="donut"
          role="img"
          aria-label={`${total} completed orders by channel`}
          style={{
            background: `conic-gradient(#245c42 0 ${delivery}%,#b7cc93 ${delivery}% ${delivery + dine}%,#dce6ce ${delivery + dine}% 100%)`,
          }}
        >
          <div>
            <strong>{total}</strong>
            <small>orders</small>
          </div>
        </div>
        <div className="donut-legend">
          <p>
            <i className="legend-dot" />
            Delivery
          </p>
          <p>
            <i className="legend-dot light" />
            Dine in
          </p>
          <p>
            <i className="legend-dot pale" />
            Takeaway
          </p>
        </div>
      </div>
      <div className="panel-body">
        {report.channels.map((c, i) => {
          const Icon = [Bike, UtensilsCrossed, ShoppingBag][i];
          return (
            <div className="channel-row" key={c.channel}>
              <span className="channel-icon">
                <Icon size={20} />
              </span>
              <div>
                <strong>{label(c.channel)}</strong>
                <div className="channel-track">
                  <i style={{ width: `${total ? (c.count / total) * 100 : 0}%` }} />
                </div>
              </div>
              <b>{total ? Math.round((c.count / total) * 100) : 0}%</b>
            </div>
          );
        })}
      </div>
    </>
  );
}
