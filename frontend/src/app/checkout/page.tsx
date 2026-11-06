'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Banknote, MapPin, ShieldCheck, ShoppingBag } from 'lucide-react';
import { Access, CustomerShell } from '@/components/shell';
import { CartSummary, linePrice } from '@/components/product';
import { Empty, PageHeading } from '@/components/ui';
import { useApp } from '@/components/provider';
import { money, post, uuid } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { toIso, type Address, type Loyalty, type Promotion } from '@/lib/advanced';
import type { Order } from '@/lib/types';
export default function Checkout() {
  const { cart, setCart, restaurants, user, notify } = useApp();
  const { run, busy } = useAction();
  const router = useRouter();
  const [channel, setChannel] = useState('DELIVERY'),
    [address, setAddress] = useState(''),
    [notes, setNotes] = useState(''),
    [promo, setPromo] = useState(''),
    [tip, setTip] = useState(0),
    [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [phone, setPhone] = useState(''),
    [timing, setTiming] = useState('NOW'),
    [scheduledFor, setScheduledFor] = useState(''),
    [redeemPoints, setRedeemPoints] = useState(0),
    [paymentMethod, setPaymentMethod] = useState('CASH');
  const { data: addresses } = useResource<Address[]>(user ? 'account/addresses' : null);
  const { data: loyalty } = useResource<Loyalty>(user ? 'account/loyalty' : null);
  const { data: card } = useResource<{ enabled: boolean; mode: string }>('payments/stripe/config');
  const { data: promotions } = useResource<Promotion[]>(
    cart[0] ? `promotions?restaurantId=${cart[0].item.restaurantId}` : null,
  );
  useEffect(() => {
    const primary = addresses?.find((a) => a.isDefault);
    if (primary && !address) {
      setAddress(primary.address);
      setPhone(primary.phone);
      if (primary.lat != null && primary.lng != null)
        setPosition({ lat: primary.lat, lng: primary.lng });
    }
  }, [addresses, address]);
  const key = useRef<string | null>(null);
  const restaurant = restaurants.find((r) => r.id === cart[0]?.item.restaurantId);
  const goods = cart.reduce((s, l) => s + linePrice(l), 0);
  const fee = channel === 'DELIVERY' ? restaurant?.deliveryFeeMinor || 0 : 0;
  const rewardMinor = redeemPoints * 100;
  const tax = Math.round((Math.max(0, goods - rewardMinor) * (restaurant?.taxBps ?? 500)) / 10000);
  const total = Math.max(0, goods - rewardMinor) + fee + tax + Math.round(tip * 100);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cart.length) return;
    key.current ||= uuid();
    const order = await run(() =>
      post<Order>('orders', {
        restaurantId: cart[0].item.restaurantId,
        channel,
        lines: cart.map((l) => ({ menuItemId: l.item.id, qty: l.qty, modifierIds: l.modifierIds })),
        deliveryAddress: channel === 'DELIVERY' ? address : undefined,
        deliveryPhone: channel === 'DELIVERY' ? phone : undefined,
        scheduledFor: timing === 'LATER' ? toIso(scheduledFor) : undefined,
        redeemPoints,
        dropLat: position?.lat,
        dropLng: position?.lng,
        promoCode: promo || undefined,
        tipMinor: Math.round(tip * 100),
        notes,
        paymentMethod:
          paymentMethod === 'STRIPE' ? 'STRIPE' : channel === 'DELIVERY' ? 'COD' : 'COUNTER',
        idempotencyKey: key.current!,
      }),
    );
    if (order) {
      if (order.deliveryOtp) sessionStorage.setItem(`otp:${order.id}`, order.deliveryOtp);
      if (paymentMethod === 'STRIPE') {
        const session = await run(() =>
          post<{ url: string }>('payments/stripe/session', { orderId: order.id }),
        );
        if (session) {
          setCart([]);
          window.location.assign(session.url);
        }
        return;
      }
      setCart([]);
      router.push(`/orders/${order.id}?placed=1`);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      notify('Geolocation is unavailable. Your written address will be used.', true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        notify('Delivery coordinates attached.');
      },
      () => notify('Location unavailable. Please enter your complete address.', true),
    );
  }
  return (
    <CustomerShell>
      <Access>
        <Link href={restaurant ? `/restaurants/${restaurant.id}` : '/'} className="text-link">
          <ArrowLeft size={17} />
          Back to the menu
        </Link>
        <div style={{ marginTop: 25 }}>
          <PageHeading
            title="Good food, almost yours."
            description="A few details, then we’ll take care of the rest."
          />
        </div>
        {!cart.length ? (
          <Empty title="Your bag is waiting for something good">
            <Link href="/" className="btn primary">
              Explore restaurants
            </Link>
          </Empty>
        ) : (
          <form onSubmit={submit}>
            <div className="checkout-layout">
              <div>
                <section className="panel checkout-section">
                  <h2>
                    <span className="step-number">1</span>How would you like it?
                  </h2>
                  <div className="radio-cards">
                    {['DELIVERY', 'TAKEAWAY'].map((c) => (
                      <label className="radio-card" key={c}>
                        <input
                          type="radio"
                          name="channel"
                          value={c}
                          checked={channel === c}
                          onChange={() => setChannel(c)}
                        />
                        {c === 'DELIVERY' ? (
                          <>
                            <MapPin size={20} />
                            Bring it to me
                          </>
                        ) : (
                          <>
                            <ShoppingBag size={20} />
                            I’ll pick it up
                          </>
                        )}
                      </label>
                    ))}
                  </div>
                  {channel === 'DELIVERY' ? (
                    <div className="form-stack section-gap">
                      {!!addresses?.length && (
                        <label>
                          Use a saved address
                          <select
                            aria-label="Saved delivery address"
                            defaultValue=""
                            onChange={(e) => {
                              const saved = addresses.find((a) => a.id === e.target.value);
                              if (saved) {
                                setAddress(saved.address);
                                setPhone(saved.phone);
                                setPosition(
                                  saved.lat != null && saved.lng != null
                                    ? { lat: saved.lat, lng: saved.lng }
                                    : null,
                                );
                              }
                            }}
                          >
                            <option value="">Choose a saved place</option>
                            {addresses.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label} · {a.address}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        Delivery address
                        <textarea
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          required
                          minLength={8}
                          maxLength={500}
                          placeholder="House, road, area and a helpful landmark…"
                        />
                      </label>
                      <label>
                        Delivery contact number
                        <input
                          type="tel"
                          value={phone}
                          required
                          minLength={7}
                          maxLength={25}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Phone number for this delivery"
                        />
                      </label>
                      <button type="button" className="text-link" onClick={locate}>
                        <MapPin size={17} />
                        {position ? 'Location attached — update' : 'Attach my current location'}
                      </button>
                    </div>
                  ) : (
                    <div className="note-box section-gap">
                      Pick up from <strong>{restaurant?.name}</strong>
                      <p>{restaurant?.address}</p>
                    </div>
                  )}
                </section>
                <section className="panel checkout-section">
                  <h2>
                    <span className="step-number">2</span>Your meal, on your time
                  </h2>
                  <div className="radio-cards">
                    <label className="radio-card">
                      <input
                        type="radio"
                        name="timing"
                        checked={timing === 'NOW'}
                        onChange={() => setTiming('NOW')}
                      />
                      As soon as it’s ready
                    </label>
                    <label className="radio-card">
                      <input
                        type="radio"
                        name="timing"
                        checked={timing === 'LATER'}
                        onChange={() => setTiming('LATER')}
                      />
                      Schedule for later
                    </label>
                  </div>
                  {timing === 'LATER' && (
                    <label className="section-gap">
                      Requested arrival / pickup time
                      <input
                        type="datetime-local"
                        required
                        value={scheduledFor}
                        onChange={(e) => setScheduledFor(e.target.value)}
                      />
                      <span className="form-hint">
                        Your local time · 30 minutes to seven days ahead. The kitchen starts close
                        to your requested time.
                      </span>
                    </label>
                  )}
                </section>
                <section className="panel checkout-section">
                  <h2>
                    <span className="step-number">3</span>A little personal touch
                  </h2>
                  {!!promotions?.length && (
                    <div className="promotion-strip">
                      {promotions.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          className="filter-pill"
                          onClick={() => setPromo(p.code)}
                        >
                          <strong>{p.code}</strong>
                          <span>
                            {p.type === 'PERCENT' ? `${p.value}% off` : `${money(p.value)} off`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="form-stack">
                    <label>
                      Kitchen notes{' '}
                      <span className="form-hint">Optional · Allergies or special requests</span>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        maxLength={500}
                        placeholder="Anything we should know?"
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Promo code
                        <input
                          value={promo}
                          onChange={(e) => setPromo(e.target.value.toUpperCase())}
                          maxLength={30}
                          placeholder="Try HELLO15"
                        />
                        <span className="form-hint">
                          Applied and verified when you place your order.
                        </span>
                      </label>
                      <label>
                        A thank-you tip (৳)
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          step="0.01"
                          value={tip}
                          onChange={(e) => setTip(Number(e.target.value))}
                        />
                        <span className="form-hint">100% goes to your rider.</span>
                      </label>
                    </div>
                    {!!loyalty?.points && restaurant?.loyaltyEnabled && (
                      <label>
                        Use reward points
                        <input
                          type="number"
                          min={0}
                          max={Math.min(loyalty.points, Math.floor(goods / 100))}
                          step={1}
                          value={redeemPoints}
                          onChange={(e) => setRedeemPoints(Number(e.target.value))}
                        />
                        <span className="form-hint">
                          {loyalty.points} points available · 1 point = ৳1 food discount. Final
                          eligibility is checked with your promo.
                        </span>
                      </label>
                    )}
                  </div>
                </section>
                <section className="panel checkout-section">
                  <h2>
                    <span className="step-number">4</span>Pay your way
                  </h2>
                  <label className="radio-card">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentMethod === 'CASH'}
                      onChange={() => setPaymentMethod('CASH')}
                    />
                    <Banknote size={24} />
                    <div>
                      <strong>
                        {channel === 'DELIVERY' ? 'Cash on delivery' : 'Pay at the restaurant'}
                      </strong>
                      <p className="form-hint">
                        {channel === 'DELIVERY'
                          ? 'Pay your rider when your meal arrives.'
                          : 'Pay when you collect your takeaway.'}
                      </p>
                    </div>
                    <ShieldCheck size={22} style={{ marginLeft: 'auto', color: 'var(--green)' }} />
                  </label>
                  {card?.enabled && (
                    <label className="radio-card section-gap">
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentMethod === 'STRIPE'}
                        onChange={() => setPaymentMethod('STRIPE')}
                      />
                      <ShieldCheck size={24} />
                      <div>
                        <strong>Secure card checkout</strong>
                        <p className="form-hint">
                          Stripe hosted checkout ·{' '}
                          {card.mode === 'test' ? 'Test mode' : 'Live card payment'}. The kitchen
                          waits for verified payment.
                        </p>
                      </div>
                    </label>
                  )}
                </section>
              </div>
              <aside>
                <CartSummary checkout={false} />
                <div className="cart-summary section-gap">
                  <h2>Order summary</h2>
                  <p className="muted">From {restaurant?.name}</p>
                  <div className="bill-totals">
                    <div>
                      <span>Food subtotal</span>
                      <strong>{money(goods)}</strong>
                    </div>
                    <div>
                      <span>VAT ({(restaurant?.taxBps ?? 500) / 100}%)</span>
                      <span>{money(tax)}</span>
                    </div>
                    {redeemPoints > 0 && (
                      <div>
                        <span>Rewards applied</span>
                        <span className="green-text">−{money(rewardMinor)}</span>
                      </div>
                    )}
                    <div>
                      <span>Delivery</span>
                      <span>{fee ? money(fee) : 'No delivery fee'}</span>
                    </div>
                    {tip > 0 && (
                      <div>
                        <span>Rider tip</span>
                        <span>{money(Math.round(tip * 100))}</span>
                      </div>
                    )}
                    <div className="total">
                      <span>{promo ? 'Total before promo' : 'Total'}</span>
                      <strong>{money(total)}</strong>
                    </div>
                  </div>
                  <button className="btn primary wide" disabled={busy || !user}>
                    {busy ? 'Sending to the kitchen…' : 'Place my order'}
                    <ArrowRight size={18} />
                  </button>
                  <p className="form-hint" style={{ marginTop: 13, textAlign: 'center' }}>
                    Your order is confirmed at the server’s current prices. Promo savings appear on
                    confirmation.
                  </p>
                </div>
              </aside>
            </div>
          </form>
        )}
      </Access>
    </CustomerShell>
  );
}
