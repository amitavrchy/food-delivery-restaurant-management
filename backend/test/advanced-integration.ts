import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient(),
  base = process.env.TEST_API_URL || 'http://localhost:4000/api';
async function request(path: string, cookie: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}/${path}`, {
    method,
    headers: { cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
test(
  'advanced operations preserve tenant boundaries and transaction invariants',
  { timeout: 60000 },
  async (t) => {
    const prefix = `advanced-${randomUUID().slice(0, 8)}`,
      rid = prefix,
      stock = `${prefix}-stock`,
      table = `${prefix}-table`;
    let owner = '',
      customer = '';
    try {
      await db.restaurant.create({
        data: {
          id: rid,
          name: 'Advanced acceptance fixture',
          slug: rid,
          cuisine: 'Test',
          description: 'Isolated fixture',
          image: '/food/burger.jpg',
          address: 'Road 46, Dhaka',
          lat: 23.78,
          lng: 90.41,
        },
      });
      await db.userRestaurantRole.create({
        data: { userId: 'owner', restaurantId: rid, role: 'RESTAURANT_OWNER' },
      });
      await db.diningTable.create({ data: { id: table, restaurantId: rid, code: 'A1', seats: 4 } });
      await db.inventoryItem.create({
        data: {
          id: stock,
          restaurantId: rid,
          name: 'Fixture stock',
          uom: 'pcs',
          qtyOnHand: 10,
          lowStockQty: 1,
          costMinor: 100,
        },
      });
      for (const [email, key] of [
        ['owner@tablelane.demo', 'owner'],
        ['customer@tablelane.demo', 'customer'],
      ]) {
        const r = await request('auth/login', '', 'POST', {
          email,
          password: process.env.DEMO_PASSWORD || 'Tablelane2026!',
        });
        assert.equal(r.status, 201, JSON.stringify(r.data));
        if (key === 'owner') owner = r.cookie;
        else customer = r.cookie;
      }
      await t.test(
        'customer cannot inspect procurement, workforce, insights or dispatch',
        async () => {
          for (const path of [
            `procurement/${rid}`,
            `enterprise/${rid}/team`,
            `enterprise/${rid}/insights`,
            `enterprise/${rid}/dispatch`,
          ]) {
            const r = await request(path, customer);
            assert.ok([403, 404].includes(r.status), `${path}: ${JSON.stringify(r)}`);
          }
        },
      );
      await t.test(
        'concurrent reservations allocate a table once and protect its status',
        async () => {
          const body = {
            restaurantId: rid,
            guestName: 'Test guest',
            phone: '01700000001',
            partySize: 4,
            startsAt: new Date(Date.now() + 86400000).toISOString(),
          };
          const results = await Promise.all([
            request('hospitality/reservations', customer, 'POST', body),
            request('hospitality/reservations', customer, 'POST', body),
          ]);
          assert.equal(results.filter((r) => r.status === 201).length, 1, JSON.stringify(results));
          assert.equal(results.filter((r) => r.status === 409).length, 1, JSON.stringify(results));
          const booking = results.find((r) => r.status === 201)!.data;
          const seat = await request(`hospitality/reservations/${booking.id}`, customer, 'PATCH', {
            status: 'SEATED',
          });
          assert.equal(seat.status, 403);
          assert.equal(
            (
              await request(`hospitality/reservations/${booking.id}`, customer, 'PATCH', {
                status: 'CANCELLED',
              })
            ).status,
            200,
          );
        },
      );
      await t.test('partial stock receipts are idempotent and reject over delivery', async () => {
        let r = await request(`procurement/${rid}/suppliers`, owner, 'POST', {
          name: 'Fixture supplier',
          phone: '01700000001',
        });
        assert.equal(r.status, 201, JSON.stringify(r.data));
        const supplierId = r.data.id;
        r = await request(`procurement/${rid}/orders`, owner, 'POST', {
          supplierId,
          lines: [{ inventoryItemId: stock, orderedQty: 5, unitCostMinor: 200 }],
        });
        assert.equal(r.status, 201);
        const order = await db.purchaseOrder.findUniqueOrThrow({
          where: { id: r.data.id },
          include: { lines: true },
        });
        assert.equal(
          (await request(`procurement/orders/${order.id}`, owner, 'PATCH', { status: 'ORDERED' }))
            .status,
          200,
        );
        const body = {
          idempotencyKey: randomUUID(),
          invoiceReference: 'INV-acceptance',
          lines: [{ lineId: order.lines[0].id, qty: 2 }],
        };
        const receipts = await Promise.all([
          request(`procurement/orders/${order.id}/receive`, owner, 'POST', body),
          request(`procurement/orders/${order.id}/receive`, owner, 'POST', body),
        ]);
        assert.ok(
          receipts.every((r) => r.status === 201),
          JSON.stringify(receipts),
        );
        assert.equal(
          (await db.inventoryItem.findUniqueOrThrow({ where: { id: stock } })).qtyOnHand.toNumber(),
          12,
        );
        r = await request(`procurement/orders/${order.id}/receive`, owner, 'POST', {
          ...body,
          idempotencyKey: randomUUID(),
          lines: [{ lineId: order.lines[0].id, qty: 4 }],
        });
        assert.equal(r.status, 409);
        assert.equal(
          (await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
          'PARTIAL',
        );
      });
      await t.test(
        'planned shifts cannot overlap and customers cannot schedule staff',
        async () => {
          const body = {
            userId: 'owner',
            role: 'RESTAURANT_OWNER',
            startsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
            endsAt: new Date(Date.now() + 30 * 86400000 + 3600000).toISOString(),
          };
          assert.equal(
            (await request(`enterprise/${rid}/shifts`, customer, 'POST', body)).status,
            403,
          );
          const results = await Promise.all([
            request(`enterprise/${rid}/shifts`, owner, 'POST', body),
            request(`enterprise/${rid}/shifts`, owner, 'POST', body),
          ]);
          assert.equal(results.filter((r) => r.status === 201).length, 1, JSON.stringify(results));
          assert.equal(results.filter((r) => r.status === 409).length, 1, JSON.stringify(results));
        },
      );
      await t.test('invitation is email bound and raw tokens are never listed', async () => {
        const r = await request(`enterprise/${rid}/invites`, owner, 'POST', {
          email: `${prefix}@example.com`,
          role: 'WAITER',
        });
        assert.equal(r.status, 201);
        const token = new URL(r.data.inviteUrl).searchParams.get('token');
        assert.equal(
          (await request('enterprise/invites/accept', customer, 'POST', { token })).status,
          403,
        );
        const team = await request(`enterprise/${rid}/team`, owner);
        assert.equal(team.status, 200);
        assert.ok(!JSON.stringify(team.data).includes(String(token)));
        assert.ok(!JSON.stringify(team.data).includes('tokenHash'));
      });
      await t.test('saved address is private, removable only by its owner', async () => {
        const r = await request('account/addresses', customer, 'POST', {
          label: prefix,
          address: 'House 12, Road 46, Dhaka',
          phone: '01700000001',
        });
        assert.equal(r.status, 201);
        assert.equal(
          (await request(`account/addresses/${r.data.id}`, owner, 'DELETE')).status,
          404,
        );
        assert.equal(
          (await request(`account/addresses/${r.data.id}`, customer, 'DELETE')).status,
          200,
        );
      });
      await t.test('unconfigured Stripe does not pretend to charge cards', async () => {
        const r = await request('payments/stripe/config', customer);
        assert.equal(r.status, 200);
        if (!r.data.enabled) {
          assert.equal(
            (await request('payments/stripe/session', customer, 'POST', { orderId: randomUUID() }))
              .status,
            503,
          );
        }
      });
    } finally {
      await db.notification.deleteMany({
        where: {
          OR: [
            { body: { contains: 'Test guest' } },
            { userId: 'customer', kind: 'RESERVATION', body: { contains: '4 guests' } },
          ],
        },
      });
      await db.reservation.deleteMany({ where: { restaurantId: rid } });
      await db.scheduledShift.deleteMany({ where: { restaurantId: rid } });
      await db.staffInvite.deleteMany({ where: { restaurantId: rid } });
      await db.stockReceipt.deleteMany({ where: { order: { restaurantId: rid } } });
      await db.purchaseOrderLine.deleteMany({ where: { order: { restaurantId: rid } } });
      await db.purchaseOrder.deleteMany({ where: { restaurantId: rid } });
      await db.supplier.deleteMany({ where: { restaurantId: rid } });
      await db.stockMovement.deleteMany({ where: { item: { restaurantId: rid } } });
      await db.inventoryItem.deleteMany({ where: { restaurantId: rid } });
      await db.diningTable.deleteMany({ where: { restaurantId: rid } });
      await db.userRestaurantRole.deleteMany({ where: { restaurantId: rid } });
      await db.restaurant.deleteMany({ where: { id: rid } });
      await db.customerAddress.deleteMany({ where: { label: prefix } });
      await db.$disconnect();
    }
  },
);
