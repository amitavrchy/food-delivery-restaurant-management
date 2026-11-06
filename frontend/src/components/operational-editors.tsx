'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from './ui';
import { api, post } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import type { Inventory, MenuItem } from '@/lib/types';
type EditableGroup = {
  name: string;
  minSelect: number;
  maxSelect: number;
  options: {
    name: string;
    priceDeltaMinor: number;
    inventoryItemId: string | null;
    ingredientQty: number;
  }[];
};
export function ModifierEditor({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const [groups, setGroups] = useState<EditableGroup[]>(
    item.modifierGroups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({
        ...o,
        inventoryItemId:
          (o as unknown as { inventoryItemId: string | null }).inventoryItemId || null,
        ingredientQty: Number((o as unknown as { ingredientQty: string }).ingredientQty || 0),
      })),
    })),
  );
  const { data: inventory } = useResource<Inventory[]>(`inventory/${item.restaurantId}`);
  const { run, busy } = useAction();
  function change(index: number, update: Partial<EditableGroup>) {
    setGroups((gs) => gs.map((g, i) => (i === index ? { ...g, ...update } : g)));
  }
  return (
    <Modal title={`Options · ${item.name}`} onClose={onClose}>
      <p className="form-hint" style={{ marginBottom: 20 }}>
        Required groups are enforced at checkout. Changing options refreshes the menu; existing
        order snapshots stay intact.
      </p>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await run(
            () =>
              api(`menu/${item.id}/modifiers`, { method: 'PUT', body: JSON.stringify({ groups }) }),
            'Menu options saved.',
          );
          if (result) onClose();
        }}
      >
        {groups.map((g, i) => (
          <fieldset key={i} style={{ background: '#f8faf4', padding: 17, borderRadius: 10 }}>
            <div className="inline-fields">
              <label>
                Group name
                <input
                  required
                  maxLength={80}
                  value={g.name}
                  onChange={(e) => change(i, { name: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove group"
                onClick={() => setGroups((gs) => gs.filter((_, j) => i !== j))}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="form-grid section-gap">
              <label>
                Minimum selections
                <input
                  type="number"
                  required
                  min={0}
                  max={10}
                  value={g.minSelect}
                  onChange={(e) => change(i, { minSelect: Number(e.target.value) })}
                />
              </label>
              <label>
                Maximum selections
                <input
                  type="number"
                  required
                  min={1}
                  max={10}
                  value={g.maxSelect}
                  onChange={(e) => change(i, { maxSelect: Number(e.target.value) })}
                />
              </label>
            </div>
            {g.options.map((o, j) => (
              <div key={j} style={{ padding: '15px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="inline-fields">
                  <label>
                    Option name
                    <input
                      required
                      maxLength={80}
                      value={o.name}
                      onChange={(e) =>
                        change(i, {
                          options: g.options.map((x, k) =>
                            j === k ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Extra price (৳)
                    <input
                      type="number"
                      required
                      min={0}
                      step=".01"
                      value={o.priceDeltaMinor / 100}
                      onChange={(e) =>
                        change(i, {
                          options: g.options.map((x, k) =>
                            j === k
                              ? { ...x, priceDeltaMinor: Math.round(Number(e.target.value) * 100) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label="Remove option"
                    onClick={() => change(i, { options: g.options.filter((_, k) => k !== j) })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label>
                    Extra ingredient
                    <select
                      value={o.inventoryItemId || ''}
                      onChange={(e) =>
                        change(i, {
                          options: g.options.map((x, k) =>
                            j === k ? { ...x, inventoryItemId: e.target.value || null } : x,
                          ),
                        })
                      }
                    >
                      <option value="">No extra ingredient</option>
                      {inventory?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.uom})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ingredient per serving
                    <input
                      type="number"
                      min={0}
                      step=".001"
                      value={o.ingredientQty}
                      onChange={(e) =>
                        change(i, {
                          options: g.options.map((x, k) =>
                            j === k ? { ...x, ingredientQty: Number(e.target.value) } : x,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-link section-gap"
              onClick={() =>
                change(i, {
                  options: [
                    ...g.options,
                    { name: '', priceDeltaMinor: 0, inventoryItemId: null, ingredientQty: 0 },
                  ],
                })
              }
            >
              <Plus size={17} />
              Add option
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="text-link"
          onClick={() =>
            setGroups((gs) => [
              ...gs,
              {
                name: '',
                minSelect: 0,
                maxSelect: 1,
                options: [
                  { name: '', priceDeltaMinor: 0, inventoryItemId: null, ingredientQty: 0 },
                ],
              },
            ])
          }
        >
          <Plus size={17} />
          Add option group
        </button>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            Save options
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function IngredientEditor({
  restaurantId,
  onClose,
}: {
  restaurantId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(''),
    [uom, setUom] = useState('kg'),
    [qty, setQty] = useState(0),
    [threshold, setThreshold] = useState(5),
    [cost, setCost] = useState(0);
  const { run, busy } = useAction();
  return (
    <Modal title="A new pantry essential" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await run(
            () =>
              post(`inventory/restaurant/${restaurantId}`, {
                name,
                uom,
                qtyOnHand: qty,
                lowStockQty: threshold,
                costMinor: Math.round(cost * 100),
              }),
            'Ingredient added with opening stock recorded.',
          );
          if (result) onClose();
        }}
      >
        <label>
          Ingredient name
          <input
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Unit of measure
            <select value={uom} onChange={(e) => setUom(e.target.value)}>
              {['kg', 'g', 'L', 'ml', 'pcs'].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label>
            Unit cost (৳)
            <input
              required
              type="number"
              min={0}
              max={1000000}
              step=".01"
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
            />
          </label>
          <label>
            Opening quantity
            <input
              required
              type="number"
              min={0}
              max={100000}
              step=".001"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </label>
          <label>
            Low stock threshold
            <input
              required
              type="number"
              min={0}
              max={100000}
              step=".001"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            Add ingredient
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ComplimentaryCheck({
  checkId,
  onClose,
  onDone,
}: {
  checkId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState(''),
    [reason, setReason] = useState('');
  const { run, busy } = useAction();
  return (
    <Modal title="A meal on the house." onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await run(
            () => post(`pos/checks/${checkId}/complimentary`, { managerPin: pin, reason }),
            'Complimentary check recorded and closed.',
          );
          if (result) onDone();
        }}
      >
        <p className="muted">
          This closes a fully served, unpaid check at no charge. The original value and your reason
          are recorded in the audit log.
        </p>
        <label>
          Reason
          <textarea
            minLength={5}
            maxLength={300}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label>
          Manager PIN
          <input
            type="password"
            autoComplete="off"
            required
            maxLength={20}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            Make complimentary
          </button>
        </div>
      </form>
    </Modal>
  );
}
