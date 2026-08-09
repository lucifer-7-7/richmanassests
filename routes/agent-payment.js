'use strict';
/**
 * routes/agent-payment.js
 * Handles Razorpay payment order creation, client verification,
 * payment status polling, and success/failed result pages.
 * Invoice routes are in routes/agent-invoices.js.
 */
const express = require('express');
const router  = express.Router();
const requireAgent = require('../middleware/requireAgent');
const { paymentLimiter } = require('../middleware/rateLimiter');
const { getOrderStatus, getListingFee } = require('../services/paymentService');

const agentPaymentSvc = require('../services/agentPaymentService');

// ── CREATE RAZORPAY PAYMENT ORDER ─────────────────────────────────
// POST /agent/payment/create  { property_id }
router.post('/create', requireAgent, paymentLimiter, async (req, res) => {
  const { property_id } = req.body;
  if (!property_id) return res.status(400).json({ ok: false, error: 'Missing property_id', code: 'MISSING_PROPERTY' });

  try {
    const result = await agentPaymentSvc.createPropertyPaymentOrder({
      agentId: req.agent.id,
      propertyId: property_id,
    });
    res.json(result);
  } catch (err) {
    console.error('[payment/create]', err.message);
    res.status(500).json({ ok: false, error: err.message || 'Could not create payment order.', code: 'PAYMENT_CREATE_FAILED' });
  }
});

// ── VERIFY RAZORPAY PAYMENT ──────────────────────────────────────
// POST /agent/payment/verify
// Rate-limited: this endpoint is the replay target, so bound how fast an attacker can
// probe order/property combinations even though each one is now rejected.
router.post('/verify', requireAgent, paymentLimiter, async (req, res) => {
  const { property_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  try {
    const result = await agentPaymentSvc.verifyPropertyPayment({
      agentId: req.agent.id,
      propertyId: property_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    res.json(result);
  } catch (err) {
    console.error('[payment/verify]', err.message);
    res.status(400).json({ ok: false, error: err.message });
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

module.exports = router;
