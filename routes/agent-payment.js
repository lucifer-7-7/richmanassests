'use strict';
/**
 * routes/agent-payment.js
 * Handles payment creation, status polling, success/fail pages, and invoices.
 */
const express = require('express');
const router  = express.Router();
const requireAgent = require('../middleware/requireAgent');
const { paymentLimiter } = require('../middleware/rateLimiter');
const {
  createOrder, getOrderStatus, getAgentOrders, getListingFee, initiateRefund,
} = require('../services/paymentService');
const { getAgentProperty, markPaymentPending } = require('../services/propertyService');

// ── CREATE PAYMENT ORDER ─────────────────────────────────────────
// POST /agent/payment/create  { property_id }
router.post('/create', requireAgent, paymentLimiter, async (req, res) => {
  const { property_id } = req.body;
  if (!property_id) return res.status(400).json({ ok: false, error: 'Missing property_id', code: 'MISSING_PROPERTY' });

  try {
    // Ownership check
    const prop = await getAgentProperty(property_id, req.agent.id);
    if (!prop) return res.status(403).json({ ok: false, error: 'Property not found.', code: 'NOT_FOUND' });

    // Status gate — only allow payment for draft or failed
    if (!['draft','payment_pending','payment_failed'].includes(prop.status)) {
      if (prop.status === 'published') return res.status(409).json({ ok: false, error: 'This listing is already published.', code: 'ALREADY_PAID' });
      return res.status(409).json({ ok: false, error: `Cannot pay for a listing in "${prop.status}" status.`, code: 'INVALID_STATUS' });
    }

    // Mark as payment_pending before opening checkout
    await markPaymentPending(property_id);

    // Create / reuse Cashfree order
    const order = await createOrder({ agent: req.agent, propertyId: property_id, propertyName: prop.name });

    res.json({
      ok: true,
      data: {
        payment_session_id: order.payment_session_id,
        internal_order_id:  order.internal_order_id,
        amount_paise:       order.amount_paise,
        currency:           order.currency,
      },
    });
  } catch (err) {
    console.error('[payment/create]', err.message);
    res.status(500).json({ ok: false, error: 'Could not create payment order. Please try again.', code: 'PAYMENT_CREATE_FAILED' });
  }
});

// ── PAYMENT STATUS PAGE (redirect target after checkout) ─────────
// GET /agent/payment/status/:orderId
router.get('/status/:orderId', requireAgent, async (req, res) => {
  const { orderId } = req.params;
  try {
    const order = await getOrderStatus(orderId, req.agent.id);
    if (!order) return res.status(404).render('404', { title: 'Order not found | RichManAssets' });

    const fee = await getListingFee();

    res.render('agent/payment-status', {
      title: 'Payment Status | RichManAssets Agent',
      robots: 'noindex,nofollow',
      order,
      feeDisplay: `₹${(order.amount_paise / 100).toLocaleString('en-IN')}`,
      agent: req.agent,
    });
  } catch (err) {
    console.error('[payment/status]', err.message);
    res.status(500).send('Server error');
  }
});

// ── PAYMENT STATUS API (polled by frontend) ──────────────────────
// GET /agent/payment/api-status/:orderId
router.get('/api-status/:orderId', requireAgent, async (req, res) => {
  try {
    const order = await getOrderStatus(req.params.orderId, req.agent.id);
    if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
    res.json({ ok: true, status: order.status, property_id: order.property_id });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ── SUCCESS PAGE ────────────────────────────────────────────────
// GET /agent/payment/success?order_id=...
router.get('/success', requireAgent, async (req, res) => {
  const orderId = req.query.order_id;
  try {
    const order = orderId ? await getOrderStatus(orderId, req.agent.id) : null;
    res.render('agent/payment-success', {
      title: 'Payment Successful | RichManAssets Agent',
      robots: 'noindex,nofollow',
      order,
      agent: req.agent,
    });
  } catch (_) {
    res.render('agent/payment-success', { title: 'Payment Successful | RichManAssets Agent', robots: 'noindex,nofollow', order: null, agent: req.agent });
  }
});

// ── FAILED PAGE ─────────────────────────────────────────────────
// GET /agent/payment/failed?order_id=...
router.get('/failed', requireAgent, async (req, res) => {
  const orderId = req.query.order_id;
  try {
    const order = orderId ? await getOrderStatus(orderId, req.agent.id) : null;
    res.render('agent/payment-failed', {
      title: 'Payment Failed | RichManAssets Agent',
      robots: 'noindex,nofollow',
      order,
      agent: req.agent,
    });
  } catch (_) {
    res.render('agent/payment-failed', { title: 'Payment Failed | RichManAssets Agent', robots: 'noindex,nofollow', order: null, agent: req.agent });
  }
});

// ── INVOICES LIST ───────────────────────────────────────────────
// GET /agent/invoices
router.get('/', requireAgent, async (req, res) => {
  try {
    const orders = await getAgentOrders(req.agent.id);
    res.render('agent/invoices', {
      title: 'My Invoices | RichManAssets Agent',
      robots: 'noindex,nofollow',
      orders,
      agent: req.agent,
    });
  } catch (err) {
    console.error('[invoices]', err.message);
    res.render('agent/invoices', { title: 'My Invoices', robots: 'noindex,nofollow', orders: [], agent: req.agent });
  }
});

// ── INVOICE DETAIL (printable) ──────────────────────────────────
// GET /agent/invoices/:orderId
router.get('/:orderId', requireAgent, async (req, res) => {
  try {
    const orders = await getAgentOrders(req.agent.id);
    const order = orders.find(o => o.internal_order_id === req.params.orderId);
    if (!order) return res.status(404).send('Invoice not found');
    res.render('agent/invoice-detail', {
      title: `Invoice ${order.internal_order_id} | RichManAssets`,
      robots: 'noindex,nofollow',
      order,
      agent: req.agent,
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;
