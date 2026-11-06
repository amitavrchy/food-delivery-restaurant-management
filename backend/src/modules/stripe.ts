import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { Db } from '../db';
import { Authed, Public } from '../auth';
import { id, key, managers, money, parse, required, scope } from '../common';
import { KitchenService } from './kitchen';
import { transitionTx } from './transitions';
export function verifyStripeSignature(
  raw: Buffer,
  header: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const parts = header.split(',').map((s) => s.split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 300)
    return false;
  const expected = createHmac('sha256', secret)
    .update(timestamp + '.')
    .update(raw)
    .digest();
  return parts.some(
    ([k, v]) =>
      k === 'v1' &&
      /^[a-f0-9]{64}$/.test(v || '') &&
      timingSafeEqual(expected, Buffer.from(v, 'hex')),
  );
}
class ProviderError extends Error {
  constructor(public status: number) {
    super('Payment provider rejected the request.');
  }
}
export const stripeEnabled = () =>
  Boolean(
    process.env.STRIPE_SECRET_KEY?.startsWith('sk_') &&
    process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'),
  );
async function stripe(path: string, params: URLSearchParams, idem: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idem,
      'Stripe-Version': '2026-10-28.endive',
    },
    body: params,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new ProviderError(response.status);
  return data as Record<string, unknown>;
}
@Controller('payments/stripe')
export class StripeController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(KitchenService) private kitchen: KitchenService,
  ) {}
  @Public() @Get('config') config() {
    return {
      enabled: stripeEnabled(),
      mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test',
      currency: 'BDT',
    };
  }
  @Post('session') async session(@Req() req: Authed, @Body() body: unknown) {
    if (!stripeEnabled())
      throw new ServiceUnavailableException('Card checkout has not been configured.');
    const { orderId } = parse(z.object({ orderId: id }), body);
    const order = required(
      await this.db.order.findFirst({
        where: { id: orderId, customerId: req.user.id },
        include: { payments: true, restaurant: { select: { name: true } } },
      }),
    );
    const payment = required(order.payments.find((p) => p.provider === 'STRIPE'));
    if (order.status !== 'PLACED' || payment.status !== 'PENDING')
      throw new ConflictException('This order cannot start a card checkout.');
    if (payment.checkoutUrl) return { url: payment.checkoutUrl };
    const app = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const params = new URLSearchParams({
      mode: 'payment',
      success_url: `${app}/orders/${order.id}?payment=returned`,
      cancel_url: `${app}/orders/${order.id}?payment=cancelled`,
      'line_items[0][price_data][currency]': 'bdt',
      'line_items[0][price_data][unit_amount]': String(order.grandMinor),
      'line_items[0][price_data][product_data][name]': `${order.restaurant.name} · Order #${order.number}`,
      'line_items[0][quantity]': '1',
      'payment_method_types[0]': 'card',
      'metadata[paymentId]': payment.id,
      client_reference_id: order.id,
      expires_at: String(Math.floor(Date.now() / 1000) + 1800),
    });
    let result: Record<string, unknown>;
    try {
      result = await stripe('checkout/sessions', params, `checkout:${payment.id}`);
    } catch {
      throw new ServiceUnavailableException(
        'Card checkout is temporarily unavailable. Retry this order; a duplicate session will not be created.',
      );
    }
    if (
      typeof result.id !== 'string' ||
      typeof result.url !== 'string' ||
      !result.url.startsWith('https://checkout.stripe.com/')
    )
      throw new ServiceUnavailableException('Provider returned an invalid checkout session.');
    await this.db.payment.update({
      where: { id: payment.id },
      data: { providerReference: result.id, checkoutUrl: result.url },
    });
    return { url: result.url };
  }
  @Public() @Post('webhook') @HttpCode(200) async webhook(
    @Req() req: Authed & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (
      !secret ||
      !req.rawBody ||
      !signature ||
      !verifyStripeSignature(req.rawBody, signature, secret)
    )
      throw new ForbiddenException('Invalid webhook signature.');
    let decoded: unknown;
    try {
      decoded = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid event JSON.');
    }
    const event = parse(
      z.object({
        id,
        type: z.string().max(150),
        data: z.object({ object: z.record(z.string(), z.unknown()) }),
      }),
      decoded,
    );
    return this.db.atomic(async (tx) => {
      if (await tx.paymentEvent.findUnique({ where: { id: event.id } })) return { ok: true };
      const object = event.data.object;
      if (event.type.startsWith('checkout.session.')) {
        const metadata = object.metadata as Record<string, string> | undefined;
        const paymentId = metadata?.paymentId;
        if (paymentId) {
          const payment = required(
            await tx.payment.findFirst({
              where: { id: paymentId, provider: 'STRIPE' },
              include: { order: { include: { restaurant: true } } },
            }),
          );
          if (object.currency !== 'bdt' || object.amount_total !== payment.amountMinor)
            throw new ConflictException('Webhook amount or currency mismatch.');
          if (payment.providerReference && payment.providerReference !== object.id)
            throw new ConflictException('Checkout session mismatch.');
          if (
            ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
              event.type,
            ) &&
            object.payment_status === 'paid' &&
            payment.status !== 'CAPTURED' &&
            payment.status !== 'REFUNDED'
          ) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'CAPTURED',
                paymentIntentId:
                  typeof object.payment_intent === 'string' ? object.payment_intent : null,
              },
            });
            const order = payment.order;
            if (order.status === 'CANCELLED') {
              await tx.auditLog.create({
                data: {
                  actorId: 'system:stripe',
                  action: 'LATE_PAYMENT_REFUND_REQUIRED',
                  entityId: order.id,
                  detail: { paymentId },
                },
              });
              await tx.supportTicket.create({
                data: {
                  restaurantId: order.restaurantId,
                  orderId: order.id,
                  userId: order.customerId,
                  category: 'PAYMENT',
                  subject: 'Payment captured after order cancellation',
                  status: 'OPEN',
                },
              });
            } else if (
              order.status === 'PLACED' &&
              order.restaurant.autoAccept &&
              (!order.scheduledFor || order.scheduledFor.getTime() <= Date.now() + 30 * 60000)
            ) {
              await transitionTx(tx, order, 'ACCEPTED', 'system:stripe');
              await this.kitchen.create(tx, order.id);
            }
            await tx.notification.create({
              data: {
                userId: order.customerId,
                kind: 'PAYMENT',
                title: 'Your card payment is confirmed',
                body: `Order #${order.number}`,
                href: `/orders/${order.id}`,
              },
            });
          } else if (
            ['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(
              event.type,
            ) &&
            payment.status === 'PENDING'
          ) {
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
            if (payment.order.status === 'PLACED')
              await transitionTx(
                tx,
                payment.order,
                'CANCELLED',
                'system:stripe',
                'Card checkout expired or failed.',
              );
          }
        }
      }
      if (event.type.startsWith('refund.')) {
        const metadata = object.metadata as Record<string, string> | undefined;
        if (metadata?.appRefundId) {
          const refund = await tx.paymentRefund.findUnique({
            where: { id: metadata.appRefundId },
            include: { payment: true },
          });
          if (refund && refund.status !== 'COMPLETED') {
            if (
              object.amount !== refund.amountMinor ||
              object.currency !== 'bdt' ||
              object.payment_intent !== refund.payment.paymentIntentId ||
              (refund.providerReference && refund.providerReference !== object.id)
            )
              throw new ConflictException('Refund event does not match the requested payment.');
            const status =
              object.status === 'succeeded'
                ? 'COMPLETED'
                : ['failed', 'canceled'].includes(String(object.status))
                  ? 'FAILED'
                  : 'PENDING';
            await tx.paymentRefund.update({
              where: { id: refund.id },
              data: { status, providerReference: String(object.id) },
            });
            if (status === 'COMPLETED') await this.refundFinalized(tx, refund.paymentId);
          }
        }
      }
      await tx.paymentEvent.create({ data: { id: event.id, provider: 'STRIPE' } });
      return { ok: true };
    });
  }
  private async refundFinalized(tx: Parameters<Parameters<Db['atomic']>[0]>[0], paymentId: string) {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { refunds: true, order: true },
    });
    const refunded = payment.refunds
      .filter((r) => r.status === 'COMPLETED')
      .reduce((s, r) => s + r.amountMinor, 0);
    if (refunded >= payment.amountMinor) {
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
      const order = payment.order;
      if (order.loyaltyEarned)
        await tx.loyaltyEntry.upsert({
          where: { orderId_kind: { orderId: order.id, kind: 'REFUND_EARN_REVERSAL' } },
          create: {
            orderId: order.id,
            userId: order.customerId,
            kind: 'REFUND_EARN_REVERSAL',
            points: -order.loyaltyEarned,
            reason: 'Rewards reversed after a full refund',
          },
          update: {},
        });
      if (order.loyaltyRedeemed && order.status !== 'CANCELLED')
        await tx.loyaltyEntry.upsert({
          where: { orderId_kind: { orderId: order.id, kind: 'REFUND_REDEEM_RESTORE' } },
          create: {
            orderId: order.id,
            userId: order.customerId,
            kind: 'REFUND_REDEEM_RESTORE',
            points: order.loyaltyRedeemed,
            reason: 'Redeemed rewards restored after full refund',
          },
          update: {},
        });
    }
  }
  @Post('refund') async refund(@Req() req: Authed, @Body() body: unknown) {
    if (!stripeEnabled()) throw new ServiceUnavailableException('Stripe is not configured.');
    const data = parse(
      z.object({
        paymentId: id,
        amountMinor: money.refine((v) => v > 0),
        idempotencyKey: key,
        reason: z.string().min(5).max(300),
        managerPin: z.string().max(20),
      }),
      body,
    );
    const payment = required(
      await this.db.payment.findUnique({ where: { id: data.paymentId }, include: { order: true } }),
    );
    await scope(this.db, req.user, payment.order.restaurantId, managers);
    if (data.managerPin !== process.env.MANAGER_PIN)
      throw new ForbiddenException('Manager PIN is incorrect.');
    if (payment.provider !== 'STRIPE' || !payment.paymentIntentId)
      throw new ConflictException('A captured Stripe payment intent is required.');
    const refund = await this.db.atomic(async (tx) => {
      const existing = await tx.paymentRefund.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) {
        if (existing.paymentId !== payment.id || existing.amountMinor !== data.amountMinor)
          throw new ConflictException('Refund key was reused with different details.');
        return existing;
      }
      const fresh = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: { refunds: true },
      });
      if (fresh.status !== 'CAPTURED')
        throw new ConflictException('Payment is not available for refund.');
      const reserved = fresh.refunds
        .filter((r) => ['REQUESTED', 'PENDING', 'COMPLETED'].includes(r.status))
        .reduce((s, r) => s + r.amountMinor, 0);
      if (data.amountMinor > fresh.amountMinor - reserved)
        throw new ConflictException('Refund exceeds the unrefunded payment balance.');
      const record = await tx.paymentRefund.create({
        data: {
          paymentId: payment.id,
          amountMinor: data.amountMinor,
          idempotencyKey: data.idempotencyKey,
          reason: data.reason,
          requestedById: req.user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'CARD_REFUND_REQUESTED',
          entityId: record.id,
          detail: { paymentId: payment.id, amountMinor: data.amountMinor, reason: data.reason },
        },
      });
      return record;
    });
    if (refund.status !== 'REQUESTED') return refund;
    try {
      const response = await stripe(
        'refunds',
        new URLSearchParams({
          payment_intent: payment.paymentIntentId,
          amount: String(refund.amountMinor),
          'metadata[appRefundId]': refund.id,
        }),
        `refund:${refund.id}`,
      );
      return await this.db.atomic(async (tx) => {
        const current = await tx.paymentRefund.findUniqueOrThrow({ where: { id: refund.id } });
        if (current.status === 'COMPLETED') return current;
        const record = await tx.paymentRefund.update({
          where: { id: refund.id },
          data: {
            providerReference: String(response.id),
            status:
              response.status === 'succeeded'
                ? 'COMPLETED'
                : response.status === 'failed'
                  ? 'FAILED'
                  : 'PENDING',
          },
        });
        if (record.status === 'COMPLETED') await this.refundFinalized(tx, payment.id);
        return record;
      });
    } catch (error) {
      if (error instanceof ProviderError && error.status >= 400 && error.status < 500)
        await this.db.paymentRefund.update({
          where: { id: refund.id },
          data: { status: 'FAILED' },
        });
      throw new ServiceUnavailableException(
        'The provider did not confirm the refund. Retry with the same refund key; do not create a second request.',
      );
    }
  }
}
