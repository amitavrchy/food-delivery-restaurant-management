import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
const db = new PrismaClient();
const base = process.env.TEST_API_URL || 'http://localhost:4000/api';
const suffix = randomUUID().slice(0, 8),
  rid = `test-${suffix}`;
async function request(path: string, method = 'GET', body?: unknown, cookie = '') {
  const r = await fetch(`${base}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
async function login(email: string, password = process.env.DEMO_PASSWORD || 'Tablelane2026!') {
  const r = await request('auth/login', 'POST', { email, password });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.cookie;
}
test(
  'real API acceptance criteria against PostgreSQL and Redis',
  { timeout: 120000 },
  async (t) => {
    const itemId = `${rid}-item`,
      stationId = `${rid}-grill`,
      ingredientId = `${rid}-stock`,
      optionId = `${rid}-cheese`,
      riders = [`${rid}-rider1`, `${rid}-rider2`];
    let owner = '',
      customer = '',
      rider1 = '',
      rider2 = '',
      deliveryId = '',
      otp = '',
      checkId = '';
    try {
      await db.restaurant.create({
        data: {
          id: rid,
          name: 'Integration kitchen',
          slug: rid,
          cuisine: 'Test',
          description: 'Isolated integration fixture',
          image: '/food/burger.jpg',
          address: 'Road 46, Dhaka',
          lat: 23.7806,
          lng: 90.4168,
        },
      });
      await db.userRestaurantRole.create({
        data: { userId: 'owner', restaurantId: rid, role: 'RESTAURANT_OWNER' },
      });
      await db.prepStation.create({ data: { id: stationId, restaurantId: rid, name: 'Grill' } });
      await db.menuCategory.create({
        data: { id: `${rid}-cat`, restaurantId: rid, name: 'Burgers' },
      });
      await db.inventoryItem.create({
        data: {
          id: ingredientId,
          restaurantId: rid,
          name: 'Cheddar',
          uom: 'pcs',
          qtyOnHand: 100,
          lowStockQty: 5,
          costMinor: 100,
        },
      });
      await db.menuItem.create({
        data: {
          id: itemId,
          restaurantId: rid,
          categoryId: `${rid}-cat`,
          stationId,
          name: 'Test burger',
          description: 'Test',
          image: '/food/burger.jpg',
          priceMinor: 10000,
          recipe: { create: { inventoryItemId: ingredientId, qty: 2 } },
          modifierGroups: {
            create: {
              id: `${rid}-group`,
              name: 'Required extra',
              minSelect: 1,
              maxSelect: 1,
              options: {
                create: {
                  id: optionId,
                  name: 'Cheddar',
                  priceDeltaMinor: 500,
                  inventoryItemId: ingredientId,
                  ingredientQty: 1,
                },
              },
            },
          },
        },
      });
      for (const [index, userId] of riders.entries()) {
        await db.user.create({
          data: {
            id: userId,
            name: `Test rider ${index + 1}`,
            email: `${userId}@test.invalid`,
            passwordHash: await hash('integration-pass', 10),
            role: 'RIDER',
            rider: {
              create: {
                verified: true,
                status: 'ONLINE',
                lat: 23.7806,
                lng: 90.4168,
                lastPingAt: new Date(),
              },
            },
          },
        });
      }
      await db.diningTable.create({
        data: { id: `${rid}-table`, restaurantId: rid, code: 'T01', seats: 3 },
      });
      owner = await login('owner@tablelane.demo');
      customer = await login('customer@tablelane.demo');
      rider1 = await login(`${riders[0]}@test.invalid`, 'integration-pass');
      rider2 = await login(`${riders[1]}@test.invalid`, 'integration-pass');
      const payload = {
        restaurantId: rid,
        channel: 'DELIVERY',
        deliveryAddress: 'House 12, Road 46, Dhaka',
        lines: [{ menuItemId: itemId, qty: 2, modifierIds: [optionId] }],
        idempotencyKey: randomUUID(),
      };
      await t.test('requires authentication and enforces menu modifier boundaries', async () => {
        assert.equal((await request('orders', 'POST', payload)).status, 401);
        assert.equal(
          (
            await request(
              'orders',
              'POST',
              {
                ...payload,
                idempotencyKey: randomUUID(),
                lines: [{ menuItemId: itemId, qty: 1, modifierIds: [] }],
              },
              customer,
            )
          ).status,
          400,
        );
        assert.equal(
          (await request(`restaurants/${rid}`, 'PATCH', { isOnline: false }, customer)).status,
          403,
        );
      });
      await t.test(
        'checkout snapshots price and retries without creating another order',
        async () => {
          const r = await request('orders', 'POST', payload, customer);
          assert.equal(r.status, 201, JSON.stringify(r.data));
          deliveryId = r.data.id;
          otp = r.data.deliveryOtp;
          assert.match(otp, /^\d{6}$/);
          assert.equal(r.data.grandMinor, 26950);
          assert.equal(r.data.otpHash, undefined);
          const retry = await request('orders', 'POST', payload, customer);
          assert.equal(retry.data.id, deliveryId);
          assert.equal(
            await db.order.count({ where: { idempotencyKey: payload.idempotencyKey } }),
            1,
          );
          assert.equal(
            (await request(`orders/${deliveryId}/status`, 'PATCH', { status: 'DELIVERED' }, owner))
              .status,
            403,
          );
        },
      );
      await t.test(
        'KDS is station scoped and BOM including modifier is consumed exactly once',
        async () => {
          assert.equal(
            (await request(`orders/${deliveryId}/status`, 'PATCH', { status: 'ACCEPTED' }, owner))
              .status,
            200,
          );
          const tickets = await request(`kds/${rid}?station=${stationId}`, 'GET', undefined, owner);
          assert.equal(tickets.data.length, 1);
          assert.equal(tickets.data[0].order.otpHash, undefined);
          assert.equal(tickets.data[0].order.deliveryAddress, undefined);
          const ticketId = tickets.data[0].id;
          assert.equal(
            (await request(`kds/${rid}?station=wrong-station`, 'GET', undefined, owner)).data
              .length,
            0,
          );
          assert.equal((await request(`kds/${rid}`, 'GET', undefined, customer)).status, 403);
          assert.equal(
            (await request(`kds/${ticketId}`, 'PATCH', { status: 'COOKING' }, owner)).status,
            200,
          );
          assert.equal(
            (await request(`kds/${ticketId}`, 'PATCH', { status: 'DONE' }, owner)).status,
            200,
          );
          assert.equal(
            Number(
              (await db.inventoryItem.findUniqueOrThrow({ where: { id: ingredientId } })).qtyOnHand,
            ),
            94,
          );
          assert.equal(
            (await request(`kds/${ticketId}`, 'PATCH', { status: 'DONE' }, owner)).status,
            409,
          );
          assert.equal(
            Number(
              (await db.inventoryItem.findUniqueOrThrow({ where: { id: ingredientId } })).qtyOnHand,
            ),
            94,
          );
          assert.equal(
            (await request(`orders/${deliveryId}`, 'GET', undefined, customer)).data.status,
            'READY',
          );
        },
      );
      await t.test(
        'two riders accepting competing offers produces exactly one assignment',
        async () => {
          await db.order.update({ where: { id: deliveryId }, data: { status: 'ASSIGNING_RIDER' } });
          await db.orderStatusHistory.create({
            data: {
              orderId: deliveryId,
              fromStatus: 'READY',
              toStatus: 'ASSIGNING_RIDER',
              byUserId: 'system:test',
            },
          });
          await db.riderOffer.updateMany({
            where: { orderId: deliveryId },
            data: { status: 'EXPIRED' },
          });
          const offers = await Promise.all(
            riders.map((riderId) =>
              db.riderOffer.create({
                data: { orderId: deliveryId, riderId, expiresAt: new Date(Date.now() + 60000) },
              }),
            ),
          );
          const race = await Promise.all(
            offers.map((o, i) =>
              request(`rider/offers/${o.id}/accept`, 'POST', {}, i === 0 ? rider1 : rider2),
            ),
          );
          assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
          const order = await db.order.findUniqueOrThrow({ where: { id: deliveryId } });
          assert.ok(riders.includes(order.riderId!));
          if (order.riderId !== riders[0]) [rider1, rider2] = [rider2, rider1];
        },
      );
      await t.test(
        'socket room authorization and rider ping throttling protect tracking',
        async () => {
          assert.equal(
            (await request(`orders/${deliveryId}`, 'GET', undefined, rider2)).status,
            403,
          );
          const first = await request(
            'rider/location',
            'POST',
            { lat: 23.781, lng: 90.417 },
            rider1,
          );
          const second = await request(
            'rider/location',
            'POST',
            { lat: 23.782, lng: 90.418 },
            rider1,
          );
          assert.equal(first.status, 201);
          assert.equal(second.data.throttled, true);
          const socket = io(base.replace('/api', ''), {
            extraHeaders: { cookie: customer },
            transports: ['websocket'],
          });
          try {
            await new Promise<void>((resolve, reject) => {
              socket.once('connect', () => resolve());
              socket.once('connect_error', reject);
              setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
            });
            const allowed = await socket
              .timeout(3000)
              .emitWithAck('join', { room: `order:${deliveryId}` });
            assert.equal(allowed.ok, true);
            const denied = await socket
              .timeout(3000)
              .emitWithAck('join', { room: `kds:${rid}:${stationId}` });
            assert.equal(denied.ok, false);
            const takeaway = await request(
              'orders',
              'POST',
              { ...payload, channel: 'TAKEAWAY', idempotencyKey: randomUUID() },
              customer,
            );
            assert.equal(takeaway.status, 201);
            await request(
              `orders/${takeaway.data.id}/status`,
              'PATCH',
              { status: 'ACCEPTED' },
              owner,
            );
            const kitchenTicket = await db.kitchenTicket.findFirstOrThrow({
              where: { orderId: takeaway.data.id },
            });
            const update = socket
              .timeout(5000)
              .emitWithAck('join', { room: `order:${takeaway.data.id}` });
            await update;
            const event = new Promise<Record<string, unknown>>((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error('Order event timed out')), 5000);
              socket.once('order.updated', (data) => {
                clearTimeout(timer);
                resolve(data);
              });
            });
            await request(`kds/${kitchenTicket.id}`, 'PATCH', { status: 'COOKING' }, owner);
            const summary = await event;
            assert.deepEqual(Object.keys(summary).sort(), ['id', 'status']);
            assert.equal(summary.status, 'IN_KITCHEN');
            await request(
              `orders/${takeaway.data.id}/status`,
              'PATCH',
              { status: 'CANCELLED', reason: 'Privacy regression cleanup' },
              owner,
            );
          } finally {
            socket.disconnect();
          }
        },
      );
      await t.test(
        'delivery requires the assigned rider and correct OTP and records the full path',
        async () => {
          for (const status of ['PICKED_UP', 'ARRIVING'])
            assert.equal(
              (await request(`orders/${deliveryId}/status`, 'PATCH', { status }, rider1)).status,
              200,
            );
          assert.equal(
            (
              await request(
                `orders/${deliveryId}/status`,
                'PATCH',
                { status: 'DELIVERED', otp: '000000' },
                rider1,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await request(
                `orders/${deliveryId}/status`,
                'PATCH',
                { status: 'DELIVERED', otp },
                rider1,
              )
            ).status,
            200,
          );
          const result = await request(`orders/${deliveryId}`, 'GET', undefined, customer);
          assert.deepEqual(
            result.data.history.map((h: any) => h.toStatus),
            [
              'PLACED',
              'ACCEPTED',
              'IN_KITCHEN',
              'READY',
              'ASSIGNING_RIDER',
              'PICKED_UP',
              'ARRIVING',
              'DELIVERED',
            ],
          );
          assert.equal(
            (
              await request(
                `orders/${deliveryId}/rating`,
                'POST',
                { stars: 5, comment: 'Test' },
                customer,
              )
            ).status,
            201,
          );
        },
      );
      await t.test(
        'pausing delivery leaves dine in open and post-send voids require manager PIN',
        async () => {
          await request(`restaurants/${rid}`, 'PATCH', { isOnline: false }, owner);
          assert.equal(
            (
              await request(
                'orders',
                'POST',
                { ...payload, idempotencyKey: randomUUID() },
                customer,
              )
            ).status,
            409,
          );
          const check = await request(`pos/tables/${rid}-table/open`, 'POST', {}, owner);
          checkId = check.data.id;
          const dine = await request(
            'orders',
            'POST',
            { ...payload, channel: 'DINE_IN', tableCheckId: checkId, idempotencyKey: randomUUID() },
            owner,
          );
          assert.equal(dine.status, 201);
          assert.equal(dine.data.status, 'ACCEPTED');
          assert.equal(
            (
              await request(
                `orders/${dine.data.id}/status`,
                'PATCH',
                { status: 'CANCELLED', reason: 'Test void' },
                owner,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                `orders/${dine.data.id}/status`,
                'PATCH',
                { status: 'CANCELLED', reason: 'Test void', managerPin: process.env.MANAGER_PIN },
                owner,
              )
            ).status,
            200,
          );
        },
      );
      await t.test(
        'POS split shares preserve totals and payments never exceed balance',
        async () => {
          const dine = await request(
            'orders',
            'POST',
            { ...payload, channel: 'DINE_IN', tableCheckId: checkId, idempotencyKey: randomUUID() },
            owner,
          );
          assert.equal(dine.status, 201);
          const ticket = await db.kitchenTicket.findFirstOrThrow({
            where: { orderId: dine.data.id },
          });
          await request(`kds/${ticket.id}`, 'PATCH', { status: 'COOKING' }, owner);
          await request(`kds/${ticket.id}`, 'PATCH', { status: 'DONE' }, owner);
          assert.equal(
            (await request(`orders/${dine.data.id}/status`, 'PATCH', { status: 'SERVED' }, owner))
              .status,
            200,
          );
          const split = await request(`pos/checks/${checkId}/split`, 'GET', undefined, owner);
          assert.equal(
            split.data.equal.reduce((s: number, n: number) => s + n, 0),
            split.data.totalMinor,
          );
          assert.equal(
            split.data.byItem.reduce(
              (s: number, item: { amountMinor: number }) => s + item.amountMinor,
              0,
            ),
            split.data.totalMinor,
          );
          assert.equal(
            (
              await request(
                `pos/checks/${checkId}/pay`,
                'POST',
                {
                  amountMinor: split.data.totalMinor + 1,
                  method: 'CASH',
                  idempotencyKey: randomUUID(),
                },
                owner,
              )
            ).status,
            409,
          );
          const first = Math.floor(split.data.totalMinor / 2);
          for (const amountMinor of [first, split.data.totalMinor - first])
            assert.equal(
              (
                await request(
                  `pos/checks/${checkId}/pay`,
                  'POST',
                  {
                    amountMinor,
                    method: 'CASH',
                    lineId: split.data.byItem[0].lineId,
                    idempotencyKey: randomUUID(),
                  },
                  owner,
                )
              ).status,
              201,
            );
          assert.equal(
            (await db.tableCheck.findUniqueOrThrow({ where: { id: checkId } })).status,
            'CLOSED',
          );
          assert.equal(
            (await db.order.findUniqueOrThrow({ where: { id: dine.data.id } })).status,
            'CLOSED',
          );
        },
      );
      await t.test(
        'manager complimentary checks require PIN and preserve an audit trail',
        async () => {
          const opened = await request(`pos/tables/${rid}-table/open`, 'POST', {}, owner);
          const emptyId = opened.data.id;
          assert.equal(
            (await request(`pos/checks/${emptyId}/close-empty`, 'POST', {}, owner)).status,
            201,
          );
          const check = await request(`pos/tables/${rid}-table/open`, 'POST', {}, owner);
          const dine = await request(
            'orders',
            'POST',
            {
              ...payload,
              channel: 'DINE_IN',
              tableCheckId: check.data.id,
              idempotencyKey: randomUUID(),
            },
            owner,
          );
          assert.equal(dine.status, 201);
          const ticket = await db.kitchenTicket.findFirstOrThrow({
            where: { orderId: dine.data.id },
          });
          await request(`kds/${ticket.id}`, 'PATCH', { status: 'COOKING' }, owner);
          await request(`kds/${ticket.id}`, 'PATCH', { status: 'DONE' }, owner);
          await request(`orders/${dine.data.id}/status`, 'PATCH', { status: 'SERVED' }, owner);
          assert.equal(
            (
              await request(
                `pos/checks/${check.data.id}/complimentary`,
                'POST',
                { managerPin: 'wrong', reason: 'Service recovery' },
                owner,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                `pos/checks/${check.data.id}/complimentary`,
                'POST',
                { managerPin: process.env.MANAGER_PIN, reason: 'Service recovery' },
                owner,
              )
            ).status,
            201,
          );
          const order = await db.order.findUniqueOrThrow({ where: { id: dine.data.id } });
          assert.equal(order.status, 'CLOSED');
          assert.equal(order.grandMinor, 0);
          assert.equal(
            await db.auditLog.count({
              where: { entityId: check.data.id, action: 'COMPLIMENTARY_CHECK' },
            }),
            1,
          );
          await db.auditLog.deleteMany({ where: { entityId: check.data.id } });
        },
      );
      await t.test('delivery code recovery and operational editors remain scoped', async () => {
        await request(`restaurants/${rid}`, 'PATCH', { isOnline: true }, owner);
        const order = await request(
          'orders',
          'POST',
          { ...payload, idempotencyKey: randomUUID() },
          customer,
        );
        assert.equal(order.status, 201);
        const code = await request(`orders/${order.data.id}/delivery-code`, 'POST', {}, customer);
        assert.equal(code.status, 201);
        assert.match(code.data.deliveryOtp, /^\d{6}$/);
        assert.equal(
          (await request(`orders/${order.data.id}/delivery-code`, 'POST', {}, rider1)).status,
          404,
        );
        await request(
          `orders/${order.data.id}/status`,
          'PATCH',
          { status: 'CANCELLED', reason: 'Test complete' },
          customer,
        );
        const ingredient = await request(
          `inventory/restaurant/${rid}`,
          'POST',
          { name: 'Extra tomato', uom: 'kg', qtyOnHand: 10, lowStockQty: 2, costMinor: 15000 },
          owner,
        );
        assert.equal(ingredient.status, 201);
        assert.equal(
          (await request(`inventory/${ingredient.data.id}`, 'PATCH', { lowStockQty: 3 }, customer))
            .status,
          403,
        );
        const groups = [
          {
            name: 'Choose your topping',
            minSelect: 1,
            maxSelect: 1,
            options: [
              {
                name: 'Tomato',
                priceDeltaMinor: 100,
                inventoryItemId: ingredient.data.id,
                ingredientQty: 0.05,
              },
            ],
          },
        ];
        assert.equal(
          (await request(`menu/${itemId}/modifiers`, 'PUT', { groups }, owner)).status,
          200,
        );
        const menu = await request(`restaurants/${rid}/menu`);
        assert.equal(menu.data.items[0].modifierGroups[0].name, 'Choose your topping');
        assert.equal(
          (await request(`menu/${itemId}/modifiers`, 'PUT', { groups }, customer)).status,
          403,
        );
      });
    } finally {
      const orderIds = (
        await db.order.findMany({ where: { restaurantId: rid }, select: { id: true } })
      ).map((o) => o.id);
      await db.rating.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.riderOffer.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.kitchenTicket.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.order.deleteMany({ where: { restaurantId: rid } });
      await db.checkPayment.deleteMany({ where: { check: { table: { restaurantId: rid } } } });
      await db.tableCheck.deleteMany({ where: { table: { restaurantId: rid } } });
      await db.diningTable.deleteMany({ where: { restaurantId: rid } });
      await db.stockMovement.deleteMany({ where: { item: { restaurantId: rid } } });
      await db.recipeComponent.deleteMany({ where: { item: { restaurantId: rid } } });
      await db.modifierOption.deleteMany({ where: { group: { item: { restaurantId: rid } } } });
      await db.modifierGroup.deleteMany({ where: { item: { restaurantId: rid } } });
      await db.menuItem.deleteMany({ where: { restaurantId: rid } });
      await db.inventoryItem.deleteMany({ where: { restaurantId: rid } });
      await db.prepStation.deleteMany({ where: { restaurantId: rid } });
      await db.menuCategory.deleteMany({ where: { restaurantId: rid } });
      await db.userRestaurantRole.deleteMany({ where: { restaurantId: rid } });
      await db.restaurant.deleteMany({ where: { id: rid } });
      await db.riderLocationPing.deleteMany({ where: { riderId: { in: riders } } });
      await db.riderProfile.deleteMany({ where: { userId: { in: riders } } });
      await db.user.deleteMany({ where: { id: { in: riders } } });
      await db.$disconnect();
    }
  },
);
