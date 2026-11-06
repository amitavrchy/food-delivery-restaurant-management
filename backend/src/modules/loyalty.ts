import { Prisma } from '@prisma/client';
export async function loyaltyAfterTransition(
  tx: Prisma.TransactionClient,
  orderId: string,
  status: string,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      customer: { select: { role: true } },
      restaurant: { select: { loyaltyEnabled: true } },
    },
  });
  if (status === 'CANCELLED' && order.loyaltyRedeemed > 0)
    await tx.loyaltyEntry.upsert({
      where: { orderId_kind: { orderId, kind: 'RESTORE' } },
      create: {
        userId: order.customerId,
        orderId,
        kind: 'RESTORE',
        points: order.loyaltyRedeemed,
        reason: 'Points restored after cancellation',
      },
      update: {},
    });
  if (
    ['DELIVERED', 'COMPLETED', 'CLOSED'].includes(status) &&
    order.customer.role === 'CUSTOMER' &&
    order.restaurant.loyaltyEnabled
  ) {
    const points = Math.floor((order.goodsMinor - order.discountMinor) / 10000);
    if (points > 0) {
      await tx.loyaltyEntry.upsert({
        where: { orderId_kind: { orderId, kind: 'EARN' } },
        create: {
          userId: order.customerId,
          orderId,
          kind: 'EARN',
          points,
          reason: 'Reward for a completed food order',
        },
        update: {},
      });
      await tx.order.update({ where: { id: orderId }, data: { loyaltyEarned: points } });
    }
  }
  await tx.notification.create({
    data: {
      userId: order.customerId,
      kind: 'ORDER',
      title: `Order #${order.number}: ${status.toLowerCase().replaceAll('_', ' ')}`,
      body:
        order.channel === 'DELIVERY'
          ? 'Your delivery timeline has been updated.'
          : 'Your kitchen and service timeline has been updated.',
      href: `/orders/${order.id}`,
    },
  });
}
