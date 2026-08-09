'use strict';

/**
 * services/razorpayService.js
 * Comprehensive integration with Razorpay Payments API.
 * Handles Order creation, HMAC-SHA256 checkout signature verification,
 * Webhook signature verification, Refunds, and Reconciliation lookups.
 */

const crypto = require('crypto');
const Razorpay = require('razorpay');

// No fallbacks. A missing key must fail loudly at boot (see server.js) rather than
// silently running on a constant that is public in this repo's history.
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// Initialize Razorpay SDK instance
let razorpayInstance = null;

function getRazorpayInstance() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: KEY_ID,
      key_secret: KEY_SECRET,
    });
  }
  return razorpayInstance;
}

/**
 * Create Razorpay Order
 * @param {Object} opts { amount_paise, currency, receipt, notes }
 * @returns {Promise<Object>} Razorpay Order Object
 */
async function createRazorpayOrder({ amount_paise, currency = 'INR', receipt, notes = {} }) {
  try {
    const rzp = getRazorpayInstance();
    const orderOptions = {
      amount: amount_paise, // Razorpay amount is in paise (1 INR = 100 paise)
      currency,
      receipt: receipt || `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      notes,
    };

    const order = await rzp.orders.create(orderOptions);
    return order;
  } catch (err) {
    // Never fabricate an order. A failure here must surface — an invented order id
    // would be recorded as real and could never be reconciled against Razorpay.
    console.error('[Razorpay Order Creation Error]:', err.message || err);
    throw err;
  }
}

/**
 * Verify Client-Side Checkout Signature
 * Signature = HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, KEY_SECRET)
 */
function verifyCheckoutSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false;
  }
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  // Constant time string comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));
  } catch (_) {
    return false;
  }
}

/**
 * Verify Webhook Signature against X-Razorpay-Signature header
 * Signature = HMAC-SHA256(rawBodyString, WEBHOOK_SECRET)
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  try {
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch (_) {
    return false;
  }
}

/**
 * Initiate Refund via Razorpay API
 */
async function initiateRazorpayRefund({ razorpay_payment_id, amount_paise, notes = {} }) {
  try {
    const rzp = getRazorpayInstance();
    const refundOptions = {
      amount: amount_paise,
      notes,
    };
    const refund = await rzp.payments.refund(razorpay_payment_id, refundOptions);
    return refund;
  } catch (err) {
    // Never fabricate a refund — the admin UI would report money returned that never moved.
    console.error('[Razorpay Refund Error]:', err.message || err);
    throw err;
  }
}

/**
 * Fetch Order details from Razorpay API for reconciliation
 */
async function fetchRazorpayOrder(razorpay_order_id) {
  try {
    const rzp = getRazorpayInstance();
    const order = await rzp.orders.fetch(razorpay_order_id);
    return order;
  } catch (err) {
    // Reconciliation calls this per open order. Swallowing every error to null silently
    // no-ops the whole healing pass, so log it — the caller treats null as "skip this one".
    console.error(`[Razorpay Order Fetch Error] ${razorpay_order_id}:`, err.message || err);
    return null;
  }
}

module.exports = {
  getRazorpayInstance,
  createRazorpayOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  initiateRazorpayRefund,
  fetchRazorpayOrder,
  KEY_ID,
};
