'use strict';
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://odgvwtwjpircuxcfxleb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let _client;

function getDB() {
  if (!_client) {
    if (!SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_SERVICE_KEY must be set in .env');
    }
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetch },
      realtime: { transport: WebSocket },
    });
  }
  return _client;
}

/** Throws if Supabase returned an error, otherwise returns data */
function check(result, context) {
  if (result.error) {
    const err = new Error(`DB error [${context || 'query'}]: ${result.error.message}`);
    err.supabaseError = result.error;
    err.code = result.error.code;
    throw err;
  }
  return result.data;
}

// Legacy compat shim — no-op now that we use Supabase
function initDB() {
  getDB(); // just ensure connection works
  console.log('Supabase connected → ' + SUPABASE_URL);
}

module.exports = { getDB, check, initDB };
