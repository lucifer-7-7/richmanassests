'use strict';

/**
 * lib/securityLog.js
 * Durable record of security-relevant events: payment verification failures,
 * webhook signature rejections, and auth failures.
 *
 * These were previously console.warn only, which meant a replay attempt or a run of forged
 * webhooks left no trace once the process restarted — there was no way to answer "did anyone
 * try this?" after the fact. Writes go to `audit_logs`, which the admin dashboard already reads.
 */

const { getDB } = require('../db/db');

/**
 * Fire-and-forget. Never throws and never blocks the caller: a logging failure must not be
 * able to turn a rejected payment into a 500, or a webhook into a retry storm.
 *
 * @param {string} action  e.g. 'payment_signature_invalid', 'webhook_signature_invalid'
 * @param {Object} detail  arbitrary context — must not contain secrets or raw signatures
 * @param {Object} [opts]  { actorType, actorId, targetType, targetId, ip, userAgent }
 */
async function logSecurityEvent(action, detail = {}, opts = {}) {
  try {
    await getDB().from('audit_logs').insert({
      actor_type:  opts.actorType || 'system',
      actor_id:    opts.actorId != null ? String(opts.actorId) : null,
      action,
      target_type: opts.targetType || null,
      target_id:   opts.targetId != null ? String(opts.targetId) : null,
      detail:      JSON.stringify(detail),
      ip:          opts.ip || null,
      user_agent:  opts.userAgent || null,
      created_at:  new Date().toISOString(),
    });
  } catch (err) {
    console.error('[securityLog] write failed:', err.message);
  }

  // Always mirror to stdout — the host's log drain is what surfaces this in real time.
  console.warn(`[SECURITY] ${action}`, detail);
}

module.exports = { logSecurityEvent };
