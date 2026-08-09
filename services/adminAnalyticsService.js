'use strict';

/**
 * services/adminAnalyticsService.js
 * Comprehensive Analytics Engine for Admin Dashboard.
 * Computes exact real-time and aggregated metrics for Agents, Enquiries, and Payments.
 */

const { getDB } = require('../db/db');
const { getReconciliationHealth } = require('./reconciliationService');

/**
 * 6.1 AGENT ANALYTICS
 */
async function getAgentAnalytics() {
  const db = getDB();

  // 1. Status Breakdown (counts + percentages)
  // No activated_at / plan_id — neither column exists, and selecting them errored the
  // whole query, which is why this dashboard rendered all zeros.
  const { data: allAgents } = await db.from('agents').select('id, status, city, kyc_status, created_at');
  const agentsList = allAgents || [];
  const totalAgents = agentsList.length || 1; // avoid divide by zero

  // pending_payment / payment_failed are gone: onboarding is free, so an account never
  // waits on money. The fee is per listing and lives in the listing's own status.
  const statusCounts = {
    draft: 0,
    active: 0,
    suspended: 0,
    expired: 0,
    deactivated: 0,
  };

  const kycCounts = {
    not_submitted: 0,
    pending: 0,
    verified: 0,
    rejected: 0,
  };

  const cityCounts = {};

  agentsList.forEach((a) => {
    if (statusCounts[a.status] !== undefined) statusCounts[a.status]++;
    if (kycCounts[a.kyc_status] !== undefined) kycCounts[a.kyc_status]++;

    const city = a.city || 'Udupi';
    cityCounts[city] = (cityCounts[city] || 0) + 1;
  });

  const statusBreakdown = Object.keys(statusCounts).map((key) => ({
    status: key,
    count: statusCounts[key],
    percentage: parseFloat(((statusCounts[key] / totalAgents) * 100).toFixed(1)),
  }));

  // 2. Signup funnel — now measured against what actually matters commercially:
  // how many people who register go on to verify, and how many of those ever pay to
  // publish. The old draft → pending_payment → paid ladder no longer exists.
  const { data: publishers } = await db
    .from('agent_properties')
    .select('agent_id')
    .eq('status', 'published');
  const publishingAgents = new Set((publishers || []).map(p => p.agent_id)).size;

  const registered = agentsList.length;
  const verified = registered - statusCounts.draft;

  const funnel = {
    registered,
    verified,
    published: publishingAgents,
  };

  const funnelDropoff = {
    registered_to_verified: registered > 0
      ? parseFloat((((registered - verified) / registered) * 100).toFixed(1)) : 0,
    verified_to_published: verified > 0
      ? parseFloat((((verified - publishingAgents) / verified) * 100).toFixed(1)) : 0,
  };

  // 3. Avg time from signup to verification, from the durable status history.
  // (Previously read agents.activated_at, a column that does not exist.)
  const { data: activations } = await db
    .from('agent_status_history')
    .select('agent_id, changed_at')
    .eq('to_status', 'active')
    .order('changed_at', { ascending: true });

  const createdAtById = new Map(agentsList.map(a => [String(a.id), a.created_at]));
  let totalActivationTimeMs = 0;
  let activatedAgentCount = 0;
  const seenAgents = new Set();

  for (const row of activations || []) {
    const key = String(row.agent_id);
    if (seenAgents.has(key)) continue;      // first activation only
    const createdAt = createdAtById.get(key);
    if (!createdAt) continue;
    const deltaMs = new Date(row.changed_at).getTime() - new Date(createdAt).getTime();
    if (deltaMs < 0) continue;
    seenAgents.add(key);
    totalActivationTimeMs += deltaMs;
    activatedAgentCount++;
  }

  const avgTimeToActivationHours = activatedAgentCount > 0
    ? parseFloat((totalActivationTimeMs / (activatedAgentCount * 1000 * 3600)).toFixed(2))
    : 0;

  // 4. Plans & Revenue per Agent
  const { data: payments } = await db.from('payments').select('amount_paise, status').eq('status', 'captured');
  const totalRevenuePaise = (payments || []).reduce((sum, p) => sum + (p.amount_paise || 0), 0);
  const revenuePerAgentPaise = statusCounts.active > 0 ? Math.round(totalRevenuePaise / statusCounts.active) : 0;

  // 5. Agent Leaderboard (by enquiries assigned & converted)
  const { data: agentEnquiries } = await db.from('enquiries').select('agent_id, status');
  const agentLeaderboardMap = {};

  (agentEnquiries || []).forEach((e) => {
    if (e.agent_id) {
      if (!agentLeaderboardMap[e.agent_id]) {
        agentLeaderboardMap[e.agent_id] = { handled: 0, converted: 0 };
      }
      agentLeaderboardMap[e.agent_id].handled++;
      if (e.status === 'converted') {
        agentLeaderboardMap[e.agent_id].converted++;
      }
    }
  });

  const leaderboard = Object.keys(agentLeaderboardMap).map((agId) => {
    const item = agentLeaderboardMap[agId];
    const agentObj = agentsList.find((a) => a.id === agId) || { name: `Agent ${agId.toString().slice(0, 6)}` };
    return {
      agent_id: agId,
      name: agentObj.name,
      handled: item.handled,
      converted: item.converted,
      conversion_rate: item.handled > 0 ? parseFloat(((item.converted / item.handled) * 100).toFixed(1)) : 0,
    };
  }).sort((a, b) => b.handled - a.handled).slice(0, 10);

  return {
    total_agents: agentsList.length,
    status_breakdown: statusBreakdown,
    kyc_breakdown: kycCounts,
    city_distribution: cityCounts,
    funnel,
    funnel_dropoff: funnelDropoff,
    avg_activation_hours: avgTimeToActivationHours,
    total_revenue_rs: totalRevenuePaise / 100,
    arpu_rs: revenuePerAgentPaise / 100,
    leaderboard,
  };
}

/**
 * 6.2 ENQUIRY ANALYTICS
 */
async function getEnquiryAnalytics() {
  const db = getDB();
  const { data: enquiries } = await db.from('enquiries').select('*');
  const list = enquiries || [];
  const total = list.length || 1;

  const statusCounts = {
    new: 0,
    contacted: 0,
    converted: 0,
    closed: 0,
    lost: 0,
  };

  const sourceCounts = {};
  let totalResponseTimeMs = 0;
  let respondedCount = 0;

  list.forEach((e) => {
    if (statusCounts[e.status] !== undefined) statusCounts[e.status]++;

    const src = e.source || 'website';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;

    if (e.assigned_at && e.created_at) {
      const createdMs = new Date(e.created_at).getTime();
      const assignedMs = new Date(e.assigned_at).getTime();
      if (assignedMs >= createdMs) {
        totalResponseTimeMs += (assignedMs - createdMs);
        respondedCount++;
      }
    }
  });

  const overallConversionRate = parseFloat(((statusCounts.converted / total) * 100).toFixed(1));
  const avgFirstResponseHours = respondedCount > 0 ? parseFloat((totalResponseTimeMs / (respondedCount * 1000 * 3600)).toFixed(2)) : 0;

  return {
    total_enquiries: list.length,
    status_breakdown: statusCounts,
    source_breakdown: sourceCounts,
    overall_conversion_rate: overallConversionRate,
    avg_first_response_hours: avgFirstResponseHours,
  };
}

/**
 * 6.3 PAYMENT ANALYTICS
 */
async function getPaymentAnalytics() {
  const db = getDB();

  // 1. Raw Payments & Orders
  const { data: payments } = await db.from('payments').select('*');
  const { data: orders } = await db.from('payment_orders').select('*');
  const { data: refunds } = await db.from('refunds').select('*');
  const { data: webhooks } = await db.from('webhook_events').select('received_at, processed, processed_at');

  const payList = payments || [];
  const orderList = orders || [];
  const refundList = refunds || [];
  const webhookList = webhooks || [];

  // Revenue computations
  let grossRevenuePaise = 0;
  let totalRefundedPaise = 0;
  const errorBreakdown = {};
  const methodSplit = {};
  let capturedCount = 0;
  let failedCount = 0;

  payList.forEach((p) => {
    if (p.status === 'captured') {
      grossRevenuePaise += (p.amount_paise || 0);
      capturedCount++;
    } else if (p.status === 'failed') {
      failedCount++;
      const code = p.error_code || 'UNKNOWN_ERROR';
      errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
    }

    if (p.method) {
      if (!methodSplit[p.method]) methodSplit[p.method] = { count: 0, volume_paise: 0 };
      methodSplit[p.method].count++;
      if (p.status === 'captured') methodSplit[p.method].volume_paise += (p.amount_paise || 0);
    }
  });

  refundList.forEach((r) => {
    if (r.status === 'processed' || r.status === 'pending') {
      totalRefundedPaise += (r.amount_paise || 0);
    }
  });

  const netRevenuePaise = grossRevenuePaise - totalRefundedPaise;
  const totalAttempts = capturedCount + failedCount;
  const successRate = totalAttempts > 0 ? parseFloat(((capturedCount / totalAttempts) * 100).toFixed(1)) : 100;
  const avgTransactionValueRs = capturedCount > 0 ? parseFloat(((grossRevenuePaise / capturedCount) / 100).toFixed(2)) : 0;

  // Abandoned / Pending Orders
  const thresholdMs = 15 * 60 * 1000;
  const now = Date.now();
  let abandonedCount = 0;
  let abandonedValuePaise = 0;

  orderList.forEach((o) => {
    if (['created', 'attempted'].includes(o.status)) {
      if (now - new Date(o.created_at).getTime() > thresholdMs) {
        abandonedCount++;
        abandonedValuePaise += (o.amount_paise || 0);
      }
    }
  });

  // Webhook Health metrics
  const lastWebhook = webhookList.length > 0
    ? webhookList.sort((a, b) => new Date(b.received_at) - new Date(a.received_at))[0].received_at
    : null;

  const processedWebhooks = webhookList.filter((w) => w.processed).length;
  const webhookSuccessRate = webhookList.length > 0 ? parseFloat(((processedWebhooks / webhookList.length) * 100).toFixed(1)) : 100;

  // Retry analytics (% agents requiring > 1 order attempt)
  const agentAttemptCounts = {};
  orderList.forEach((o) => {
    agentAttemptCounts[o.agent_id] = (agentAttemptCounts[o.agent_id] || 0) + (o.attempt_count || 1);
  });
  const totalAgentsWithOrders = Object.keys(agentAttemptCounts).length || 1;
  const agentsNeedingRetry = Object.values(agentAttemptCounts).filter((cnt) => cnt > 1).length;
  const retryRate = parseFloat(((agentsNeedingRetry / totalAgentsWithOrders) * 100).toFixed(1));

  return {
    gross_revenue_rs: grossRevenuePaise / 100,
    net_revenue_rs: netRevenuePaise / 100,
    total_refunded_rs: totalRefundedPaise / 100,
    payment_success_rate: successRate,
    avg_transaction_value_rs: avgTransactionValueRs,
    error_code_breakdown: errorBreakdown,
    method_split: methodSplit,
    abandoned_orders: {
      count: abandonedCount,
      value_rs: abandonedValuePaise / 100,
    },
    refund_metrics: {
      total_refunded_rs: totalRefundedPaise / 100,
      refund_count: refundList.length,
    },
    reconciliation_health: getReconciliationHealth(),
    webhook_health: {
      last_webhook_received: lastWebhook,
      total_received: webhookList.length,
      success_rate: webhookSuccessRate,
    },
    retry_analytics: {
      total_agents_ordering: totalAgentsWithOrders,
      agents_needing_retry: agentsNeedingRetry,
      retry_rate: retryRate,
    },
  };
}

module.exports = {
  getAgentAnalytics,
  getEnquiryAnalytics,
  getPaymentAnalytics,
};
