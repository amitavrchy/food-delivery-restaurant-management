'use client';
import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Modal } from './ui';
import { useApp } from './provider';
import { money, uuid } from '@/lib/api';
import type { CartLine, MenuItem } from '@/lib/types';
export function Quantity({
  qty,
  onChange,
  max = 30,
}: {
  qty: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <div className="quantity">
      <button type="button" aria-label="Decrease quantity" onClick={() => onChange(qty - 1)}>
        <Minus size={15} />
      </button>
      <span>{qty}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={qty >= max}
        onClick={() => onChange(qty + 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
export function ProductModal({
  item,
  onClose,
  onAdd,
  forPos = false,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
  forPos?: boolean;
}) {
  const [qty, setQty] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [seat, setSeat] = useState(1),
    [course, setCourse] = useState('MAIN'),
    [error, setError] = useState('');
  const unit =
    item.priceMinor +
    item.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => selected.includes(o.id))
      .reduce((s, m) => s + m.priceDeltaMinor, 0);
  function add() {
    for (const g of item.modifierGroups) {
      const count = g.options.filter((o) => selected.includes(o.id)).length;
      if (count < g.minSelect || count > g.maxSelect) {
        setError(`Choose ${g.minSelect}–${g.maxSelect} options for ${g.name}.`);
        return;
      }
    }
    onAdd({ key: uuid(), item, qty, modifierIds: selected, seat, course });
    onClose();
  }
  return (
    <Modal title={item.name} onClose={onClose}>
      <img className="product-modal-image" src={item.image} alt={item.name} />
      <p className="muted" style={{ marginBottom: 20 }}>
        {item.description}
      </p>
      <div className="form-stack">
        {!!item.dietaryTags?.length && (
          <p className="note-box">
            {item.dietaryTags.join(' · ')}
            {item.energyKcal != null ? ` · ${item.energyKcal} kcal` : ''}
          </p>
        )}
        {!!item.allergens?.length && (
          <p className="note-box">
            Contains: {item.allergens.join(', ')}. Contact the restaurant about allergies and cross
            contamination before ordering.
          </p>
        )}
        {item.modifierGroups.map((g) => (
          <fieldset key={g.id}>
            <legend>
              {g.name}{' '}
              <span className="form-hint">
                Choose {g.minSelect}–{g.maxSelect}
              </span>
            </legend>
            {g.options.map((o) => (
              <label className="modifier-option" key={o.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? g.maxSelect === 1
                          ? [...s.filter((id) => !g.options.some((x) => x.id === id)), o.id]
                          : [...s, o.id]
                        : s.filter((id) => id !== o.id),
                    )
                  }
                />
                <span>{o.name}</span>
                <span>+ {money(o.priceDeltaMinor)}</span>
              </label>
            ))}
          </fieldset>
        ))}
        {forPos && (
          <div className="form-grid">
            <label>
              Seat
              <input
                type="number"
                min={1}
                max={30}
                value={seat}
                onChange={(e) => setSeat(Number(e.target.value))}
              />
            </label>
            <label>
              Course
              <select value={course} onChange={(e) => setCourse(e.target.value)}>
                <option value="STARTER">Starter</option>
                <option value="MAIN">Main</option>
                <option value="DESSERT">Dessert</option>
              </select>
            </label>
          </div>
        )}
      </div>
      {error && (
        <p className="danger-text" role="alert">
          {error}
        </p>
      )}
      <div
        className="form-actions"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Quantity qty={qty} onChange={(n) => setQty(Math.max(1, n))} />
        <button className="btn primary" onClick={add} disabled={!item.isAvailable}>
          <Plus size={17} />
          Add {qty} · {money(unit * qty)}
        </button>
      </div>
    </Modal>
  );
}
export function FoodCard({
  item,
  onAdd,
  children,
}: {
  item: MenuItem;
  onAdd?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <article className={`food-card ${!item.isAvailable ? 'food-unavailable' : ''}`}>
      <div className="food-image">
        <img src={item.image} alt={item.name} loading="lazy" />
        {!item.isAvailable && <span className="image-badge">Currently unavailable</span>}
      </div>
      <div className="food-info">
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        <div className="food-bottom">
          <span className="food-price">{money(item.priceMinor)}</span>
          {children || (
            <button
              className="btn soft small"
              onClick={onAdd}
              disabled={!item.isAvailable}
              aria-label={`Add ${item.name}`}
            >
              <Plus size={17} />
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
export const linePrice = (line: CartLine) =>
  line.qty *
  (line.item.priceMinor +
    line.item.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => line.modifierIds.includes(o.id))
      .reduce((s, o) => s + o.priceDeltaMinor, 0));
export function CartSummary({ checkout = true }: { checkout?: boolean }) {
  const { cart, setCart } = useApp();
  return (
    <aside className="cart-summary">
      <h2>Your good food bag</h2>
      {cart.length ? (
        <>
          {cart.map((line) => (
            <div className="bill-line" key={line.key}>
              <div>
                <strong>{line.item.name}</strong>
                <small>
                  {line.item.modifierGroups
                    .flatMap((g) => g.options)
                    .filter((o) => line.modifierIds.includes(o.id))
                    .map((o) => o.name)
                    .join(', ') || 'Made just for you'}
                </small>
                <div style={{ marginTop: 9 }}>
                  <Quantity
                    qty={line.qty}
                    onChange={(qty) =>
                      setCart(
                        qty <= 0
                          ? cart.filter((c) => c.key !== line.key)
                          : cart.map((c) => (c.key === line.key ? { ...c, qty } : c)),
                      )
                    }
                  />
                </div>
              </div>
              <strong>{money(linePrice(line))}</strong>
            </div>
          ))}
          <div className="bill-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(cart.reduce((s, l) => s + linePrice(l), 0))}</strong>
            </div>
            <p className="form-hint">Taxes and delivery calculated at checkout.</p>
          </div>
          {checkout && (
            <a className="btn primary wide" href="/checkout">
              Continue to checkout
            </a>
          )}
        </>
      ) : (
        <div className="empty">
          <p>A little empty, a lot of possibilities. Add something delicious.</p>
        </div>
      )}
    </aside>
  );
}
