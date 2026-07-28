'use strict';
/**
 * middleware/requirePropertyOwner.js
 * IDOR protection — ensures the agent owns the property they're trying to access.
 * Call after requireAgent. Sets req.property on success.
 */
const { getDB, check } = require('../db/db');

async function requirePropertyOwner(req, res, next) {
  const rawPropId = req.params.id;
  if (!rawPropId) return res.status(400).json({ ok: false, error: 'Missing property id' });

  const propId = decodeURIComponent(rawPropId);
  const normalizedId = propId.replace(/\s+/g, '-');
  const dashedId = propId.replace(/-/g, ' ');

  try {
    const db = getDB();
    const { data: prop } = await db
      .from('agent_properties')
      .select('*')
      .in('id', [propId, normalizedId, dashedId, rawPropId])
      .eq('agent_id', req.agent.id)
      .not('status', 'eq', 'deleted')
      .maybeSingle();

    if (!prop) {
      if (req.accepts('html')) {
        req.session.agentFlash = { type: 'err', msg: 'Property listing not found or access denied.' };
        return res.redirect('/agent/listings');
      }
      return res.status(403).json({ ok: false, error: 'Access denied or property not found.' });
    }

    req.property = prop;
    next();
  } catch (err) {
    console.error('requirePropertyOwner error:', err.message);
    if (req.accepts('html')) {
      return res.redirect('/agent/listings');
    }
    return res.status(500).json({ ok: false, error: 'Server error.' });
  }
}


module.exports = requirePropertyOwner;
