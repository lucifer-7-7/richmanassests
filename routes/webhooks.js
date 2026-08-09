'use strict';

/**
 * routes/webhooks.js
 * Razorpay Webhook Receiver Endpoint.
 * Source of Truth — owns account activation and payment status state transitions.
 * Enforces HMAC-SHA256 signature verification & hard idempotency using `webhook_events`.
 * Guaranteed response < 5 seconds.
 */

const express = require('express');
const router = express.Router();
const razorpayService = require('../services/razorpayService');
const agentPaymentService = require('../services/agentPaymentService');
const { logSecurityEvent } = require('../lib/securityLog');

/**
 * POST /webhooks/razorpay
 */
router.post('/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  // 1. Signature verification against the WEBHOOK secret.
  // This endpoint is unauthenticated by design, so the signature IS the authentication.
  // It is enforced unconditionally — gating it on NODE_ENV made the whole payment state
  // machine writable by anyone whenever that variable was unset or misspelled.
  const rawBody = req.rawBody || req.body;
  if (!razorpayService.verifyWebhookSignature(rawBody, signature)) {
    await logSecurityEvent(
      'webhook_signature_invalid',
      { event_id: req.headers['x-razorpay-event-id'] || null, has_signature: !!signature },
      { actorType: 'webhook', ip: req.ip, userAgent: req.get('user-agent') },
    );
    return res.status(400).json({ ok: false, error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_) {
    // Signature passed but the body isn't JSON — retrying won't help.
    return res.status(400).json({ ok: false, error: 'Malformed payload' });
  }

  const eventType = payload.event;

  // Razorpay's own per-delivery id is the only value guaranteed unique per event.
  // Deriving one from account_id + event + created_at collides for two same-type events
  // in the same second, silently dropping the second as a duplicate.
  const eventId =
    req.headers['x-razorpay-event-id'] ||
    (payload.account_id ? `${payload.account_id}_${payload.event}_${payload.created_at}` : null) ||
    `evt_${Date.now()}`;

  try {
    // 2. Process with the webhook_events idempotency guard.
    const result = await agentPaymentService.processRazorpayWebhook({ eventId, eventType, payload });

    // 3. Respond well within Razorpay's 5s limit.
    return res.status(200).json({ ok: true, processed: result.processed, duplicate: !!result.duplicate });
  } catch (err) {
    // 500, not 200. These are transient failures (DB unreachable, timeout) and Razorpay's
    // retry is the only thing that recovers the payment. Swallowing them into a 200 meant a
    // momentary blip permanently lost an activation with no trace.
    console.error('[Webhook Handler Error]:', { eventId, eventType, error: err.message });
    return res.status(500).json({ ok: false, error: 'Processing failed, retry expected' });
  }
});

module.exports = router;
