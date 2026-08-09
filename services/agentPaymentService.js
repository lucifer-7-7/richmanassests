'use strict';

/**
 * services/agentPaymentService.js
 * Core Payment Logic for Razorpay Integration:
 * Order Creation, Server Amount Calculation, Client Verification,
 * Webhook Processing (Idempotency Ledger), and Invoicing.
 */

const { getDB, check } = require('../db/db');
const razorpayService = require('./razorpayService');
const { logStatusChange } = require('./agentAuthService');
const { getListingFee } = require('./paymentService');
const { logSecurityEvent } = require('../lib/securityLog');


/**
 * WEBHOOK EVENT HANDLER (Source of Truth — owns listing publication)
 *
 * Idempotency is enforced by the UNIQUE constraint on webhook_events.razorpay_event_id.
 * The insert itself is the lock: a read-then-write check loses the race when Razorpay
 * delivers the same event twice concurrently, which it does on retries. The previous
 * in-memory Set was worse still — it grew without bound, reset on restart, and was
 * per-instance, so it never actually prevented anything in a multi-instance deploy.
 */
async function processRazorpayWebhook({ eventId, eventType, payload }) {
  const db = getDB();

  // 1. Claim the event. A duplicate key here means another delivery already owns it.
  const eventRow = {
    razorpay_event_id: eventId,
    event_type: eventType,
    payload,
    processed: false,
    received_at: new Date().toISOString(),
  };

  const insertEvent = await db.from('webhook_events').insert(eventRow).select('id').maybeSingle();

  if (insertEvent.error) {
    // 23505 = unique_violation → this event was already claimed.
    if (insertEvent.error.code === '23505') {
      const { data: existing } = await db
        .from('webhook_events')
        .select('processed')
        .eq('razorpay_event_id', eventId)
        .maybeSingle();
      return { ok: true, duplicate: true, processed: !!existing?.processed };
    }
    // Anything else is a real failure — throw so the route returns 500 and Razorpay retries.
    throw new Error(`webhook_events insert failed: ${insertEvent.error.message}`);
  }

  const webhookRecordId = insertEvent.data?.id;


  // 3. Process by Event Type
  try {
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = payload.payment?.entity || payload.payload?.payment?.entity;
      const orderEntity = payload.order?.entity || payload.payload?.order?.entity;

      const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
      const razorpayPaymentId = paymentEntity?.id;
      const amountPaise = paymentEntity?.amount || orderEntity?.amount;
      const method = paymentEntity?.method || 'unknown';
      const notesAgentId = paymentEntity?.notes?.agent_id || orderEntity?.notes?.agent_id;
      const notesPurpose = paymentEntity?.notes?.purpose || orderEntity?.notes?.purpose;
      const notesPropertyId = paymentEntity?.notes?.property_id || orderEntity?.notes?.property_id;

      let order = null;
      if (razorpayOrderId) {
        try {
          const { data, error } = await db.from('payment_orders').select('*').eq('razorpay_order_id', razorpayOrderId).maybeSingle();
          if (error) console.error('[processRazorpayWebhook] order lookup error:', error.message);
          order = data;
        } catch (err) {
          console.error('[processRazorpayWebhook] order lookup threw:', err.message);
        }
      }

      // Notes on the Razorpay order itself are the ground truth — always present
      // regardless of whether our own payment_orders row persisted correctly.
      const purpose = order?.purpose || notesPurpose;
      const targetAgentId = order?.agent_id || notesAgentId;
      const targetPropertyId = order?.property_id || notesPropertyId;

      if (order) {
        await db
          .from('payment_orders')
          .update({ status: 'paid', razorpay_payment_id: razorpayPaymentId, updated_at: new Date().toISOString() })
          .eq('id', order.id);

        const paymentData = {
          payment_order_id: order.id,
          razorpay_payment_id: razorpayPaymentId || `pay_synced_${Date.now()}`,
          // getAllOrders/getAgentOrders join payments on this column. Omitting it left
          // every webhook-captured payment invisible to the admin payments list.
          razorpay_order_id: razorpayOrderId,
          agent_id: order.agent_id,
          property_id: order.property_id,
          status: 'captured',
          method,
          amount_paise: amountPaise || order.amount_paise,
          currency: order.currency || 'INR',
          captured_at: new Date().toISOString(),
          raw_payload: payload,
          created_at: new Date().toISOString(),
        };
        const upsertRes = await db.from('payments').upsert(paymentData, { onConflict: 'razorpay_payment_id' });
        if (upsertRes.error) {
          // Throwing gets us a Razorpay retry. Swallowing lost the capture record for good.
          throw new Error(`payments upsert failed: ${upsertRes.error.message}`);
        }
      }

      // Property listing purchase — webhook is the canonical publisher.
      // Client-side verify (verifyPropertyPayment) is optimistic/fast-path only;
      // this path guarantees publish even if the browser closes before the checkout handler fires.
      if (purpose === 'property_listing' && targetPropertyId && targetAgentId) {
        try {
          const propSvc = require('./propertyService');
          await propSvc.publishProperty({
            propertyId:  targetPropertyId,
            agentId:     targetAgentId,
            paidOrderId: razorpayOrderId,
            amountPaise: amountPaise || order?.amount_paise || 0,
          });
        } catch (err) {
          console.error('[processRazorpayWebhook] publishProperty failed:', err.message);
        }
      } else if (purpose === 'property_listing' && targetPropertyId && !targetAgentId) {
        // publishProperty now scopes by agent, so an order that carries a property but no
        // agent cannot be published safely. Surface it rather than guessing an owner.
        console.error('[processRazorpayWebhook] listing order missing agent_id, cannot publish:', {
          razorpayOrderId, targetPropertyId,
        });
      }

      // No agent-activation branch: accounts are free and already active by the time any
      // payment happens. The only thing a captured payment buys is a published listing.

    } else if (eventType === 'payment.failed') {
      const paymentEntity = payload.payment?.entity || payload.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;
      const razorpayPaymentId = paymentEntity?.id;

      if (razorpayOrderId) {
        const { data: order } = await db.from('payment_orders').select('*').eq('razorpay_order_id', razorpayOrderId).maybeSingle();
        if (order) {
          await db.from('payment_orders').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', order.id);

          await db.from('payments').upsert({
            payment_order_id: order.id,
            razorpay_payment_id: razorpayPaymentId || `pay_fail_${Date.now()}`,
            status: 'failed',
            method: paymentEntity?.method || 'unknown',
            amount_paise: order.amount_paise,
            currency: order.currency,
            error_code: paymentEntity?.error_code || 'PAYMENT_FAILED',
            error_description: paymentEntity?.error_description || 'Payment transaction failed',
            raw_payload: payload,
            created_at: new Date().toISOString(),
          }, { onConflict: 'razorpay_payment_id' });

          // A failed listing fee never touches the account — onboarding is free, so there is
          // no account state a payment can invalidate. Only the listing goes back for retry.
          if (order.property_id) {
            try {
              const propSvc = require('./propertyService');
              await propSvc.markPaymentFailed(order.property_id);
            } catch (err) {
              console.error('[processRazorpayWebhook] markPaymentFailed failed:', err.message);
            }
          }
        }
      }
    } else if (eventType === 'refund.processed') {
      const refundEntity = payload.refund?.entity || payload.payload?.refund?.entity;
      const rzpRefundId = refundEntity?.id;
      const rzpPaymentId = refundEntity?.payment_id;

      if (rzpRefundId) {
        await db.from('refunds').update({ status: 'processed' }).eq('razorpay_refund_id', rzpRefundId);
      }

      if (rzpPaymentId) {
        const { data: payment } = await db
          .from('payments')
          .select('*, payment_orders(agent_id, property_id)')
          .eq('razorpay_payment_id', rzpPaymentId)
          .maybeSingle();

        if (payment) {
          await db.from('payments').update({ status: 'refunded' }).eq('id', payment.id);

          // Refund policy: unwind exactly what the fee bought — the listing slot.
          // The account is free, so it was never the thing purchased and is left alone.
          // (The old behaviour was the reverse: suspend the agent, leave the listing live.)
          const propertyId = payment.property_id || payment.payment_orders?.property_id;
          if (propertyId) {
            try {
              const propSvc = require('./propertyService');
              await propSvc.markRefunded(propertyId);
            } catch (err) {
              console.error('[processRazorpayWebhook] markRefunded failed:', err.message);
            }
          }
        }
      }
    }

    // Mark event processed
    if (webhookRecordId) {
      await db.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('id', webhookRecordId);
    }

    return { ok: true, processed: true };
  } catch (err) {
    console.error('[processRazorpayWebhook Error]:', err.message);
    throw err;
  }
}

/**
 * Create Razorpay Order for Property Listing Fee.
 * Amount is always fetched from listing_fee_config — never hardcoded.
 */
async function createPropertyPaymentOrder({ agentId, propertyId }) {
  const db = getDB();
  const propSvc = require('./propertyService');
  const agentAuthSvc = require('./agentAuthService');

  const [agent, prop, fee] = await Promise.all([
    agentAuthSvc.getAgentById(agentId),
    propSvc.getAgentProperty(propertyId, agentId),
    getListingFee(),
  ]);

  if (!agent) throw new Error('Agent not found.');
  if (!prop)  throw new Error('Property listing not found or access denied.');
  if (['published'].includes(prop.status)) throw new Error('This listing is already published.');

  const feeAmountPaise = fee.amount_paise;
  const receipt = `prop_${propertyId.substring(0, 10)}_${Date.now().toString(36)}`;

  const rzpOrder = await razorpayService.createRazorpayOrder({
    amount_paise: feeAmountPaise,
    currency: fee.currency || 'INR',
    receipt,
    notes: {
      property_id: propertyId,
      agent_id: String(agentId),
      purpose: 'property_listing',
    },
  });

  // Store order with property_id so the webhook and the verify path can resolve which
  // listing to publish, and who owns it. This is no longer optional: verifyPropertyPayment
  // authorises against this row, so proceeding without it means the agent pays and is then
  // told the order is unknown. Fail now, before the checkout modal opens.
  const insertRes = await db.from('payment_orders').insert({
    agent_id:          agentId,
    property_id:       propertyId,
    razorpay_order_id: rzpOrder.id,
    amount_paise:      feeAmountPaise,
    currency:          fee.currency || 'INR',
    purpose:           'property_listing',
    status:            'created',
    created_at:        new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  });

  if (insertRes.error) {
    console.error('[createPropertyPaymentOrder] payment_orders insert failed:', {
      razorpay_order_id: rzpOrder.id, error: insertRes.error.message,
    });
    throw new Error('Could not start the payment. Please try again in a moment.');
  }

  return {
    ok: true,
    razorpay_order_id: rzpOrder.id,
    amount_paise:      feeAmountPaise,
    currency:          fee.currency || 'INR',
    key_id:            razorpayService.KEY_ID,
    property:          { id: prop.id, name: prop.name },
    agent:             { name: agent.name, email: agent.email, phone: agent.phone },
  };
}

/**
 * Verify Client Checkout Signature for Property Listing Payment.
 * Optimistically publishes the property on valid signature.
 * The Razorpay webhook is the canonical source-of-truth but this path
 * ensures instant UX when webhooks are delayed.
 *
 * The signature only proves Razorpay issued this order/payment pair — it says nothing
 * about *what* was bought or *who* bought it. Every field that decides which listing gets
 * published therefore comes from our own payment_orders row, never from the request body.
 * Without that, one ₹999 payment could be replayed to publish unlimited listings, including
 * other agents'.
 */
async function verifyPropertyPayment({ agentId, propertyId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const isValid = razorpayService.verifyCheckoutSignature({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  if (!isValid) {
    await logSecurityEvent('payment_signature_invalid', {
      agent_id: agentId,
      razorpay_order_id,
      razorpay_payment_id,
    });
    throw new Error('Invalid Razorpay payment signature. Payment verification failed.');
  }

  const db = getDB();
  const now = new Date();

  const { data: order, error: orderErr } = await db
    .from('payment_orders')
    .select('id, agent_id, property_id, amount_paise, currency, status, purpose')
    .eq('razorpay_order_id', razorpay_order_id)
    .maybeSingle();

  if (orderErr) {
    // A DB fault here must not fall through to publishing. Fail; the webhook still owns
    // the canonical publish, so the agent loses nothing but a few seconds.
    console.error('[verifyPropertyPayment] order lookup failed:', orderErr.message);
    throw new Error('Could not verify this payment right now. Please refresh in a moment.');
  }
  if (!order) {
    await logSecurityEvent('payment_order_not_found', { agent_id: agentId, razorpay_order_id });
    throw new Error('Unknown payment order. Payment verification failed.');
  }

  // The order must belong to the agent making the request…
  if (String(order.agent_id) !== String(agentId)) {
    await logSecurityEvent('payment_order_agent_mismatch', {
      agent_id: agentId,
      order_agent_id: order.agent_id,
      razorpay_order_id,
    });
    throw new Error('This payment does not belong to your account.');
  }

  // …and must be the order raised for this exact listing.
  if (String(order.property_id) !== String(propertyId)) {
    await logSecurityEvent('payment_order_property_mismatch', {
      agent_id: agentId,
      requested_property_id: propertyId,
      order_property_id: order.property_id,
      razorpay_order_id,
    });
    throw new Error('This payment was raised for a different listing.');
  }

  // Already settled — return success without republishing, so a page refresh or a
  // webhook that landed first is harmless.
  if (order.status === 'paid') {
    return { ok: true, property_id: order.property_id, payment_id: razorpay_payment_id, already_verified: true };
  }

  // Server-side amount, from the row we created. Never the client's.
  const amountPaise = order.amount_paise;

  await db.from('payment_orders')
    .update({ status: 'paid', razorpay_payment_id, updated_at: now.toISOString() })
    .eq('id', order.id);

  // Publish the property via the canonical service function
  const propSvc = require('./propertyService');
  try {
    await propSvc.publishProperty({
      propertyId:  order.property_id,
      agentId:     order.agent_id,
      paidOrderId: razorpay_order_id,
      amountPaise,
    });
  } catch (err) {
    console.error('[verifyPropertyPayment] publishProperty failed:', err.message);
    // Non-fatal: webhook or reconciliation will catch this
  }

  // Record payment row (non-fatal if payments table schema differs)
  try {
    await db.from('payments').upsert({
      payment_order_id: order.id,
      razorpay_payment_id,
      agent_id:    order.agent_id,
      property_id: order.property_id,
      razorpay_order_id,
      amount_paise: amountPaise,
      currency:    order.currency || 'INR',
      status:      'captured',
      captured_at: now.toISOString(),
      created_at:  now.toISOString(),
    }, { onConflict: 'razorpay_payment_id' });
  } catch (err) {
    console.error('[verifyPropertyPayment] payments upsert failed:', err.message);
  }

  return { ok: true, property_id: order.property_id, payment_id: razorpay_payment_id };
}

module.exports = {
  processRazorpayWebhook,
  createPropertyPaymentOrder,
  verifyPropertyPayment,
};

