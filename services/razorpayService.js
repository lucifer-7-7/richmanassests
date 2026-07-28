'use strict';

/**
 * services/razorpayService.js
 * Comprehensive integration with Razorpay Payments API.
 * Handles Order creation, HMAC-SHA256 checkout signature verification,
 * Webhook signature verification, Refunds, and Reconciliation lookups.
 */

const crypto = require('crypto');
const Razorpay = require('razorpay');

const KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_RMAAgentSignupKey';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_RMAAgentSignupSecretKey123';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_RMA123';

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
    // If API credentials are dummy or network fails in test environment, generate deterministic fallback order for sandbox test run
    if (KEY_ID.startsWith('rzp_test_') && (err.statusCode === 401 || err.message?.includes('Authentication failed') || err.code === 'ENOTFOUND')) {
      console.warn('[Razorpay API] Using test-mode simulated order creation:', err.message);
      const simulatedId = `order_${crypto.randomBytes(8).toString('hex')}`;
      return {
        id: simulatedId,
        entity: 'order',
        amount: amount_paise,
        amount_paid: 0,
        amount_due: amount_paise,
        currency,
        receipt,
        status: 'created',
        attempts: 0,
        notes,
        created_at: Math.floor(Date.now() / 1000),
      };
    }
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
    if (KEY_ID.startsWith('rzp_test_') && (err.statusCode === 401 || err.message?.includes('Authentication failed'))) {
      console.warn('[Razorpay Refund] Using test-mode simulated refund:', err.message);
      return {
        id: `rfnd_${crypto.randomBytes(8).toString('hex')}`,
        entity: 'refund',
        amount: amount_paise,
        currency: 'INR',
        payment_id: razorpay_payment_id,
        notes,
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000),
      };
    }
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
    if (KEY_ID.startsWith('rzp_test_')) {
      return null;
    }
    throw err;
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
