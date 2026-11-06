import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Headers,
  ConflictException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { Db } from '../db';
import { Public } from '../auth';
import { id, money, parse, required } from '../common';
@Controller('payments')
export class PaymentsController {
  constructor(@Inject(Db) private db: Db) {}
  // Provider adapter contract: sign the canonical JSON payload with HMAC-SHA256.
  // Enable a real provider only after implementing its server-side checkout adapter.
  @Public() @Post('webhook') async webhook(
    @Headers('x-payment-signature') signature: string,
    @Body() body: unknown,
  ) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !signature || !/^[a-f0-9]{64}$/.test(signature)) throw new ForbiddenException();
    const expected = createHmac('sha256', secret).update(JSON.stringify(body)).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new ForbiddenException();
    const data = parse(
      z.object({
        paymentId: id,
        providerReference: id,
        amountMinor: money,
        status: z.enum(['CAPTURED', 'FAILED', 'REFUNDED']),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const payment = required(await tx.payment.findUnique({ where: { id: data.paymentId } }));
      if (payment.amountMinor !== data.amountMinor)
        throw new ConflictException('Payment amount mismatch.');
      if (['COD', 'COUNTER'].includes(payment.provider))
        throw new ConflictException('Offline payments cannot be captured by webhook.');
      if (payment.status === data.status) return { ok: true };
      const allowed: Record<string, string[]> = {
        PENDING: ['CAPTURED', 'FAILED'],
        CAPTURED: ['REFUNDED'],
      };
      if (!allowed[payment.status]?.includes(data.status))
        throw new ConflictException('Invalid payment transition.');
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: data.status, providerReference: data.providerReference },
      });
      return { ok: true };
    });
  }
}
