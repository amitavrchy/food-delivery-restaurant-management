import { PrismaClient } from '@prisma/client';
export async function seedAdvanced(db: PrismaClient) {
  await db.organization.upsert({
    where: { id: 'tablelane-collective' },
    create: { id: 'tablelane-collective', name: 'Tablelane Collective', ownerId: 'owner' },
    update: {},
  });
  await db.restaurant.updateMany({
    where: { id: { in: ['green-fork', 'ember-kitchen'] }, organizationId: null },
    data: { organizationId: 'tablelane-collective' },
  });
  for (const restaurantId of ['green-fork', 'ember-kitchen']) {
    await db.supplier.upsert({
      where: { id: `${restaurantId}-supplier` },
      create: {
        id: `${restaurantId}-supplier`,
        restaurantId,
        name: 'Farm & Field Supply',
        phone: '01700000001',
        email: 'orders@farm-field.example',
        leadDays: 2,
      },
      update: {},
    });
    await db.purchaseOrder.upsert({
      where: { id: `${restaurantId}-purchase-demo` },
      create: {
        id: `${restaurantId}-purchase-demo`,
        restaurantId,
        supplierId: `${restaurantId}-supplier`,
        status: 'ORDERED',
        createdById: 'owner',
        expectedAt: new Date(Date.now() + 86400000),
        notes: 'Weekly pantry replenishment — sample purchase order',
        lines: {
          create: [
            { inventoryItemId: `${restaurantId}-rice`, orderedQty: 20, unitCostMinor: 14000 },
            { inventoryItemId: `${restaurantId}-buns`, orderedQty: 40, unitCostMinor: 4500 },
          ],
        },
      },
      update: {},
    });
    await db.reservation.upsert({
      where: { id: `${restaurantId}-reservation-demo` },
      create: {
        id: `${restaurantId}-reservation-demo`,
        restaurantId,
        userId: 'customer',
        tableId: `${restaurantId}-table-7`,
        guestName: 'Amitav Chowdhury',
        phone: '01700000002',
        partySize: 4,
        startsAt: new Date(Date.now() + 45 * 60000),
        endsAt: new Date(Date.now() + 135 * 60000),
        notes: 'Sample birthday dinner reservation',
      },
      update: {},
    });
    await db.waitlistEntry.upsert({
      where: { id: `${restaurantId}-waitlist-demo` },
      create: {
        id: `${restaurantId}-waitlist-demo`,
        restaurantId,
        guestName: 'Sabrina Ahmed',
        phone: '01700000003',
        partySize: 3,
        quotedMinutes: 20,
        notes: 'Window table preferred',
      },
      update: {},
    });
    await db.scheduledShift.upsert({
      where: { id: `${restaurantId}-shift-demo` },
      create: {
        id: `${restaurantId}-shift-demo`,
        restaurantId,
        userId: restaurantId === 'green-fork' ? 'kitchen' : 'manager',
        role: restaurantId === 'green-fork' ? 'KITCHEN' : 'MANAGER',
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 86400000 + 8 * 3600000),
        hourlyRateMinor: 15000,
        notes: 'Sample next-day kitchen service',
      },
      update: {},
    });
    for (const [index, tags, allergens, kcal] of [
      [0, ['HIGH_PROTEIN'], ['Gluten', 'Milk'], 680],
      [1, ['HIGH_PROTEIN'], ['Gluten', 'Egg'], 610],
      [2, ['VEGETARIAN'], ['Gluten', 'Milk'], 490],
      [3, ['HIGH_PROTEIN'], [], 520],
      [5, ['VEGAN', 'VEGETARIAN'], [], 280],
      [6, ['VEGAN'], [], 350],
    ] as const) {
      const item = await db.menuItem.findUnique({ where: { id: `${restaurantId}-item-${index}` } });
      if (item && item.dietaryTags.length === 0)
        await db.menuItem.update({
          where: { id: item.id },
          data: {
            dietaryTags: [...tags],
            allergens: [...allergens],
            energyKcal: kcal,
            featured: index === 0 || index === 3,
          },
        });
    }
  }
  const history = await db.order.findMany({
    where: {
      idempotencyKey: { startsWith: 'seed-' },
      status: { in: ['DELIVERED', 'COMPLETED', 'CLOSED'] },
    },
  });
  for (const order of history) {
    const points = Math.floor((order.goodsMinor - order.discountMinor) / 10000);
    if (points > 0)
      await db.loyaltyEntry.upsert({
        where: { orderId_kind: { orderId: order.id, kind: 'EARN' } },
        create: {
          userId: order.customerId,
          orderId: order.id,
          kind: 'EARN',
          points,
          reason: 'Completed demo meal reward',
        },
        update: {},
      });
  }
  await db.customerAddress.upsert({
    where: { id: 'customer-demo-home' },
    create: {
      id: 'customer-demo-home',
      userId: 'customer',
      label: 'Home',
      address: 'House 12, Road 46, Gulshan 2, Dhaka',
      phone: '01700000002',
      lat: 23.782,
      lng: 90.415,
      isDefault: true,
    },
    update: {},
  });
  await db.favoriteRestaurant.upsert({
    where: { userId_restaurantId: { userId: 'customer', restaurantId: 'green-fork' } },
    create: { userId: 'customer', restaurantId: 'green-fork' },
    update: {},
  });
  await db.promoCode.update({
    where: { code: 'HELLO15' },
    data: { maxPerCustomer: 1000, maxRedemptions: 100000 },
  });
  await db.notification.upsert({
    where: { id: 'demo-customer-welcome' },
    create: {
      id: 'demo-customer-welcome',
      userId: 'customer',
      kind: 'LOYALTY',
      title: 'Welcome to Tablelane rewards',
      body: 'Your completed demo meals have earned points. Save favorites, reserve a table and redeem rewards at checkout.',
      href: '/account',
    },
    update: {},
  });
}
