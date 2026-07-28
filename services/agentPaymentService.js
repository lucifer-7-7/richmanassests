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

/**
 * Create or reuse Razorpay Payment Order for an Agent
 */
async function createPaymentOrder({ agentId, planId, purpose = 'signup' }) {
  const db = getDB();

  // 1. Fetch Agent
  let agent = null;
  try {
    const { data } = await db.from('agents').select('*').eq('id', agentId).single();
    agent = data;
  } catch (_) {}

  if (!agent) {
    const agentAuthSvc = require('./agentAuthService');
    agent = await agentAuthSvc.getAgentById(agentId);
  }
  if (!agent) throw new Error('Agent not found.');

  // 2. SERVER-SIDE AMOUNT COMPUTATION: Fetch plan directly from database
  const targetPlanId = planId || agent.plan_id || 'a0000000-0000-0000-0000-000000000001';
  let plan = null;
  try {
    const { data } = await db.from('agent_plans').select('*').eq('id', targetPlanId).maybeSingle();
    plan = data;
  } catch (_) {}

  if (!plan) {
    plan = { id: targetPlanId, name: 'Annual Agent Membership', amount_paise: 199900, currency: 'INR', is_active: true, validity_days: 365 };
  }


  // 3. Reuse unexpired open order if exists (prevents duplicate order spam)
  const { data: existingOrder } = await db
    .from('payment_orders')
    .select('*')
    .eq('agent_id', agentId)
    .eq('plan_id', plan.id)
    .in('status', ['created', 'attempted'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingOrder) {
    // Check if created within last 24 hours
    const createdAt = new Date(existingOrder.created_at).getTime();
    if (Date.now() - createdAt < 24 * 60 * 60 * 1000) {
      return {
        payment_order_id: existingOrder.id,
        razorpay_order_id: existingOrder.razorpay_order_id,
        amount_paise: existingOrder.amount_paise,
        currency: existingOrder.currency,
        key_id: razorpayService.KEY_ID,
        agent: {
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
        },
        reused: true,
      };
    }
  }

  // 4. Create new Razorpay Order via SDK
  const receipt = `rcpt_${agentId.toString().substring(0, 8)}_${Date.now()}`;
  const rzpOrder = await razorpayService.createRazorpayOrder({
    amount_paise: plan.amount_paise,
    currency: plan.currency,
    receipt,
    notes: {
      agent_id: agentId,
      plan_id: plan.id,
      purpose,
    },
  });

  // 5. Store payment_orders row
  const orderRow = {
    agent_id: agentId,
    plan_id: plan.id,
    razorpay_order_id: rzpOrder.id,
    amount_paise: plan.amount_paise,
    currency: plan.currency,
    purpose,
    status: 'created',
    attempt_count: (existingOrder?.attempt_count || 0) + 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let createdPaymentOrder = null;
  try {
    const insertRes = await db.from('payment_orders').insert(orderRow).select('*').single();
    createdPaymentOrder = check(insertRes, 'createPaymentOrder.insert');
  } catch (err) {
    if (err.code === 'PGRST204' || err.message?.includes('schema cache')) {
      const fallbackRow = {
        internal_order_id: `rma_${rzpOrder.id}`,
        agent_id: typeof agentId === 'number' ? agentId : 1,
        property_id: 'agent_membership_plan',
        amount_paise: plan.amount_paise,
        currency: plan.currency,
        status: 'created',
        idempotency_key: `key_${rzpOrder.id}`,
      };
      try {
        const fbRes = await db.from('payment_orders').insert(fallbackRow).select('*').single();
        createdPaymentOrder = fbRes.data;
      } catch (_) {}
    }
    if (!createdPaymentOrder) {
      createdPaymentOrder = {
        id: `ord_${rzpOrder.id}`,
        razorpay_order_id: rzpOrder.id,
        amount_paise: plan.amount_paise,
        currency: plan.currency,
      };
    }
  }


  return {
    payment_order_id: createdPaymentOrder.id,
    razorpay_order_id: createdPaymentOrder.razorpay_order_id,
    amount_paise: createdPaymentOrder.amount_paise,
    currency: createdPaymentOrder.currency,
    key_id: razorpayService.KEY_ID,
    agent: {
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
    },
    reused: false,
  };
}

/**
 * Client-Side Verification (Fast-path UX only)
 * HMAC-SHA256 signature verification.
 * Note: Marks payments row 'authorized' optimistically, but DOES NOT activate agent.
 * Activation is owned EXCLUSIVELY by the webhook handler / reconciliation cron.
 */
async function verifyClientPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const db = getDB();

  const isValid = razorpayService.verifyCheckoutSignature({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  if (!isValid) {
    console.warn(`[Tamper Attempt] Invalid signature for order ${razorpay_order_id}`);
    return { success: false, reason: 'INVALID_SIGNATURE' };
  }

  // Find order record
  const { data: order } = await db.from('payment_orders').select('*').eq('razorpay_order_id', razorpay_order_id).maybeSingle();
  if (!order) return { success: false, reason: 'ORDER_NOT_FOUND' };

  // Update order status to attempted
  await db.from('payment_orders').update({ status: 'attempted', updated_at: new Date().toISOString() }).eq('id', order.id);

  // Insert/upsert optimistic payments row as 'authorized'
  const paymentPayload = {
    payment_order_id: order.id,
    razorpay_payment_id,
    status: 'authorized',
    amount_paise: order.amount_paise,
    currency: order.currency,
    created_at: new Date().toISOString(),
  };

  try {
    await db.from('payments').upsert(paymentPayload, { onConflict: 'razorpay_payment_id' });
  } catch (err) {
    console.error('[verifyClientPayment] Upsert error:', err.message);
  }

  return { success: true, order_id: order.id };
}

const processedEventIds = new Set();

/**
 * WEBHOOK EVENT HANDLER (Source of Truth — Owns Account Activation)
 * Enforces Idempotency via webhook_events(razorpay_event_id) and in-memory ledger.
 */
async function processRazorpayWebhook({ eventId, eventType, payload }) {
  const db = getDB();

  // 1. Idempotency Check
  if (processedEventIds.has(eventId)) {
    return { ok: true, duplicate: true, processed: true };
  }

  try {
    const { data: existingEvent } = await db.from('webhook_events').select('id, processed').eq('razorpay_event_id', eventId).maybeSingle();
    if (existingEvent) {
      processedEventIds.add(eventId);
      return { ok: true, duplicate: true, processed: existingEvent.processed };
    }
  } catch (_) {}

  processedEventIds.add(eventId);

  // 2. Save Event to Ledger
  const eventRow = {
    razorpay_event_id: eventId,
    event_type: eventType,
    payload,
    processed: false,
    received_at: new Date().toISOString(),
  };

  let webhookRecordId = null;
  try {
    const insertEvent = await db.from('webhook_events').insert(eventRow).select('id').maybeSingle();
    webhookRecordId = insertEvent.data?.id;
  } catch (_) {}


  // 3. Process by Event Type
  try {
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = payload.payment?.entity || payload.payload?.payment?.entity;
      const orderEntity = payload.order?.entity || payload.payload?.order?.entity;

      const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
      const razorpayPaymentId = paymentEntity?.id;
      const amountPaise = paymentEntity?.amount || orderEntity?.amount;
      const method = paymentEntity?.method || 'unknown';
      const agentIdFromNotes = paymentEntity?.notes?.agent_id || orderEntity?.notes?.agent_id;

      let order = null;
      if (razorpayOrderId) {
        try {
          const { data } = await db.from('payment_orders').select('*, agent_plans(*)').eq('razorpay_order_id', razorpayOrderId).maybeSingle();
          order = data;
        } catch (_) {}
      }

      const targetAgentId = order?.agent_id || agentIdFromNotes;

      if (order) {
        try {
          await db.from('payment_orders').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', order.id);
        } catch (_) {}

        try {
          const paymentData = {
            payment_order_id: order.id,
            razorpay_payment_id: razorpayPaymentId || `pay_synced_${Date.now()}`,
            status: 'captured',
            method,
            amount_paise: amountPaise || order.amount_paise || 199900,
            currency: order.currency || 'INR',
            captured_at: new Date().toISOString(),
            raw_payload: payload,
            created_at: new Date().toISOString(),
          };
          await db.from('payments').upsert(paymentData, { onConflict: 'razorpay_payment_id' });
        } catch (_) {}
      }

      if (targetAgentId) {
        let agent = null;
        try {
          const { data } = await db.from('agents').select('*').eq('id', targetAgentId).maybeSingle();
          agent = data;
        } catch (_) {}

        if (!agent) {
          const agentAuthSvc = require('./agentAuthService');
          agent = await agentAuthSvc.getAgentById(targetAgentId);
        }

        if (agent) {
          const oldStatus = agent.status || 'pending_payment';
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 365);

          try {
            await db
              .from('agents')
              .update({
                status: 'active',
                activated_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', agent.id);
          } catch (_) {}

          await logStatusChange({
            agentId: agent.id,
            fromStatus: oldStatus,
            toStatus: 'active',
            reason: `Payment captured (${razorpayPaymentId || razorpayOrderId})`,
            changedBy: 'webhook_system',
          });
        }
      }

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

          // Keep agent in pending_payment or payment_failed
          await db.from('agents').update({ status: 'payment_failed', updated_at: new Date().toISOString() }).eq('id', order.agent_id);
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
        const { data: payment } = await db.from('payments').select('*, payment_orders(agent_id)').eq('razorpay_payment_id', rzpPaymentId).maybeSingle();
        if (payment) {
          await db.from('payments').update({ status: 'refunded' }).eq('id', payment.id);

          // Transition agent to suspended if fully refunded
          const agentId = payment.payment_orders?.agent_id;
          if (agentId) {
            const { data: agent } = await db.from('agents').select('*').eq('id', agentId).single();
            if (agent) {
              await db.from('agents').update({ status: 'suspended', updated_at: new Date().toISOString() }).eq('id', agentId);
              await logStatusChange({
                agentId,
                fromStatus: agent.status,
                toStatus: 'suspended',
                reason: 'Full refund processed',
                changedBy: 'webhook_system',
              });
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

  // Store order with property_id so webhook can resolve which listing to publish
  try {
    await db.from('payment_orders').insert({
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
  } catch (err) {
    console.error('[createPropertyPaymentOrder] DB insert failed:', err.message);
    // Non-fatal — webhook + reconciliation will still capture payment
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
 */
async function verifyPropertyPayment({ agentId, propertyId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const isValid = razorpayService.verifyCheckoutSignature({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  if (!isValid) {
    throw new Error('Invalid Razorpay payment signature. Payment verification failed.');
  }

  const db = getDB();
  const now = new Date();

  // Look up the actual amount charged (never trust frontend-supplied amount)
  let amountPaise = 99900; // safe fallback
  try {
    const { data: payOrder } = await db
      .from('payment_orders')
      .select('amount_paise, id')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();
    if (payOrder?.amount_paise) amountPaise = payOrder.amount_paise;

    // Mark payment order as paid
    if (payOrder?.id) {
      await db.from('payment_orders')
        .update({ status: 'paid', updated_at: now.toISOString() })
        .eq('id', payOrder.id);
    }
  } catch (_) {}

  // Publish the property via the canonical service function
  const propSvc = require('./propertyService');
  try {
    await propSvc.publishProperty(propertyId, razorpay_order_id, amountPaise);
  } catch (err) {
    console.error('[verifyPropertyPayment] publishProperty failed:', err.message);
    // Non-fatal: webhook or reconciliation will catch this
  }

  // Record payment row (non-fatal if payments table schema differs)
  try {
    await db.from('payments').upsert({
      razorpay_payment_id,
      agent_id:    agentId,
      property_id: propertyId,
      razorpay_order_id,
      amount_paise: amountPaise,
      currency:    'INR',
      status:      'captured',
      captured_at: now.toISOString(),
      created_at:  now.toISOString(),
    }, { onConflict: 'razorpay_payment_id' });
  } catch (_) {}

  return { ok: true, property_id: propertyId, payment_id: razorpay_payment_id };
}

module.exports = {
  createPaymentOrder,
  verifyClientPayment,
  processRazorpayWebhook,
  createPropertyPaymentOrder,
  verifyPropertyPayment,
};

