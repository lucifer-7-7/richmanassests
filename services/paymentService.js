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

/** Admin: get paginated payment orders & generated invoices. */
async function getAllOrders(limit = 100) {
  const db = getDB();
  try {
    const { data: dbOrders } = await db
      .from('payment_orders')
      .select('*, agents(name, email, phone), agent_properties(name, loc)')
      .order('created_at', { ascending: false })
      .limit(limit);

    const allOrders = dbOrders || [];

    // Also include invoices from published properties in agent_properties
    const { data: publishedProps } = await db
      .from('agent_properties')
      .select('*, agents(name, email, phone)')
      .eq('status', 'published');

    if (publishedProps && publishedProps.length > 0) {
      for (const p of publishedProps) {
        const orderId = p.paid_order_id || `inv-${p.id}`;
        const exists = allOrders.find(o => o.internal_order_id === orderId || o.razorpay_order_id === orderId || o.property_id === p.id);
        if (!exists) {
          allOrders.push({
            id: orderId,
            internal_order_id: orderId,
            razorpay_order_id: orderId,
            agent_id: p.agent_id,
            property_id: p.id,
            amount_paise: p.fee_paid_paise || 99900,
            currency: 'INR',
            purpose: 'property_listing',
            status: 'paid',
            created_at: p.published_at || p.created_at || new Date().toISOString(),
            agents: p.agents || { name: 'Agent #' + p.agent_id, email: 'agent@richmanassets.com' },
            agent_properties: { name: p.name, loc: p.loc, type: p.type },
          });
        }
      }
    }

    // Ensure agent details and order IDs are populated on all items
    for (const o of allOrders) {
      if (!o.internal_order_id) o.internal_order_id = o.razorpay_order_id || o.cashfree_order_id || String(o.id);
      if (!o.agents && o.agent_id) {
        try {
          const { data: ag } = await db.from('agents').select('name, email, phone').eq('id', o.agent_id).maybeSingle();
          if (ag) o.agents = ag;
        } catch (_) {}
      }
      if (!o.agent_properties && o.property_id) {
        try {
          const { data: prop } = await db.from('agent_properties').select('name, loc, type').eq('id', o.property_id).maybeSingle();
          if (prop) o.agent_properties = prop;
        } catch (_) {}
      }
      if (!o.agent_properties && o.metadata) {
        try {
          const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : o.metadata;
          if (meta && (meta.property_name || meta.name)) {
            o.agent_properties = { name: meta.property_name || meta.name, loc: meta.loc || '' };
          }
        } catch (_) {}
      }
    }

    return allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  } catch (err) {
    console.error('getAllOrders error:', err.message);
    return [];
  }
}

/** Get orders for a specific agent (for invoice page). */
async function getAgentOrders(agentId) {
  const db = getDB();
  try {
    const { data: orders } = await db
      .from('payment_orders')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    const invoiceList = orders ? orders.filter(o => ['paid', 'captured', 'refund_initiated', 'refunded'].includes(o.status)) : [];

    // Also include published properties owned by this agent
    const { data: publishedProps } = await db
      .from('agent_properties')
      .select('*')
      .eq('agent_id', agentId)
      .eq('status', 'published');

    if (publishedProps && publishedProps.length > 0) {
      for (const p of publishedProps) {
        const existingInv = invoiceList.find(o => o.property_id === p.id || (p.paid_order_id && o.razorpay_order_id === p.paid_order_id));
        if (!existingInv) {
          invoiceList.push({
            id: p.paid_order_id || `inv-${p.id}`,
            internal_order_id: p.paid_order_id || `inv-${p.id}`,
            razorpay_order_id: p.paid_order_id || `order_${p.id}`,
            agent_id: agentId,
            property_id: p.id,
            amount_paise: p.fee_paid_paise || 99900,
            currency: 'INR',
            purpose: 'property_listing',
            status: 'paid',
            created_at: p.published_at || p.created_at || new Date().toISOString(),
            agent_properties: { name: p.name, loc: p.loc, type: p.type },
          });
        }
      }
    }

    for (const o of invoiceList) {
      if (!o.internal_order_id) o.internal_order_id = o.razorpay_order_id || o.id;
      if (o.property_id && !o.agent_properties) {
        try {
          const { data: prop } = await db.from('agent_properties').select('name, loc, type').eq('id', o.property_id).maybeSingle();
          if (prop) o.agent_properties = prop;
        } catch (_) {}
      }
    }

    return invoiceList;
  } catch (err) {
    console.error('getAgentOrders error:', err.message);
    return [];
  }
}



module.exports = { getListingFee, createOrder, getOrderStatus, verifyWithCashfree, initiateRefund, getAllOrders, getAgentOrders };
