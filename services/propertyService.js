'use strict';
/**
 * services/propertyService.js
 * Property lifecycle actions triggered by payment webhooks.
 *
 * publishProperty  — called on PAYMENT_SUCCESS: sets status → published
 * markPaymentFailed — called on PAYMENT_FAILED
 * markRefunded     — called on REFUND_STATUS SUCCESS
 */
const { getDB, check } = require('../db/db');

const LISTING_DURATION_DAYS = 365; // 1-year active listing on payment

/**
 * Publish an agent property after successful payment.
 * Sets status = 'published', records published_at and expiry_at.
 */
async function publishProperty(propertyId, internalOrderId, amountPaise) {
  const db = getDB();

  const now = new Date();
  const expiryAt = new Date(now.getTime() + LISTING_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const result = await db
    .from('agent_properties')
    .update({
      status:            'published',
      published_at:      now.toISOString(),
      expiry_at:         expiryAt.toISOString(),
      payment_order_id:  internalOrderId || null,
      updated_at:        now.toISOString(),
    })
    .eq('id', propertyId)
    .select('id, status, published_at, expiry_at')
    .single();

  if (result.error) {
    console.error('[propertyService] publishProperty error:', result.error.message);
    throw new Error(`Failed to publish property ${propertyId}: ${result.error.message}`);
  }

  console.log(`[propertyService] Property ${propertyId} published until ${expiryAt.toISOString()}`);
  return result.data;
}

/**
 * Mark property as payment_failed (keeps it in draft-like state for retry).
 */
async function markPaymentFailed(propertyId) {
  const db = getDB();

  const result = await db
    .from('agent_properties')
    .update({
      status:     'payment_failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', propertyId)
    .select('id, status')
    .single();

  if (result.error) {
    console.error('[propertyService] markPaymentFailed error:', result.error.message);
    // Non-fatal — log but don't crash the webhook handler
    return null;
  }

  console.log(`[propertyService] Property ${propertyId} marked payment_failed`);
  return result.data;
}

/**
 * Mark property as unpublished after a successful refund.
 */
async function markRefunded(propertyId) {
  const db = getDB();

  const result = await db
    .from('agent_properties')
    .update({
      status:     'refunded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', propertyId)
    .select('id, status')
    .single();

  if (result.error) {
    console.error('[propertyService] markRefunded error:', result.error.message);
    return null;
  }

  console.log(`[propertyService] Property ${propertyId} marked refunded`);
  return result.data;
}

module.exports = { publishProperty, markPaymentFailed, markRefunded };
