'use client';
import { useState } from 'react';
import { Building2, ChartNoAxesCombined, Plus, Store } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Metric, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { money, post } from '@/lib/api';
import { formNumber, formText, type Organization, type GroupBranch } from '@/lib/advanced';
export default function Branches() {
  const { user, reloadUser, setRestaurantId, refresh } = useApp();
  const {
    data: organizations,
    error,
    loading,
  } = useResource<Organization[]>(user ? 'organizations' : null);
  const [selected, setSelected] = useState(''),
    [modal, setModal] = useState<'organization' | 'branch' | null>(null);
  const organization = organizations?.find((o) => o.id === selected) || organizations?.[0];
  const { data: report } = useResource<GroupBranch[]>(
    organization ? `organizations/${organization.id}/report` : null,
  );
  const { run, busy } = useAction();
  return (
    <>
      <PageHeading
        eyebrow="MULTI-LOCATION OPERATIONS"
        title="One clear view. Every location."
        description="Manage your restaurant group, provision branches and compare the numbers that matter."
      >
        <button className="btn secondary" onClick={() => setModal('organization')}>
          <Plus size={17} />
          New organization
        </button>
        <button className="btn primary" disabled={!organization} onClick={() => setModal('branch')}>
          <Store size={17} />
          Add branch
        </button>
      </PageHeading>
      {loading && !organizations ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : organizations?.length ? (
        <>
          <div className="toolbar">
            <select
              style={{ maxWidth: 350 }}
              aria-label="Restaurant organization"
              value={organization?.id || ''}
              onChange={(e) => setSelected(e.target.value)}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <span className="muted">Owned by {organization?.owner.name} · Last 30 days</span>
          </div>
          <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
            <Metric
              label="Group revenue"
              value={money(report?.reduce((s, r) => s + r.revenueMinor, 0) || 0)}
              detail="Completed orders across locations"
              icon={<ChartNoAxesCombined size={19} />}
            />
            <Metric
              label="Active locations"
              value={report?.length || 0}
              detail="One organization, shared oversight"
              icon={<Building2 size={19} />}
            />
            <Metric
              label="Orders received"
              value={report?.reduce((s, r) => s + r.orders, 0) || 0}
              detail="Last 30 days, all channels"
              icon={<Store size={19} />}
            />
          </div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Location performance</h2>
                <p>Branch access stays scoped even when you work across the group.</p>
              </div>
            </div>
            <div className="table-spacer" />
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Sales</th>
                    <th>Orders</th>
                    <th>Average ticket</th>
                    <th>Stock alerts</th>
                    <th>Workspace</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        <span className="cell-meta">{r.address}</span>
                      </td>
                      <td>
                        <strong>{money(r.revenueMinor)}</strong>
                      </td>
                      <td>
                        {r.orders} · {r.activeOrders} active
                      </td>
                      <td>{money(r.averageTicketMinor)}</td>
                      <td>
                        <span className={`badge ${r.lowStock ? 'pending' : 'active'}`}>
                          {r.lowStock} low stock
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => {
                            setRestaurantId(r.id);
                            window.location.assign('/restaurant');
                          }}
                        >
                          Open branch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <Empty title="Build your restaurant group">
          Create an organization, then add its first location.
        </Empty>
      )}
      {modal === 'organization' && (
        <Modal title="Create a restaurant organization" onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post<{ id: string }>('organizations', {
                    name: formText(f, 'name'),
                    ...(formText(f, 'owner') ? { ownerEmail: formText(f, 'owner') } : {}),
                  }),
                'Organization created.',
              );
              if (result) {
                setSelected(result.id);
                await reloadUser();
                setModal(null);
              }
            }}
          >
            <label>
              Organization name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Your restaurant collective"
              />
            </label>
            {user?.role === 'PLATFORM_ADMIN' && (
              <label>
                Registered owner email
                <input name="owner" type="email" placeholder="owner@example.com" />
                <span className="form-hint">
                  The owner must register an account first. Leave blank to own the organization
                  yourself.
                </span>
              </label>
            )}
            <div className="form-actions">
              <button className="btn primary" disabled={busy}>
                Create organization
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'branch' && organization && (
        <Modal title={`New branch · ${organization.name}`} onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post(`organizations/${organization.id}/branches`, {
                    name: formText(f, 'name'),
                    address: formText(f, 'address'),
                    cuisine: formText(f, 'cuisine'),
                    description: formText(f, 'description'),
                    lat: formNumber(f, 'lat'),
                    lng: formNumber(f, 'lng'),
                    deliveryFeeMinor: Math.round(formNumber(f, 'fee') * 100),
                  }),
                'Branch provisioned with categories, stations, tables and owner access.',
              );
              if (result) {
                await reloadUser();
                setModal(null);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Restaurant name
                <input name="name" required minLength={2} maxLength={100} />
              </label>
              <label>
                Cuisine
                <input name="cuisine" required minLength={2} maxLength={50} />
              </label>
              <label className="form-full">
                Street address
                <textarea name="address" required minLength={8} maxLength={300} />
              </label>
              <label>
                Map latitude
                <input
                  type="number"
                  name="lat"
                  min={-90}
                  max={90}
                  step="any"
                  defaultValue={23.7806}
                  required
                />
              </label>
              <label>
                Map longitude
                <input
                  type="number"
                  name="lng"
                  min={-180}
                  max={180}
                  step="any"
                  defaultValue={90.4168}
                  required
                />
              </label>
              <label>
                Delivery fee (৳)
                <input name="fee" type="number" min={0} step=".01" defaultValue={49} required />
              </label>
            </div>
            <label>
              Restaurant description
              <textarea name="description" minLength={5} maxLength={500} required />
            </label>
            <p className="form-hint">
              Eight tables and three prep stations are created automatically. Configure the menu and
              service policies in the new branch before promoting it.
            </p>
            <div className="form-actions">
              <button className="btn primary" disabled={busy}>
                Create branch
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
