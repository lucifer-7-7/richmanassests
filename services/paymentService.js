'use strict';
/**
 * services/paymentService.js
 * Razorpay order/status/refund helpers shared by admin + agent invoice routes.
 * Order creation and client-side verification live in agentPaymentService.js;
 * this module handles fee lookup, status polling, and admin refunds.
 * All amounts are in PAISE (integer). ₹999 = 99900 paise.
 */
const { getDB } = require('../db/db');
const razorpayService = require('./razorpayService');

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
  // No hardcoded fallback. A guessed price that happens to be wrong charges the customer
  // the wrong amount and looks like a successful sale — failing is strictly safer.
  if (result.error || !result.data) {
    console.error('[getListingFee] no active listing_fee_config row:', result.error?.message || 'empty result');
    throw new Error('Listing fee is not configured. Please contact support.');
  }
  return result.data;
}

/** Poll status of an order by Razorpay order id, scoped to the requesting agent. */
async function getOrderStatus(razorpayOrderId, agentId) {
  const db = getDB();
  const result = await db
    .from('payment_orders')
    .select('razorpay_order_id, status, amount_paise, currency, payment_method, created_at, property_id')
    .eq('razorpay_order_id', razorpayOrderId)
    .eq('agent_id', agentId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return result.data;
}

/**
 * Admin: refund a paid property-listing order via Razorpay.
 *
 * `amountPaise` is optional and is clamped to the captured amount — a caller can refund
 * less (partial) but never more than was actually taken.
 */
async function initiateRefund(razorpayOrderId, reason = 'Admin initiated refund', amountPaise = null, initiatedBy = 'admin') {
  const db = getDB();

  const { data: order } = await db.from('payment_orders').select('*').eq('razorpay_order_id', razorpayOrderId).maybeSingle();
  if (!order) throw new Error('Order not found.');
  if (order.status !== 'paid') throw new Error('Only paid orders can be refunded.');

  const { data: payment } = await db
    .from('payments')
    .select('id, razorpay_payment_id, amount_paise, status')
    .eq('razorpay_order_id', razorpayOrderId)
    .eq('status', 'captured')
    .maybeSingle();
  if (!payment?.razorpay_payment_id) throw new Error('No captured payment found for this order.');

  const capturedPaise = payment.amount_paise || order.amount_paise;
  const requestedPaise = Number.isInteger(amountPaise) && amountPaise > 0 ? amountPaise : capturedPaise;
  const refundPaise = Math.min(requestedPaise, capturedPaise);

  const refund = await razorpayService.initiateRazorpayRefund({
    razorpay_payment_id: payment.razorpay_payment_id,
    amount_paise: refundPaise,
    notes: { reason },
  });

  // Written before the status updates so the refund.processed webhook has a row to match.
  // Without this the webhook's `UPDATE refunds ... WHERE razorpay_refund_id = ?` matched
  // nothing and the refund never reached a terminal state locally.
  const refundRow = await db.from('refunds').insert({
    payment_id:         payment.id,
    razorpay_refund_id: refund.id,
    amount_paise:       refundPaise,
    status:             refund.status === 'processed' ? 'processed' : 'pending',
    reason,
    initiated_by:       initiatedBy,
    created_at:         new Date().toISOString(),
  });
  if (refundRow.error) {
    // The money has already moved at this point; losing the local record is bad but
    // reversing is worse. Log loudly so it can be reconciled by hand.
    console.error('[initiateRefund] refunds insert failed AFTER Razorpay refund succeeded:', {
      razorpay_refund_id: refund.id, error: refundRow.error.message,
    });
  }

  await db.from('payment_orders').update({
    status: 'refund_initiated',
    refund_id: refund.id,
    refund_amount_paise: refundPaise,
    refund_status: refund.status || 'processed',
    updated_at: new Date().toISOString(),
  }).eq('razorpay_order_id', razorpayOrderId);

  await db.from('payments').update({ status: 'refunded' }).eq('razorpay_payment_id', payment.razorpay_payment_id);

  return { refund_id: refund.id, status: refund.status, amount_paise: refundPaise };
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

    // Enrich with the actual captured payment record (method, razorpay_payment_id) —
    // this lives in `payments`, not `payment_orders`, so the list is inaccurate without it.
    const orderIdsForLookup = allOrders.map(o => o.razorpay_order_id).filter(Boolean);
    let paymentsByOrderId = {};
    if (orderIdsForLookup.length) {
      try {
        const { data: capturedPayments } = await db
          .from('payments')
          .select('razorpay_order_id, razorpay_payment_id, method, status, captured_at')
          .in('razorpay_order_id', orderIdsForLookup)
          .eq('status', 'captured');
        (capturedPayments || []).forEach(p => { paymentsByOrderId[p.razorpay_order_id] = p; });
      } catch (_) {}
    }

    // Ensure agent details and order IDs are populated on all items
    for (const o of allOrders) {
      if (!o.internal_order_id) o.internal_order_id = o.razorpay_order_id || String(o.id);
      const capturedPayment = paymentsByOrderId[o.razorpay_order_id];
      if (capturedPayment) {
        o.payment_method = capturedPayment.method;
        o.razorpay_payment_id = capturedPayment.razorpay_payment_id;
      }
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

    const orderIdsForLookup = invoiceList.map(o => o.razorpay_order_id).filter(Boolean);
    let paymentsByOrderId = {};
    if (orderIdsForLookup.length) {
      try {
        const { data: capturedPayments } = await db
          .from('payments')
          .select('razorpay_order_id, razorpay_payment_id, method, status')
          .in('razorpay_order_id', orderIdsForLookup)
          .eq('status', 'captured');
        (capturedPayments || []).forEach(p => { paymentsByOrderId[p.razorpay_order_id] = p; });
      } catch (_) {}
    }

    for (const o of invoiceList) {
      if (!o.internal_order_id) o.internal_order_id = o.razorpay_order_id || o.id;
      const capturedPayment = paymentsByOrderId[o.razorpay_order_id];
      if (capturedPayment) {
        o.payment_method = capturedPayment.method;
        o.razorpay_payment_id = capturedPayment.razorpay_payment_id;
      }
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



module.exports = { getListingFee, getOrderStatus, initiateRefund, getAllOrders, getAgentOrders };
