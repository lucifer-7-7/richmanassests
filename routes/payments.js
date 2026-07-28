'use strict';

/**
 * routes/payments.js
 * Express routes for Payment Order creation, Client verification, and Status polling.
 */

const express = require('express');
const router = express.Router();
const agentPaymentService = require('../services/agentPaymentService');
const requireAgent = require('../middleware/requireAgent');

/**
 * POST /payments/create-order
 * Body: { plan_id, purpose }
 */
router.post('/create-order', requireAgent, async (req, res) => {
  try {
    const agentId = req.agent.id;
    const { plan_id, purpose } = req.body;

    const result = await agentPaymentService.createPaymentOrder({
      agentId,
      planId: plan_id,
      purpose: purpose || 'signup',
    });

    res.json({
      ok: true,
      data: result,
    });
  } catch (err) {
    console.error('[POST /payments/create-order Error]:', err.message);
    res.status(500).json({
      ok: false,
      error: err.message || 'Failed to create payment order.',
      code: err.code || 'CREATE_ORDER_FAILED',
    });
  }
});

/**
 * POST /payments/verify
 * Client-Side verification of Razorpay checkout signature.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
router.post('/verify', requireAgent, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required Razorpay payment signature parameters.',
      });
    }

    const result = await agentPaymentService.verifyClientPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (!result.success) {
      return res.status(400).json({
        ok: false,
        error: 'Payment signature verification failed. Tamper attempt logged.',
        code: result.reason,
      });
    }

    res.json({
      ok: true,
      message: 'Payment signature verified. Account activation in progress...',
      data: result,
    });
  } catch (err) {
    console.error('[POST /payments/verify Error]:', err.message);
    res.status(500).json({ ok: false, error: 'Verification failed.' });
  }
});

/**
 * GET /payments/status/:order_id
 * Status polling endpoint for Agent Checkout UI
 */
router.get('/status/:order_id', requireAgent, async (req, res) => {
  try {
    const db = require('../db/db').getDB();
    const { data: order } = await db
      .from('payment_orders')
      .select('id, status, razorpay_order_id, amount_paise, currency, updated_at, agents(status)')
      .eq('razorpay_order_id', req.params.order_id)
      .eq('agent_id', req.agent.id)
      .maybeSingle();

    if (!order) {
      return res.status(404).json({ ok: false, error: 'Order not found' });
    }

    res.json({
      ok: true,
      data: {
        order_status: order.status,
        agent_status: order.agents?.status || 'pending_payment',
        is_active: order.agents?.status === 'active',
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
