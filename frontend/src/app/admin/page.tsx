'use client';
import { useState } from 'react';
import { Bike, Save, ShieldCheck, Store } from 'lucide-react';
import { Access, CustomerShell } from '@/components/shell';
import { Badge, ErrorState, Loading, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { date, label, patch } from '@/lib/api';
import { useApp } from '@/components/provider';
import type { Restaurant } from '@/lib/types';
type Platform = {
  restaurants: (Restaurant & { _count: { orders: number } })[];
  riders: {
    userId: string;
    status: string;
    verified: boolean;
    documentRef: string | null;
    vehicle: string;
    user: { name: string; email: string };
  }[];
  audit: { id: string; action: string; entityId: string; actorId: string; createdAt: string }[];
};
export default function AdminPage() {
  const { user } = useApp();
  const { data, error, loading } = useResource<Platform>(
    user?.role === 'PLATFORM_ADMIN' ? 'admin' : null,
  );
  const { run, busy } = useAction();
  const [edit, setEdit] = useState<Restaurant | null>(null),
    [commission, setCommission] = useState(15),
    [status, setStatus] = useState('ACTIVE');
  return (
    <CustomerShell>
      <Access roles={['PLATFORM_ADMIN']}>
        <PageHeading
          eyebrow="A HEALTHIER FOOD ECOSYSTEM"
          title="A little oversight. A lot of trust."
          description="Keep restaurants, riders and platform policies in good hands."
        >
          <span className="date-chip">
            <ShieldCheck size={18} />
            Platform administration
          </span>
        </PageHeading>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          data && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <h2>Your partner kitchens</h2>
                  <Store size={21} />
                </div>
                <div className="table-spacer" />
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Restaurant</th>
                        <th>Status</th>
                        <th>Commission</th>
                        <th>Orders</th>
                        <th>Policy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.restaurants.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.name}</strong>
                            <span className="cell-meta">{r.address}</span>
                          </td>
                          <td>
                            <Badge value={r.status} />
                          </td>
                          <td>{r.commissionBps / 100}%</td>
                          <td>{r._count.orders}</td>
                          <td>
                            <button
                              className="text-link"
                              onClick={() => {
                                setEdit(r);
                                setCommission(r.commissionBps / 100);
                                setStatus(r.status);
                              }}
                            >
                              Manage policy
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel section-gap">
                <div className="panel-head">
                  <h2>Your delivery partners</h2>
                  <Bike size={21} />
                </div>
                <div className="table-spacer" />
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rider</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Documents</th>
                        <th>Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.riders.map((r) => (
                        <tr key={r.userId}>
                          <td>
                            <strong>{r.user.name}</strong>
                            <span className="cell-meta">{r.user.email}</span>
                          </td>
                          <td>{r.vehicle}</td>
                          <td>
                            <Badge value={r.status} />
                          </td>
                          <td>{r.documentRef || 'No reference submitted'}</td>
                          <td>
                            <button
                              className={`btn small ${r.verified ? 'secondary' : 'primary'}`}
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () =>
                                    patch(`admin/riders/${r.userId}`, { verified: !r.verified }),
                                  'Verification updated.',
                                )
                              }
                            >
                              {r.verified ? 'Verified · Revoke' : 'Verify rider'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel section-gap">
                <div className="panel-head">
                  <h2>Policy & exception audit</h2>
                </div>
                <div className="panel-body">
                  {data.audit.length ? (
                    data.audit.map((a) => (
                      <div className="info-pair" key={a.id}>
                        <div>
                          <strong>{label(a.action)}</strong>
                          <small className="cell-meta">
                            {a.entityId} · by {a.actorId}
                          </small>
                        </div>
                        <span className="muted">{date(a.createdAt)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      Policy changes and emergency reassignments will be recorded here.
                    </p>
                  )}
                </div>
              </section>
            </>
          )
        )}
        {edit && (
          <Modal title={`Policy · ${edit.name}`} onClose={() => setEdit(null)}>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await run(
                  () =>
                    patch(`admin/restaurants/${edit.id}`, {
                      commissionBps: Math.round(commission * 100),
                      status,
                    }),
                  'Policy saved to audit log.',
                );
                if (result) setEdit(null);
              }}
            >
              <label>
                Restaurant status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </label>
              <label>
                Commission (%)
                <input
                  type="number"
                  min={0}
                  max={50}
                  step=".01"
                  required
                  value={commission}
                  onChange={(e) => setCommission(Number(e.target.value))}
                />
              </label>
              <p className="form-hint">
                Suspended restaurants cannot receive new orders. Every change is recorded in the
                audit log.
              </p>
              <div className="form-actions">
                <button type="button" className="btn secondary" onClick={() => setEdit(null)}>
                  Cancel
                </button>
                <button className="btn primary" disabled={busy}>
                  <Save size={17} />
                  Save policy
                </button>
              </div>
            </form>
          </Modal>
        )}
      </Access>
    </CustomerShell>
  );
}
