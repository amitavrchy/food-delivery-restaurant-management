import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature } from '../src/modules/stripe';
test('Stripe verifies exact raw bytes, tolerance and rotating signatures', () => {
  const raw = Buffer.from('{"id":"evt_example","amount":1200}'),
    secret = 'whsec_unit_fixture',
    timestamp = 1700000000;
  const signed = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
  assert.equal(verifyStripeSignature(raw, `t=${timestamp},v1=${signed}`, secret, timestamp), true);
  assert.equal(
    verifyStripeSignature(
      raw,
      `t=${timestamp},v1=${'0'.repeat(64)},v1=${signed}`,
      secret,
      timestamp + 299,
    ),
    true,
  );
  assert.equal(
    verifyStripeSignature(raw, `t=${timestamp},v1=${signed}`, secret, timestamp + 301),
    false,
  );
  assert.equal(
    verifyStripeSignature(Buffer.from('{}'), `t=${timestamp},v1=${signed}`, secret, timestamp),
    false,
  );
  assert.equal(verifyStripeSignature(raw, `t=${timestamp},v1=malformed`, secret, timestamp), false);
  assert.equal(
    verifyStripeSignature(raw, `t=${timestamp},v1=${signed}`, 'wrong', timestamp),
    false,
  );
});
