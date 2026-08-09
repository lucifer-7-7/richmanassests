'use strict';

/**
 * services/agentAuthService.js
 * Handles Agent Registration, Password Hashing, Verification, and Status Transitions with Audit Logging.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDB, check } = require('../db/db');

// In-memory status fallback map for environments before schema_razorpay.sql migration is executed on Supabase
const agentStatusCache = new Map();
const agentPasswordCache = new Map();
const statusHistoryCache = new Map();
const loginLogsCache = new Map();
const revokedSessionsCache = new Map();

/**
 * Record a status change in agent_status_history
 */
async function logStatusChange({ agentId, fromStatus, toStatus, reason = '', changedBy = 'system' }) {
  const agIdStr = String(agentId);
  if (toStatus !== 'password_reset' && toStatus !== 'sessions_revoked') {
    agentStatusCache.set(agIdStr, toStatus);
  }

  const histEntry = {
    agent_id: agentId,
    from_status: fromStatus,
    to_status: toStatus,
    reason,
    changed_by: changedBy,
    changed_at: new Date().toISOString(),
  };

  if (!statusHistoryCache.has(agIdStr)) statusHistoryCache.set(agIdStr, []);
  statusHistoryCache.get(agIdStr).unshift(histEntry);

  const db = getDB();
  try {
    await db.from('agent_status_history').insert(histEntry);
  } catch (err) {
    // Non-blocking if table is initializing
  }
}


/**
 * Register a new Agent (initial state: draft)
 */
async function registerAgent({ name, email, phone, password, rera_number, company_name, gst_number, city }) {
  const db = getDB();

  // Check if email or phone already exists
  const { data: existingEmail } = await db.from('agents').select('id').eq('email', email).maybeSingle();
  if (existingEmail) {
    const err = new Error('An agent with this email address already exists.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const { data: existingPhone } = await db.from('agents').select('id').eq('phone', phone).maybeSingle();
  if (existingPhone) {
    const err = new Error('An agent with this phone number already exists.');
    err.code = 'PHONE_EXISTS';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newAgent = {
    name,
    email,
    phone,
    password_hash: passwordHash,
    rera_number: rera_number || null,
    company_name: company_name || null,
    gst_number: gst_number || null,
    city: city || 'Udupi',
    status: 'draft',
    kyc_status: 'not_submitted',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };


  let agent = null;
  try {
    const result = await db.from('agents').insert(newAgent).select('*').single();
    agent = check(result, 'registerAgent');
  } catch (err) {
    // If Supabase schema has not run schema_razorpay.sql migration yet, insert without new columns
    if (err.code === 'PGRST204' || err.message?.includes('schema cache')) {
      const fallbackAgent = {
        name,
        email,
        phone,
        password_hash: passwordHash,
        rera_number: rera_number || null,
        company_name: company_name || null,
        gst_number: gst_number || null,
        city: city || 'Udupi',
        is_active: true,
        is_verified: false,
      };
      const fbResult = await db.from('agents').insert(fallbackAgent).select('*').single();
      agent = check(fbResult, 'registerAgent.fallback');
      agent.status = 'draft';
      agent.kyc_status = 'not_submitted';
    } else {
      throw err;
    }
  }

  agentStatusCache.set(String(agent.id), 'draft');

  await logStatusChange({
    agentId: agent.id,
    fromStatus: null,
    toStatus: 'draft',
    reason: 'Initial agent signup',
  });

  return agent;
}

/**
 * Verify OTP / Email (Transitions draft -> active)
 *
 * Onboarding is free. The ₹999 fee is charged per listing at publish time, not for the
 * account, so a verified agent is immediately usable. The old draft -> pending_payment ->
 * active membership ladder is gone.
 */
async function verifyAgentAccount(agentId) {
  const db = getDB();
  let agent = await getAgentById(agentId);
  if (!agent) throw new Error('Agent not found.');

  const currentStatus = agent.status || agentStatusCache.get(String(agentId)) || 'draft';

  if (currentStatus === 'draft') {
    // Not swallowed: agents.status is the gate the login redirect reads, and silently
    // failing here left accounts stuck in draft with no way to notice.
    const { error } = await db
      .from('agents')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId);

    if (error) {
      console.error('[verifyAgentAccount] status update failed:', error.message);
      throw new Error('Could not activate your account. Please try again.');
    }

    agent.status = 'active';
    agentStatusCache.set(String(agentId), 'active');

    await logStatusChange({
      agentId,
      fromStatus: 'draft',
      toStatus: 'active',
      reason: 'OTP / Account verification completed',
    });
  }

  return agent;
}

/**
 * Authenticate Agent login
 */
async function authenticateAgent(email, password) {
  const db = getDB();
  const { data: agent } = await db.from('agents').select('*').eq('email', email).maybeSingle();
  if (!agent) return null;

  const targetPasswordHash = agentPasswordCache.get(String(agent.id)) || agent.password_hash;
  const isValid = await bcrypt.compare(password, targetPasswordHash);
  if (!isValid) return null;

  if (!agent.status) {
    agent.status = agentStatusCache.get(String(agent.id)) || 'active';
  }

  return agent;
}


/**
 * Get Agent by ID
 */
async function getAgentById(agentId) {
  const db = getDB();
  const result = await db.from('agents').select('*').eq('id', agentId).single();
  if (result.error) return null;

  const agent = result.data;
  if (!agent.status) {
    agent.status = agentStatusCache.get(String(agentId)) || 'draft';
  }
  return agent;
}

/**
 * Update Agent Status explicitly (e.g. by Admin or System)
 */
async function updateAgentStatus(agentId, newStatus, reason, changedBy = 'admin') {
  const db = getDB();
  const agent = await getAgentById(agentId);
  if (!agent) throw new Error('Agent not found.');

  const oldStatus = agent.status || agentStatusCache.get(String(agentId)) || 'draft';
  if (oldStatus === newStatus) return agent;

  // No activated_at — the column does not exist. Including it made Postgres reject the
  // whole UPDATE, so the status change never persisted and only the in-memory cache moved.
  const updatePayload = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  // supabase-js returns { error }, it does not throw — a try/catch here caught nothing and
  // every failed write looked like a success.
  const { error } = await db.from('agents').update(updatePayload).eq('id', agentId);
  if (error) throw new Error(`Could not update agent status: ${error.message}`);

  agent.status = newStatus;
  agentStatusCache.set(String(agentId), newStatus);

  await logStatusChange({
    agentId,
    fromStatus: oldStatus,
    toStatus: newStatus,
    reason,
    changedBy,
  });

  return agent;
}

/**
 * Parse device type from User Agent string
 */

function parseDeviceType(uaString = '') {
  const ua = uaString.toLowerCase();
  if (/mobile|iphone|android(?!.*tablet)|ipod|blackberry|windows phone/i.test(ua)) return 'Mobile';
  if (/tablet|ipad|playbook|silk|android(?!.*mobile)/i.test(ua)) return 'Tablet';
  return 'Desktop';
}

/**
 * Record an Agent Sign-In Log (IP address, user agent, device)
 */
async function recordLoginLog({ agentId, ip, userAgent, status = 'success' }) {
  const db = getDB();
  const deviceType = parseDeviceType(userAgent);
  const logEntry = {
    agent_id: agentId,
    ip_address: ip || '127.0.0.1',
    user_agent: userAgent || 'Unknown Browser',
    device_type: deviceType,
    status,
    created_at: new Date().toISOString(),
  };

  // In-memory cache fallback
  const agIdStr = String(agentId);
  if (!loginLogsCache.has(agIdStr)) loginLogsCache.set(agIdStr, []);
  loginLogsCache.get(agIdStr).unshift(logEntry);

  try {
    await db.from('agent_login_logs').insert(logEntry);
  } catch (_) {}

  return logEntry;
}

/**
 * Reset Agent Password (Admin Action)
 * Revokes all active sessions to force re-login with new password.
 */
async function resetAgentPassword({ agentId, newPassword, adminUser = 'admin' }) {
  const db = getDB();
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const revokedTime = new Date().toISOString();

  agentPasswordCache.set(String(agentId), passwordHash);
  revokedSessionsCache.set(String(agentId), Date.now());

  try {
    await db
      .from('agents')
      .update({
        password_hash: passwordHash,
        updated_at: revokedTime,
      })
      .eq('id', agentId);
  } catch (_) {}

  await logStatusChange({
    agentId,
    fromStatus: null,
    toStatus: 'password_reset',
    reason: `Password reset by admin (${adminUser})`,
    changedBy: adminUser,
  });

  return { ok: true, resetAt: revokedTime };
}

/**
 * Revoke all active sessions for an Agent (Force Logout across all devices)
 */
async function revokeAgentSessions({ agentId, adminUser = 'admin' }) {
  const db = getDB();
  const revokedTime = new Date().toISOString();

  revokedSessionsCache.set(String(agentId), Date.now());

  try {
    await db
      .from('agents')
      .update({
        sessions_revoked_at: revokedTime,
        updated_at: revokedTime,
      })
      .eq('id', agentId);
  } catch (_) {}

  await logStatusChange({
    agentId,
    fromStatus: null,
    toStatus: 'sessions_revoked',
    reason: `All active sessions revoked by admin (${adminUser})`,
    changedBy: adminUser,
  });

  return { ok: true, revokedAt: revokedTime };
}

/**
 * Check if an agent's session has been revoked
 */
function isSessionRevoked(agentId, sessionLoginTime, agentDbRecord) {
  if (!sessionLoginTime) return false;
  const agIdStr = String(agentId);
  const inMemRevokedAt = revokedSessionsCache.get(agIdStr);
  if (inMemRevokedAt && sessionLoginTime < inMemRevokedAt) {
    return true;
  }

  if (agentDbRecord?.sessions_revoked_at) {
    const revokedDbTime = new Date(agentDbRecord.sessions_revoked_at).getTime();
    if (!isNaN(revokedDbTime) && sessionLoginTime < revokedDbTime) {
      return true;
    }
  }

  return false;
}


/**
 * Get Full Agent Audit Data (Profile, Login Logs, Status History, Payment Orders, Listings)
 */
async function getAgentFullAudit(agentId) {
  const db = getDB();
  const agent = await getAgentById(agentId);
  if (!agent) return null;

  // 1. Login Logs
  let loginLogs = [];
  try {
    const { data } = await db.from('agent_login_logs').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(50);
    if (data && data.length > 0) loginLogs = data;
  } catch (_) {}
  if (loginLogs.length === 0) {
    loginLogs = loginLogsCache.get(String(agentId)) || [];
  }

  // 2. Status History
  let statusHistory = [];
  try {
    const { data } = await db.from('agent_status_history').select('*').eq('agent_id', agentId).order('changed_at', { ascending: false }).limit(50);
    if (data && data.length > 0) statusHistory = data;
  } catch (_) {}
  if (statusHistory.length === 0) {
    statusHistory = statusHistoryCache.get(String(agentId)) || [];
  }

  // If no status history exists, synthesize initial signup milestone
  if (statusHistory.length === 0) {
    statusHistory.push({
      agent_id: agentId,
      from_status: 'none',
      to_status: agent.status || 'draft',
      reason: 'Agent Account Created',
      changed_by: 'system',
      changed_at: agent.created_at || new Date().toISOString(),
    });
  }

  // 3. Payment Orders & Generated Invoices
  let orders = [];
  try {
    const paymentSvc = require('./paymentService');
    orders = await paymentSvc.getAgentOrders(agentId);
  } catch (_) {
    try {
      const { data } = await db.from('payment_orders').select('*').eq('agent_id', agentId).order('created_at', { ascending: false });
      if (data) orders = data;
    } catch (_) {}
  }

  // 4. Property Listings
  let listings = [];
  try {
    const { data } = await db.from('agent_properties').select('*').eq('agent_id', agentId).order('created_at', { ascending: false });
    if (data) listings = data;
  } catch (_) {}

  return {
    agent,
    login_logs: loginLogs,
    status_history: statusHistory,
    orders,
    listings,
  };
}

function getAgentStatus(agentId) {
  return agentStatusCache.get(String(agentId)) || 'active';
}

module.exports = {
  logStatusChange,
  registerAgent,
  verifyAgentAccount,
  authenticateAgent,
  getAgentById,
  updateAgentStatus,
  getAgentStatus,
  recordLoginLog,
  resetAgentPassword,
  revokeAgentSessions,
  isSessionRevoked,
  getAgentFullAudit,
};


