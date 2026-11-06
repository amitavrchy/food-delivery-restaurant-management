'use client';
import { useState } from 'react';
import { AlertTriangle, ArrowDownUp, Download, Package, Search } from 'lucide-react';
import { IngredientEditor } from '@/components/operational-editors';
import { useApp } from '@/components/provider';
import { Empty, ErrorState, Loading, Metric, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { date, money, post } from '@/lib/api';
import { downloadCsv } from '@/lib/export';
import type { Inventory } from '@/lib/types';
export default function InventoryPage() {
  const { user, restaurantId } = useApp();
  const { data, error, loading } = useResource<Inventory[]>(
    user ? `inventory/${restaurantId}` : null,
  );
  const [query, setQuery] = useState(''),
    [low, setLow] = useState(false),
    [edit, setEdit] = useState<Inventory | null>(null),
    [history, setHistory] = useState<Inventory | null>(null),
    [adding, setAdding] = useState(false);
  const lowStock = (data || []).filter((i) => Number(i.qtyOnHand) <= Number(i.lowStockQty));
  const items = (data || []).filter(
    (i) =>
      i.name.toLowerCase().includes(query.toLowerCase()) &&
      (!low || Number(i.qtyOnHand) <= Number(i.lowStockQty)),
  );
  return (
    <>
      <PageHeading
        title="A well-stocked kind of day."
        description="Know what’s in your pantry. Keep every serving accounted for."
      >
        <button className="btn primary" onClick={() => setAdding(true)}>
          Add ingredient
        </button>
        <button
          className="btn secondary"
          onClick={() =>
            downloadCsv('tablelane-stock.csv', [
              ['Ingredient', 'In stock', 'Unit', 'Threshold'],
              ...(data || []).map((i) => [i.name, i.qtyOnHand, i.uom, i.lowStockQty]),
            ])
          }
        >
          <Download size={17} />
          Export stock
        </button>
      </PageHeading>
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <Metric
          label="Pantry ingredients"
          value={data?.length || 0}
          detail="Recipe linked and accounted for"
          icon={<Package size={18} />}
        />
        <Metric
          label="Could use a top-up"
          value={lowStock.length}
          detail="At or below reorder threshold"
          icon={<AlertTriangle size={18} />}
        />
        <Metric
          label="Stock value"
          value={money(
            Math.round((data || []).reduce((s, i) => s + Number(i.qtyOnHand) * i.costMinor, 0)),
          )}
          detail="At current ingredient costs"
          icon={<ArrowDownUp size={18} />}
        />
      </div>
      <div className="toolbar">
        <div className="tabs">
          <button className={!low ? 'active' : ''} onClick={() => setLow(false)}>
            All ingredients
          </button>
          <button className={low ? 'active' : ''} onClick={() => setLow(true)}>
            Low stock ({lowStock.length})
          </button>
        </div>
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search ingredients"
            placeholder="Find an ingredient…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <section className="panel">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} />
        ) : items.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>In stock</th>
                  <th>Reorder at</th>
                  <th>Unit cost</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const isLow = Number(i.qtyOnHand) <= Number(i.lowStockQty);
                  return (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.name}</strong>
                        <span className="cell-meta">Recipe ingredient</span>
                      </td>
                      <td>
                        <strong className={isLow ? 'low-stock' : ''}>
                          {Number(i.qtyOnHand)
                            .toFixed(3)
                            .replace(/\.?0+$/, '')}{' '}
                          {i.uom}
                        </strong>
                        <div className="inventory-progress">
                          <span
                            style={{
                              width: `${Math.min(100, (Number(i.qtyOnHand) / Math.max(1, Number(i.lowStockQty) * 3)) * 100)}%`,
                              background: isLow ? '#d9b673' : undefined,
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        {Number(i.lowStockQty)} {i.uom}
                      </td>
                      <td>
                        {money(i.costMinor)} / {i.uom}
                      </td>
                      <td>
                        <span className={`badge ${isLow ? 'pending' : 'active'}`}>
                          {isLow ? 'Low stock' : 'Well stocked'}
                        </span>
                      </td>
                      <td>
                        <button className="text-link" onClick={() => setEdit(i)}>
                          Adjust
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`History for ${i.name}`}
                          title="Stock history"
                          onClick={() => setHistory(i)}
                        >
                          <ArrowDownUp size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Nothing needs your attention here">
            Try a different filter or ingredient name.
          </Empty>
        )}
      </section>
      {adding && <IngredientEditor restaurantId={restaurantId} onClose={() => setAdding(false)} />}
      {edit && <AdjustStock item={edit} onClose={() => setEdit(null)} />}
      {history && (
        <Modal title={`Stock history · ${history.name}`} onClose={() => setHistory(null)}>
          {history.movements.length ? (
            history.movements.map((m) => (
              <div className="bill-line" key={m.id}>
                <div>
                  <strong>{m.reason}</strong>
                  <small>
                    {date(m.createdAt)} · {m.reference || 'Stock movement'}
                  </small>
                </div>
                <strong className={Number(m.delta) < 0 ? 'danger-text' : 'green-text'}>
                  {Number(m.delta) > 0 ? '+' : ''}
                  {m.delta} {history.uom}
                </strong>
              </div>
            ))
          ) : (
            <Empty title="No stock movements yet" />
          )}
        </Modal>
      )}
    </>
  );
}
function AdjustStock({ item, onClose }: { item: Inventory; onClose: () => void }) {
  const [reason, setReason] = useState('RESTOCK'),
    [qty, setQty] = useState(1),
    [notes, setNotes] = useState('');
  const { run, busy } = useAction();
  return (
    <Modal title={`A little stock update · ${item.name}`} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await run(
            () =>
              post(`inventory/${item.id}/adjust`, {
                delta: reason === 'WASTE' ? -Math.abs(qty) : qty,
                reason,
                notes,
              }),
            'Stock updated and movement recorded.',
          );
          if (result) onClose();
        }}
      >
        <p className="muted">
          Current stock: {item.qtyOnHand} {item.uom}
        </p>
        <label>
          Movement type
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="RESTOCK">Restock</option>
            <option value="WASTE">Wastage / spoilage</option>
            <option value="CORRECTION">Correction (positive or negative)</option>
          </select>
        </label>
        <label>
          Quantity ({item.uom})
          <input
            type="number"
            step=".001"
            min={reason === 'CORRECTION' ? -100000 : 0.001}
            max={100000}
            required
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </label>
        <label>
          Reason / reference
          <textarea
            required
            minLength={3}
            maxLength={300}
            placeholder="Delivery reference, spoilage reason or count correction…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            Record movement
          </button>
        </div>
      </form>
    </Modal>
  );
}
