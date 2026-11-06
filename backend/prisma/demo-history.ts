import { Prisma, PrismaClient } from '@prisma/client';
export async function backfillDemoHistory(db: PrismaClient) {
  const orders = await db.order.findMany({
    where: { idempotencyKey: { startsWith: 'seed-' }, tickets: { none: {} } },
    include: { lines: { include: { item: { include: { recipe: true } } } } },
  });
  for (const order of orders)
    await db.$transaction(async (tx) => {
      if (await tx.kitchenTicket.count({ where: { orderId: order.id } })) return;
      const stations = [...new Set(order.lines.map((l) => l.item.stationId))];
      for (const stationId of stations) {
        const lines = order.lines.filter((l) => l.item.stationId === stationId);
        const doneAt = new Date(order.placedAt.getTime() + 15 * 60000);
        const ticket = await tx.kitchenTicket.create({
          data: {
            orderId: order.id,
            stationId,
            status: 'BUMPED',
            fireAt: new Date(order.placedAt.getTime() + 2 * 60000),
            doneAt,
            inventoryDeducted: true,
            items: lines.map((l) => ({
              name: l.nameSnapshot,
              qty: l.qty,
              itemId: l.menuItemId,
              lineId: l.id,
              modifiers: [],
            })),
          },
        });
        for (const line of lines)
          for (const component of line.item.recipe) {
            const qty = new Prisma.Decimal(component.qty).mul(line.qty);
            await tx.inventoryItem.update({
              where: { id: component.inventoryItemId },
              data: { qtyOnHand: { decrement: qty } },
            });
            await tx.stockMovement.create({
              data: {
                inventoryItemId: component.inventoryItemId,
                delta: qty.negated(),
                reason: 'RECIPE',
                reference: ticket.id,
                byUserId: 'kitchen',
                createdAt: doneAt,
              },
            });
          }
      }
    });
}
