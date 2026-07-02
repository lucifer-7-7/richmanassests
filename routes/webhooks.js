'use strict';
/**
 * routes/webhooks.js
 * Cashfree webhook endpoint — raw body capture done upstream in server.js.
 */
const express = require('express');
const router  = express.Router();
const { processWebhook } = require('../services/webhookService');

// POST /webhooks/cashfree
router.post('/cashfree', async (req, res) => {
  const timestamp = req.headers['x-webhook-timestamp'] || '';
  const signature = req.headers['x-webhook-signature']  || '';
  const rawBody   = req.rawBody || JSON.stringify(req.body);

  // Always respond 200 quickly — Cashfree retries on non-2xx
  res.status(200).json({ received: true });

  // Process asynchronously so we don't block the response
  try {
    const result = await processWebhook({ rawBody, timestamp, signature });
    console.log(`[webhook] cashfree: action=${result.action} duplicate=${result.duplicate}`);
  } catch (err) {
    console.error('[webhook] processing error:', err.message);
  }
});

module.exports = router;
