'use strict';

/**
 * services/reconciliationService.js
 * Automatic Reconciliation Cron Worker & API
 * Polling Razorpay API for open/attempted orders to heal missed webhooks.
 */

const { getDB } = require('../db/db');
const razorpayService = require('./razorpayService');
const { processRazorpayWebhook } = require('./agentPaymentService');

// An unpaid order this old is abandoned — the checkout window is long closed.
const STALE_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

// State tracking for reconciliation health monitoring dashboard
let reconciliationHealth = {
  last_run_at: null,
  mismatches_found: 0,
  auto_healed_count: 0,
  unresolved_count: 0,
  expired_count: 0,
  status: 'idle',
};

/**
 * Run a full reconciliation pass
 */
async function runReconciliationPass() {
  const db = getDB();
  reconciliationHealth.status = 'running';
  reconciliationHealth.last_run_at = new Date().toISOString();

  let found = 0;
  let healed = 0;
  let unresolved = 0;
  let expired = 0;

  try {
    // Find all payment_orders still in 'created' or 'attempted' status created in last 7 days
    const olderThanMins = 10;
    const cutoffDate = new Date(Date.now() - olderThanMins * 60 * 1000).toISOString();

    // No agent_plans join — that table does not exist. Selecting it made this query error
    // out, and because the result was destructured without checking `error`, every
    // reconciliation pass silently did nothing.
    const { data: openOrders, error: openErr } = await db
      .from('payment_orders')
      .select('*, agents(id, name, status)')
      .in('status', ['created', 'attempted'])
      .lt('created_at', cutoffDate)
      .limit(50);

    if (openErr) {
      console.error('[Reconciliation] open order query failed:', openErr.message);
    }

    if (openOrders && openOrders.length > 0) {
      for (const order of openOrders) {
        try {
          // Fetch order state from Razorpay API
          const rzpOrder = await razorpayService.fetchRazorpayOrder(order.razorpay_order_id);
          if (!rzpOrder) continue;

          // Abandoned order TTL. Razorpay confirms it was never paid and it's older than a
          // day, so nothing will ever settle it. Without this, every closed checkout window
          // left a row pending forever and the admin orders list filled with false pendings.
          const ageMs = Date.now() - new Date(order.created_at).getTime();
          if (rzpOrder.status !== 'paid' && !rzpOrder.amount_paid && ageMs > STALE_ORDER_TTL_MS) {
            await db
              .from('payment_orders')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', order.id);
            expired++;
            continue;
          }

          // Mismatch detection: Razorpay shows order paid, but DB is created/attempted
          if (rzpOrder.status === 'paid' || rzpOrder.amount_paid >= rzpOrder.amount) {
            found++;
            console.log(`[Reconciliation Mismatch] Order ${order.razorpay_order_id} is paid on Razorpay but pending in DB. Healing...`);

            // Synthesize webhook payload and replay activation via idempotent webhook processor
            const synthesizedPayload = {
              event: 'order.paid',
              contains: ['payment', 'order'],
              payload: {
                order: { entity: rzpOrder },
                payment: {
                  entity: {
                    id: `pay_recon_${order.razorpay_order_id}`,
                    order_id: order.razorpay_order_id,
                    amount: rzpOrder.amount,
                    status: 'captured',
                    method: 'reconciliation_auto',
                  },
                },
              },
            };

            const result = await processRazorpayWebhook({
              eventId: `evt_recon_${order.razorpay_order_id}`,
              eventType: 'order.paid',
              payload: synthesizedPayload,
            });

            if (result.ok) {
              healed++;
            } else {
              unresolved++;
            }
          }
        } catch (err) {
          console.error(`[Reconciliation Error] Order ${order.razorpay_order_id}:`, err.message);
          unresolved++;
        }
      }
    }
  } catch (err) {
    console.error('[runReconciliationPass Error]:', err.message);
  } finally {
    reconciliationHealth.mismatches_found += found;
    reconciliationHealth.auto_healed_count += healed;
    reconciliationHealth.unresolved_count += unresolved;
    reconciliationHealth.expired_count += expired;
    reconciliationHealth.status = 'idle';
  }

  return {
    last_run_at: reconciliationHealth.last_run_at,
    mismatches_found: found,
    auto_healed_count: healed,
    unresolved_count: unresolved,
    expired_count: expired,
  };
}

/**
 * Get current reconciliation metrics for Admin Analytics dashboard
 */
function getReconciliationHealth() {
  return { ...reconciliationHealth };
}

// Start recurring reconciliation cron (every 15 minutes)
let cronInterval = null;
function startReconciliationCron(intervalMs = 15 * 60 * 1000) {
  if (cronInterval) clearInterval(cronInterval);
  cronInterval = setInterval(() => {
    runReconciliationPass().catch((err) => console.error('[Reconciliation Cron Failed]:', err));
  }, intervalMs);
  console.log('Razorpay Reconciliation Cron scheduled (runs every 15 min)');
}

module.exports = {
  runReconciliationPass,
  getReconciliationHealth,
  startReconciliationCron,
};
