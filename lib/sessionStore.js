'use strict';
const Store = require('express-session').Store;
const { getDB } = require('../db/db');

class SupabaseSessionStore extends Store {
  async get(sid, callback) {
    try {
      const db = getDB();
      const { data, error } = await db
        .from('sessions')
        .select('data, expires_at')
        .eq('sid', sid)
        .maybeSingle();

      if (error) {
        return callback(error);
      }

      if (!data) {
        return callback(null, null);
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        this.destroy(sid, () => {});
        return callback(null, null);
      }

      callback(null, JSON.parse(data.data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, sess, callback) {
    try {
      const db = getDB();
      const expires_at = new Date(Date.now() + (sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000));

      const { error } = await db.from('sessions').upsert({
        sid,
        data: JSON.stringify(sess),
        expires_at: expires_at.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        return callback(error);
      }
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      const db = getDB();
      const { error } = await db.from('sessions').delete().eq('sid', sid);

      if (error) {
        return callback(error);
      }
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async touch(sid, sess, callback) {
    try {
      const db = getDB();
      const expires_at = new Date(Date.now() + (sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000));

      const { error } = await db
        .from('sessions')
        .update({ expires_at: expires_at.toISOString(), updated_at: new Date().toISOString() })
        .eq('sid', sid);

      if (error) {
        return callback(error);
      }
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = SupabaseSessionStore;
