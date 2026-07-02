'use strict';
/**
 * services/webhookService.js
 * Cashfree webhook verification + idempotent processing.
 *
 * SECURITY RULES:
 *  1. Signature must be valid HMAC-SHA256
 *  2. Timestamp must be within 5 minutes (replay attack prevention)
 *  3. Each (cashfree_order_id, event_type) pair processed exactly once
 *  4. Property only published from HERE — never from frontend
 */
const crypto = require('crypto');
const { getDB, check } = require('../db/db');
const { publishProperty, markPaymentFailed, markRefunded } = require('./propertyService');

const WEBHOOK_SECRET = process.env.CASHFREE_WEBHOOK_SECRET || '';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Verify Cashfree webhook signature. Returns true/false. */
function verifySignature(rawBody, timestamp, signature) {
  if (!WEBHOOK_SECRET) {
    console.warn('[webhook] CASHFREE_WEBHOOK_SECRET not set — signature check skipped!');
    return process.env.NODE_ENV !== 'production';
  }
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(timestamp + rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expected, 'base64'),
    );
  } catch (_) {
    return false;
  }
}

/** Check if webhook timestamp is too old (replay attack). */
function isTimestampFresh(timestamp) {
  const age = Date.now() - parseInt(timestamp, 10) * 1000;
  return age < MAX_AGE_MS;
}

/**
 * Process an incoming Cashfree webhook.
 * Returns { processed: bool, duplicate: bool, action: string }
 */
async function processWebhook({ rawBody, timestamp, signature }) {
  const db = getDB();

  // 1. Parse body
  let payload;
  try { payload = JSON.parse(rawBody); } catch (_) { throw new Error('Invalid JSON payload'); }

  const eventType     = payload.type || payload.event_type || '';
  const cfOrderId     = payload.data?.order?.cf_order_id || payload.data?.order?.order_id || payload.order_id || '';
  const internalOrder = payload.data?.order?.order_id || '';

  const sigValid = verifySignature(rawBody, timestamp, signature || '');

  // 2. Log the webhook (always — even invalid ones)
  const logResult = await db.from('webhook_logs').insert({
    event_type:        eventType,
    cashfree_order_id: String(cfOrderId),
    payload:           rawBody,
    signature:         signature || null,
    sig_valid:         sigValid,
    processed:         false,
  }).select('id').single();
  const logId = logResult.data?.id;

  // 3. Reject invalid signatures in production
  if (!sigValid && process.env.NODE_ENV === 'production') {
    console.warn(`[webhook] Invalid signature for order ${cfOrderId}`);
    return { processed: false, duplicate: false, action: 'rejected_invalid_sig' };
  }

  // 4. Reject stale timestamps (replay attack)
  if (timestamp && !isTimestampFresh(timestamp)) {
    await db.from('webhook_logs').update({ processing_error: 'stale_timestamp', processed: false }).eq('id', logId);
    return { processed: false, duplicate: false, action: 'rejected_stale' };
  }

  // 5. Idempotency check — was this exact event already processed?
  const { data: dupCheck } = await db
    .from('webhook_logs')
    .select('id')
    .eq('cashfree_order_id', String(cfOrderId))
    .eq('event_type', eventType)
    .eq('processed', true)
    .neq('id', logId || 0)
    .maybeSingle();

  if (dupCheck) {
    await db.from('webhook_logs').update({ processed: false, processing_error: 'duplicate' }).eq('id', logId);
    return { processed: false, duplicate: true, action: 'skipped_duplicate' };
  }

  // 6. Find the matching payment order in our DB
  const { data: order } = await db
    .from('payment_orders')
    .select('*')
    .eq('internal_order_id', internalOrder)
    .maybeSingle();

  if (!order) {
    await db.from('webhook_logs').update({ processing_error: 'order_not_found' }).eq('id', logId);
    return { processed: false, duplicate: false, action: 'order_not_found' };
  }

  // 7. Process by event type
  let action = 'unknown';
  try {
    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'PAYMENT_SUCCESS') {
      const paymentId = payload.data?.payment?.cf_payment_id || '';
      const payMethod = payload.data?.payment?.payment_method || '';

      // Mark order as paid
      await db.from('payment_orders').update({
        status: 'paid',
        cashfree_payment_id: String(paymentId),
        payment_method: payMethod,
        updated_at: new Date().toISOString(),
      }).eq('internal_order_id', internalOrder);

      // Auto-publish the property (1-year expiry)
      await publishProperty(order.property_id, internalOrder, order.amount_paise);

      // Audit log
      await db.from('audit_logs').insert({
        actor_type: 'system', actor_id: 'cashfree_webhook',
        action: 'payment.success',
        target_type: 'property', target_id: order.property_id,
        detail: JSON.stringify({ internal_order_id: internalOrder, amount_paise: order.amount_paise }),
      });

      action = 'published';

    } else if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_FAILED') {
      await db.from('payment_orders').update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      }).eq('internal_order_id', internalOrder);

      await markPaymentFailed(order.property_id);
      action = 'payment_failed';

    } else if (eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED') {
      await db.from('payment_orders').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('internal_order_id', internalOrder);
      // Property stays payment_pending — agent can retry
      action = 'user_dropped';

    } else if (eventType === 'REFUND_STATUS_WEBHOOK') {
      const refundStatus = payload.data?.refund?.refund_status || '';
      await db.from('payment_orders').update({
        refund_status: refundStatus,
        status: refundStatus === 'SUCCESS' ? 'refunded' : 'refund_initiated',
        updated_at: new Date().toISOString(),
      }).eq('internal_order_id', internalOrder);

      if (refundStatus === 'SUCCESS') await markRefunded(order.property_id);
      action = `refund_${refundStatus.toLowerCase()}`;
    } else {
      action = `unhandled_${eventType}`;
    }

    // Mark log as processed
    await db.from('webhook_logs').update({ processed: true }).eq('id', logId);
    return { processed: true, duplicate: false, action };

  } catch (err) {
    await db.from('webhook_logs').update({ processing_error: err.message }).eq('id', logId);
    throw err;
  }
}

module.exports = { verifySignature, processWebhook };
