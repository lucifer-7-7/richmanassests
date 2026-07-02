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
    const result = await db
      .from('agents')
      .select('id, name, email, phone, company_name, city, gst_number, rera_number, is_active')
      .eq('id', req.session.agent.id)
      .single();
    const agent = check(result, 'requireAgent');
    if (!agent || !agent.is_active) {
      req.session.destroy(() => {});
      return res.redirect('/agent/login?reason=banned');
    }
    req.agent = agent;
    next();
  } catch (err) {
    console.error('requireAgent error:', err.message);
    return res.status(500).render('500', { title: 'Server Error | RichManAssets' });
  }
}

module.exports = requireAgent;
