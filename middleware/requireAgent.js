'use strict';
/**
 * middleware/requireAgent.js
 * Guards all agent-only routes. Validates session + checks DB for banned accounts.
 */
const { getDB, check } = require('../db/db');

async function requireAgent(req, res, next) {
  if (!req.session || !req.session.agent) {
    const back = encodeURIComponent(req.originalUrl);
    return res.redirect(`/agent/login?next=${back}`);
  }
  try {
    const db = getDB();
    const agentAuthSvc = require('../services/agentAuthService');

    let agent = null;
    const result = await db
      .from('agents')
      .select('id, name, email, phone, company_name, city, gst_number, rera_number, is_active')
      .eq('id', req.session.agent.id)
      .maybeSingle();

    if (result.data) {
      agent = result.data;
    } else {
      agent = await agentAuthSvc.getAgentById(req.session.agent.id);
    }

    if (!agent) {
      req.session.destroy(() => {});
      return res.redirect('/agent/login');
    }

    // Use DB-fetched status first; fall back to in-memory cache only if the DB column is missing
    const currentStatus = agent.status || (agentAuthSvc.getAgentStatus ? agentAuthSvc.getAgentStatus(agent.id) : 'active');
    agent.status = currentStatus;

    if (agent.is_active === false || ['suspended', 'deactivated'].includes(agent.status)) {
      req.session.destroy(() => {});
      return res.redirect('/agent/login?reason=banned');
    }

    if (!req.session.agentLoginTime) {
      req.session.agentLoginTime = Date.now();
    }

    if (agentAuthSvc.isSessionRevoked(agent.id, req.session.agentLoginTime, agent)) {
      req.session.destroy(() => {});
      return res.redirect('/agent/login?reason=revoked');
    }


    req.agent = agent;
    next();
  } catch (err) {

    console.error('requireAgent error:', err.message);
    return res.status(500).send('Server error. Please refresh or try again.');
  }
}


module.exports = requireAgent;
