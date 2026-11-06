export function price(
  goodsMinor: number,
  channel: string,
  deliveryFeeMinor: number,
  discountMinor = 0,
  tipMinor = 0,
) {
  if (
    ![goodsMinor, deliveryFeeMinor, discountMinor, tipMinor].every(
      (v) => Number.isSafeInteger(v) && v >= 0,
    )
  )
    throw new Error('Money must be positive integer minor units');
  const discount = Math.min(goodsMinor, discountMinor);
  const taxable = goodsMinor - discount;
  const taxMinor = Math.round(taxable * 0.05);
  const serviceMinor = channel === 'DINE_IN' ? Math.round(taxable * 0.05) : 0;
  const delivery = channel === 'DELIVERY' ? deliveryFeeMinor : 0;
  return {
    goodsMinor,
    discountMinor: discount,
    taxMinor,
    serviceMinor,
    deliveryFeeMinor: delivery,
    tipMinor,
    grandMinor: taxable + taxMinor + serviceMinor + delivery + tipMinor,
  };
}
export function splitBill(total: number, seats: number) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isInteger(seats) ||
    seats < 1 ||
    seats > 30
  )
    throw new Error('Invalid split');
  return Array.from(
    { length: seats },
    (_, i) => Math.floor(total / seats) + (i < total % seats ? 1 : 0),
  );
}
export function allocateMinor(total: number, weights: number[]) {
  const sum = weights.reduce((s, w) => s + w, 0);
  let allocated = 0;
  return weights.map((weight, index) => {
    const amount =
      index === weights.length - 1 ? total - allocated : Math.floor((total * weight) / (sum || 1));
    allocated += amount;
    return amount;
  });
}
