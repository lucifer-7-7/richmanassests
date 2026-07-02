'use strict';
/**
 * services/paymentService.js
 * Cashfree Payments integration — order creation, status polling, refunds.
 * All amounts are in PAISE (integer). ₹999 = 99900 paise.
 */
const crypto = require('crypto');
const { getDB, check } = require('../db/db');

const CF_BASE = process.env.CASHFREE_ENV === 'PRODUCTION'
  ? 'https://api.cashfree.com'
  : 'https://sandbox.cashfree.com';

const CF_HEADERS = () => ({
  'Content-Type': 'application/json',
  'x-client-id': process.env.CASHFREE_APP_ID || '',
  'x-client-secret': process.env.CASHFREE_SECRET_KEY || '',
  'x-api-version': '2023-08-01',
});

/** Convert paise to rupees string for Cashfree API */
const paiseToRs = (p) => (p / 100).toFixed(2);

/** Fetch current active listing fee from DB. */
async function getListingFee() {
  const db = getDB();
  const result = await db
    .from('listing_fee_config')
    .select('amount_paise, currency, label')
    .eq('is_active', true)
    .order('valid_from', { ascending: false })
    .limit(1)
    .single();
  if (result.error || !result.data) return { amount_paise: 99900, currency: 'INR', label: 'Property Listing Fee' };
  return result.data;
}

/** Create a Cashfree payment order for a property listing. Idempotent. */
async function createOrder({ agent, propertyId, propertyName }) {
  const db = getDB();

  // Security: fetch amount from DB, never trust frontend
  const fee = await getListingFee();

  // Check if a live, non-expired order already exists for this property
  const { data: existing } = await db
    .from('payment_orders')
    .select('*')
    .eq('property_id', propertyId)
    .eq('agent_id', agent.id)
    .in('status', ['created', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Reuse if session not yet expired
  if (existing && existing.payment_session_id && existing.session_expires_at) {
    if (new Date(existing.session_expires_at) > new Date()) {
      return existing;
    }
  }

  // Generate idempotency key: unique per (agent, property, attempt)
  const idempotencyKey = `${agent.id}-${propertyId}-${Date.now()}`;
  const internalOrderId = `rma-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  // Insert order record BEFORE calling Cashfree (prevents duplication on timeout)
  const orderRow = {
    internal_order_id: internalOrderId,
    agent_id: agent.id,
    property_id: propertyId,
    amount_paise: fee.amount_paise,
    currency: fee.currency,
    status: 'created',
    idempotency_key: idempotencyKey,
    metadata: JSON.stringify({ property_name: propertyName }),
  };
  const insertResult = await db.from('payment_orders').insert(orderRow).select('*').single();
  const order = check(insertResult, 'createOrder.insert');

  // Call Cashfree API to create the order session
  const cashfreePayload = {
    order_id: internalOrderId,
    order_amount: parseFloat(paiseToRs(fee.amount_paise)),
    order_currency: fee.currency,
    customer_details: {
      customer_id: String(agent.id),
      customer_name: agent.name,
      customer_email: agent.email,
      customer_phone: agent.phone || '9999999999',
    },
    order_meta: {
      return_url: `${process.env.SITE_URL || ''}/agent/payment/status/${internalOrderId}`,
      notify_url: `${process.env.SITE_URL || ''}/webhooks/cashfree`,
    },
    order_note: `Listing fee for: ${propertyName}`,
  };

  let sessionId = null;
  let cfOrderId = null;
  let sessionExpiry = null;

  try {
    const resp = await fetch(`${CF_BASE}/pg/orders`, {
      method: 'POST',
      headers: CF_HEADERS(),
      body: JSON.stringify(cashfreePayload),
    });
    const json = await resp.json();

    if (!resp.ok) {
      throw new Error(`Cashfree API error: ${json.message || resp.statusText}`);
    }

    sessionId  = json.payment_session_id;
    cfOrderId  = json.cf_order_id || json.order_id;
    // Session expires in 15 minutes typically
    sessionExpiry = new Date(Date.now() + 14 * 60 * 1000).toISOString();
  } catch (err) {
    // Mark order as failed if Cashfree call fails
    await db.from('payment_orders').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('internal_order_id', internalOrderId);
    throw err;
  }

  // Update with Cashfree session details
  const updateResult = await db.from('payment_orders')
    .update({
      cashfree_order_id: String(cfOrderId),
      payment_session_id: sessionId,
      session_expires_at: sessionExpiry,
      status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('internal_order_id', internalOrderId)
    .select('*')
    .single();

  return check(updateResult, 'createOrder.update');
}

/** Poll status of an order by internal_order_id. */
async function getOrderStatus(internalOrderId, agentId) {
  const db = getDB();
  const result = await db
    .from('payment_orders')
    .select('internal_order_id, status, amount_paise, currency, payment_method, created_at, property_id')
    .eq('internal_order_id', internalOrderId)
    .eq('agent_id', agentId)
    .single();
  if (result.error) return null;
  return result.data;
}

/** Verify payment status directly from Cashfree API (for reconciliation). */
async function verifyWithCashfree(internalOrderId) {
  try {
    const resp = await fetch(`${CF_BASE}/pg/orders/${internalOrderId}/payments`, {
      headers: CF_HEADERS(),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return Array.isArray(json) ? json[0] : json;
  } catch (_) {
    return null;
  }
}

/** Initiate a Cashfree refund. */
async function initiateRefund(internalOrderId, reason = 'Admin initiated refund') {
  const db = getDB();

  const { data: order } = await db.from('payment_orders').select('*').eq('internal_order_id', internalOrderId).single();
  if (!order) throw new Error('Order not found.');
  if (order.status !== 'paid') throw new Error('Only paid orders can be refunded.');

  const refundId = `refund-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const resp = await fetch(`${CF_BASE}/pg/orders/${internalOrderId}/refunds`, {
    method: 'POST',
    headers: CF_HEADERS(),
    body: JSON.stringify({
      refund_id: refundId,
      refund_amount: parseFloat(paiseToRs(order.amount_paise)),
      refund_note: reason,
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`Cashfree refund error: ${json.message || resp.statusText}`);

  // Update order record
  await db.from('payment_orders').update({
    status: 'refund_initiated',
    refund_id: refundId,
    refund_amount_paise: order.amount_paise,
    refund_status: json.refund_status || 'PENDING',
    updated_at: new Date().toISOString(),
  }).eq('internal_order_id', internalOrderId);

  return { refund_id: refundId, status: json.refund_status };
}

/** Admin: get paginated payment orders. */
async function getAllOrders(limit = 100) {
  const db = getDB();
  const result = await db
    .from('payment_orders')
    .select('*, agents(name, email), agent_properties(name, loc)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return check(result, 'getAllOrders');
}

/** Get orders for a specific agent (for invoice page). */
async function getAgentOrders(agentId) {
  const db = getDB();
  const result = await db
    .from('payment_orders')
    .select('*, agent_properties(name, loc, type)')
    .eq('agent_id', agentId)
    .in('status', ['paid', 'refund_initiated', 'refunded'])
    .order('created_at', { ascending: false });
  return check(result, 'getAgentOrders');
}

module.exports = { getListingFee, createOrder, getOrderStatus, verifyWithCashfree, initiateRefund, getAllOrders, getAgentOrders };
