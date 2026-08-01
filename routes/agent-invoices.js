'use strict';
/**
 * routes/agent-invoices.js
 * Invoice list and printable invoice detail for agents.
 * Mounted at /agent/invoices in server.js.
 */
const express = require('express');
const router  = express.Router();
const requireAgent = require('../middleware/requireAgent');
const { getAgentOrders } = require('../services/paymentService');

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

// GET /agent/invoices/:orderId — printable invoice detail
router.get('/:orderId', requireAgent, async (req, res) => {
  try {
    const orders = await getAgentOrders(req.agent.id);
    const orderId = req.params.orderId;
    const order = orders.find(o => 
      String(o.internal_order_id) === String(orderId) || 
      String(o.id) === String(orderId) || 
      String(o.razorpay_order_id) === String(orderId) || 
      String(o.cashfree_order_id) === String(orderId) ||
      String(o.property_id) === String(orderId)
    );
    if (!order) return res.status(404).send('Invoice not found');
    res.render('agent/invoice-detail', {
      title: `Invoice ${order.internal_order_id || order.id} | RichManAssets`,
      robots: 'noindex,nofollow',
      order,
      agent: req.agent,
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;
