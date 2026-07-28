'use strict';
require('dotenv').config();

/**
 * test/payment-system.test.js
 * End-to-End Automated Verification Script for Razorpay Payments & Agent System.
 */


const crypto = require('crypto');
const razorpayService = require('../services/razorpayService');
const agentAuthService = require('../services/agentAuthService');
const agentPaymentService = require('../services/agentPaymentService');
const reconciliationService = require('../services/reconciliationService');
const adminAnalyticsService = require('../services/adminAnalyticsService');

async function runTests() {
  console.log('====================================================');
  console.log('STARTING END-TO-END RAZORPAY PAYMENT SYSTEM TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: Checkout HMAC-SHA256 Signature Verification
  console.log('--- Test 1: Checkout Signature Verification ---');
  const secret = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_RMAAgentSignupSecretKey123';
  const orderId = 'order_test_12345';
  const paymentId = 'pay_test_67890';
  const validSig = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

  const checkValid = razorpayService.verifyCheckoutSignature({
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: validSig,
  });
  assert(checkValid === true, 'Valid checkout signature must verify as true');

  const checkTampered = razorpayService.verifyCheckoutSignature({
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: 'tampered_signature_string_here_12345',
  });
  assert(checkTampered === false, 'Tampered checkout signature must verify as false');

  // TEST 2: Webhook HMAC-SHA256 Signature Verification
  console.log('\n--- Test 2: Webhook Signature Verification ---');
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_RMA123';
  const rawBody = JSON.stringify({ event: 'payment.captured', contains: ['payment'] });
  const validWebhookSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  const checkWebhookValid = razorpayService.verifyWebhookSignature(rawBody, validWebhookSig);
  assert(checkWebhookValid === true, 'Valid webhook signature must verify as true');

  const checkWebhookInvalid = razorpayService.verifyWebhookSignature(rawBody, 'invalid_sig');
  assert(checkWebhookInvalid === false, 'Invalid webhook signature must verify as false');

  // TEST 3: Webhook Event Processing & Idempotency
  console.log('\n--- Test 3: Idempotency Ledger Check ---');
  const eventId = `evt_test_${Date.now()}`;
  const payload = {
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: `pay_unit_${Date.now()}`, order_id: 'order_unit_123', amount: 199900, status: 'captured' } },
    },
  };

  const res1 = await agentPaymentService.processRazorpayWebhook({ eventId, eventType: 'payment.captured', payload });
  assert(res1.ok === true && res1.processed === true, 'First webhook delivery processes successfully');

  const res2 = await agentPaymentService.processRazorpayWebhook({ eventId, eventType: 'payment.captured', payload });
  assert(res2.ok === true && res2.duplicate === true, 'Duplicate webhook delivery returns duplicate flag immediately without reprocessing');



  // TEST 4: Reconciliation Cron Pass Execution
  console.log('\n--- Test 4: Reconciliation Engine Execution ---');
  const reconResult = await reconciliationService.runReconciliationPass();
  assert(reconResult && reconResult.last_run_at !== null, 'Reconciliation pass executes cleanly');

  // TEST 5: Admin Analytics Calculations
  console.log('\n--- Test 5: Admin Analytics Engine ---');
  const agentAnalytics = await adminAnalyticsService.getAgentAnalytics();
  assert(typeof agentAnalytics.total_agents === 'number', 'Agent Analytics computes total_agents count');

  const enquiryAnalytics = await adminAnalyticsService.getEnquiryAnalytics();
  assert(typeof enquiryAnalytics.total_enquiries === 'number', 'Enquiry Analytics computes total_enquiries count');

  const paymentAnalytics = await adminAnalyticsService.getPaymentAnalytics();
  assert(typeof paymentAnalytics.gross_revenue_rs === 'number', 'Payment Analytics computes gross_revenue_rs');

  // TEST 6: Full End-to-End Agent Lifecycle State Machine
  console.log('\n--- Test 6: Agent Lifecycle State Machine ---');
  const testEmail = `agent_test_${Date.now()}@example.com`;
  const testPhone = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;

  try {
    // 1. Signup -> draft
    const newAgent = await agentAuthService.registerAgent({
      name: 'Test Partner Agent',
      email: testEmail,
      phone: testPhone,
      password: 'password123',
    });
    assert(newAgent.status === 'draft', 'New agent starts in draft status');

    // 2. Verification -> pending_payment
    const verifiedAgent = await agentAuthService.verifyAgentAccount(newAgent.id);
    assert(verifiedAgent.status === 'pending_payment', 'OTP verification transitions status draft -> pending_payment');

    // 3. Create Razorpay Payment Order
    const orderData = await agentPaymentService.createPaymentOrder({
      agentId: newAgent.id,
      purpose: 'signup',
    });
    assert(orderData.razorpay_order_id.length > 0, 'Razorpay order creation generates valid order_id');

    // 4. Webhook payment.captured -> active
    const webhookEventId = `evt_lifecycle_${Date.now()}`;
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_lifecycle_${Date.now()}`,
            order_id: orderData.razorpay_order_id,
            amount: orderData.amount_paise,
            status: 'captured',
            method: 'upi',
            notes: { agent_id: newAgent.id },
          },
        },
      },
    };


    const webhookRes = await agentPaymentService.processRazorpayWebhook({
      eventId: webhookEventId,
      eventType: 'payment.captured',
      payload: webhookPayload,
    });
    assert(webhookRes.ok === true, 'Webhook captured payment processed successfully');

    const activatedAgent = await agentAuthService.getAgentById(newAgent.id);
    assert(activatedAgent.status === 'active', 'Payment captured webhook transitions agent status pending_payment -> active');

    // 5. Admin manual override -> suspended
    const suspendedAgent = await agentAuthService.updateAgentStatus(newAgent.id, 'suspended', 'Admin dispute check', 'admin_unit_test');
    assert(suspendedAgent.status === 'suspended', 'Admin status override transitions active -> suspended');

    // TEST 7: Login Logging, Password Reset, Session Revocation & Audit
    console.log('\n--- Test 7: Agent Security & Audit System ---');

    // 1. Record Login Log
    const loginLog = await agentAuthService.recordLoginLog({
      agentId: newAgent.id,
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      status: 'success',
    });
    assert(loginLog.device_type === 'Mobile', 'User Agent parsing identifies Mobile device');

    // 2. Full Audit Data
    const fullAudit = await agentAuthService.getAgentFullAudit(newAgent.id);
    assert(fullAudit.login_logs.length > 0, 'Audit retrieves login activity logs');
    assert(fullAudit.status_history.length > 0, 'Audit retrieves status transition history');

    // 3. Session Revocation Check
    const oldSessionTime = Date.now() - 10000;
    await agentAuthService.revokeAgentSessions({ agentId: newAgent.id, adminUser: 'admin_test' });
    const isRevoked = agentAuthService.isSessionRevoked(newAgent.id, oldSessionTime, fullAudit.agent);
    assert(isRevoked === true, 'Revoke sessions invalidates active agent sessions created prior');

    // 4. Admin Password Reset Check
    const resetRes = await agentAuthService.resetAgentPassword({ agentId: newAgent.id, newPassword: 'NewPassword123!', adminUser: 'admin_test' });
    assert(resetRes.ok === true, 'Admin password reset succeeds');

    const authRes = await agentAuthService.authenticateAgent(testEmail, 'NewPassword123!');
    assert(authRes !== null && authRes.id === newAgent.id, 'Agent can successfully log in with newly reset password');

  } catch (err) {
    console.error('Lifecycle Test Error:', err);
    assert(false, `Lifecycle flow error: ${err.message}`);
  }


  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');


  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test Error:', err);
  process.exit(1);
});
