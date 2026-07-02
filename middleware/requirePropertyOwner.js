'use strict';
/**
 * middleware/requirePropertyOwner.js
 * IDOR protection — ensures the agent owns the property they're trying to access.
 * Call after requireAgent. Sets req.property on success.
 */
const { getDB, check } = require('../db/db');

async function requirePropertyOwner(req, res, next) {
  const propId = req.params.id;
  if (!propId) return res.status(400).json({ ok: false, error: 'Missing property id' });

  try {
    const db = getDB();
    const result = await db
      .from('agent_properties')
      .select('*')
      .eq('id', propId)
      .eq('agent_id', req.agent.id)
      .not('status', 'eq', 'deleted')
      .single();

    // If no row found, Supabase returns error with code PGRST116 (not found)
    if (result.error && result.error.code === 'PGRST116') {
      return res.status(403).json({ ok: false, error: 'Access denied or property not found.' });
    }

    const prop = check(result, 'requirePropertyOwner');
    req.property = prop;
    next();
  } catch (err) {
    if (err.code === 'PGRST116') {
      return res.status(403).json({ ok: false, error: 'Access denied.' });
    }
    console.error('requirePropertyOwner error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error.' });
  }
}

module.exports = requirePropertyOwner;
