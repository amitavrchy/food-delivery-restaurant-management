'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock3, MapPin, Search, Truck } from 'lucide-react';
import { CustomerShell } from '@/components/shell';
import { useResource, useAction } from '@/lib/hooks';
import { Empty, ErrorState, Loading, Modal } from '@/components/ui';
import { CartSummary, FoodCard, ProductModal } from '@/components/product';
import { useApp } from '@/components/provider';
import { money, api, post } from '@/lib/api';
import type { CartLine, MenuItem, Restaurant } from '@/lib/types';
export default function RestaurantMenu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading } = useResource<Restaurant>(`restaurants/${id}/menu`);
  const [category, setCategory] = useState('all'),
    [diet, setDiet] = useState('all'),
    [query, setQuery] = useState(''),
    [product, setProduct] = useState<MenuItem | null>(null),
    [replace, setReplace] = useState<CartLine | null>(null);
  const { cart, setCart, notify, user } = useApp();
  const { data: favorites } = useResource<{ restaurantId: string }[]>(
    user ? 'account/favorites' : null,
  );
  const saved = favorites?.some((f) => f.restaurantId === id);
  const { run, busy } = useAction();
  function add(line: CartLine) {
    if (cart.length && cart[0].item.restaurantId !== id) {
      setReplace(line);
      return;
    }
    setCart([...cart, line]);
    notify('A little deliciousness added to your bag.');
  }
  return (
    <CustomerShell>
      <Link className="text-link" href="/">
        <ArrowLeft size={17} />
        All restaurants
      </Link>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        data && (
          <>
            <div className="restaurant-header">
              <img src={data.image} alt={data.name} />
              <div>
                <div className="eyebrow">{data.cuisine}</div>
                <h1>{data.name}</h1>
                <p>{data.description}</p>
                <div className="inline-fields section-gap">
                  <button
                    className="btn secondary"
                    disabled={busy || !user}
                    onClick={() =>
                      void run(
                        () =>
                          saved
                            ? api(`account/favorites/${id}`, { method: 'DELETE' })
                            : post(`account/favorites/${id}`),
                        saved ? 'Restaurant removed from favorites.' : 'Restaurant saved.',
                      )
                    }
                  >
                    {saved ? 'Saved to favorites' : 'Save restaurant'}
                  </button>
                  <Link className="btn soft" href="/account?tab=reservations">
                    Reserve a table
                  </Link>
                </div>
                <div className="restaurant-meta">
                  <span>
                    <Clock3 size={16} />
                    15–35 min
                  </span>
                  <span>
                    <Truck size={16} />
                    {money(data.deliveryFeeMinor)} delivery
                  </span>
                  <span>
                    <MapPin size={16} />
                    {data.address}
                  </span>
                </div>
              </div>
            </div>
            {!data.isOnline && (
              <div className="pill-note">
                Delivery is taking a little break. Takeaway is still available.
              </div>
            )}
            <div className="menu-customer-layout">
              <div>
                <div className="toolbar">
                  <div className="tabs">
                    {[{ id: 'all', name: 'All items' }, ...(data.categories || [])].map((c) => (
                      <button
                        className={category === c.id ? 'active' : ''}
                        key={c.id}
                        onClick={() => setCategory(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search menu"
                      placeholder="Find your favourite…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="menu-grid">
                  <label className="form-full">
                    Dietary preference
                    <select value={diet} onChange={(e) => setDiet(e.target.value)}>
                      <option value="all">All dishes</option>
                      {Array.from(new Set(data.items?.flatMap((i) => i.dietaryTags || []))).map(
                        (tag) => (
                          <option key={tag}>{tag}</option>
                        ),
                      )}
                    </select>
                  </label>
                  {data.items
                    ?.filter(
                      (i) =>
                        (category === 'all' || i.categoryId === category) &&
                        i.name.toLowerCase().includes(query.toLowerCase()) &&
                        (diet === 'all' || !!i.dietaryTags?.includes(diet)),
                    )
                    .map((item) => (
                      <FoodCard key={item.id} item={item} onAdd={() => setProduct(item)} />
                    ))}
                </div>
                {!data.items?.filter(
                  (i) =>
                    (category === 'all' || i.categoryId === category) &&
                    i.name.toLowerCase().includes(query.toLowerCase()) &&
                    (diet === 'all' || !!i.dietaryTags?.includes(diet)),
                ).length && (
                  <Empty title="No dishes found">Try a different search or category.</Empty>
                )}
              </div>
              <CartSummary />
            </div>
          </>
        )
      )}
      {product && <ProductModal item={product} onClose={() => setProduct(null)} onAdd={add} />}
      {replace && (
        <Modal title="A fresh bag for a new kitchen?" onClose={() => setReplace(null)}>
          <p className="muted">
            Each order comes from one restaurant. Starting this bag will clear the items from your
            previous kitchen.
          </p>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setReplace(null)}>
              Keep my bag
            </button>
            <button
              className="btn primary"
              onClick={() => {
                setCart([replace]);
                setReplace(null);
              }}
            >
              Start a new bag
            </button>
          </div>
        </Modal>
      )}
    </CustomerShell>
  );
}
