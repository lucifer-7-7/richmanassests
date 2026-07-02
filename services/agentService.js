'use strict';
/**
 * services/agentService.js
 * Agent account management: register, login, profile updates.
 */
const bcrypt = require('bcryptjs');
const { getDB, check } = require('../db/db');

const SALT_ROUNDS = 12;

/** Validate agent registration input. Returns array of error strings. */
function validateRegistration({ name, email, phone, password }) {
  const errs = [];
  if (!name || name.trim().length < 2)         errs.push('Name must be at least 2 characters.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push('Valid email is required.');
  if (!phone || !/^\d{10}$/.test(phone.replace(/\D/g, ''))) errs.push('Valid 10-digit phone number is required.');
  if (!password || password.length < 8)         errs.push('Password must be at least 8 characters.');
  return errs;
}

/** Register a new agent. Returns { agent } or throws. */
async function registerAgent({ name, email, phone, password, company_name, city, rera_number, gst_number }) {
  const db = getDB();

  // Check if email already exists
  const existing = await db.from('agents').select('id').eq('email', email.toLowerCase().trim()).maybeSingle();
  if (existing.data) throw Object.assign(new Error('Email already registered.'), { code: 'EMAIL_EXISTS' });

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await db.from('agents').insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.replace(/\D/g, '').slice(0, 15),
    password_hash,
    company_name: company_name?.trim() || null,
    city: city?.trim() || null,
    rera_number: rera_number?.trim() || null,
    gst_number: gst_number?.trim().toUpperCase() || null,
    is_verified: true, // no email OTP for now
    is_active: true,
  }).select('id, name, email, phone, company_name, city').single();

  const agent = check(result, 'registerAgent');
  return { agent };
}

/** Authenticate agent by email + password. Returns { agent } or throws. */
async function loginAgent(email, password) {
  const db = getDB();
  const result = await db
    .from('agents')
    .select('id, name, email, phone, password_hash, is_active')
    .eq('email', email.toLowerCase().trim())
    .single();

  // Deliberately generic error to prevent email enumeration
  const GENERIC = Object.assign(new Error('Invalid email or password.'), { code: 'INVALID_CREDENTIALS' });

  if (result.error) throw GENERIC;
  const agent = result.data;
  if (!agent) throw GENERIC;

  const match = await bcrypt.compare(password, agent.password_hash);
  if (!match) throw GENERIC;

  if (!agent.is_active) throw Object.assign(new Error('Account suspended. Contact support.'), { code: 'BANNED' });

  const { password_hash: _, ...safe } = agent;
  return { agent: safe };
}

/** Get agent by ID (without password hash). */
async function getAgentById(id) {
  const db = getDB();
  const result = await db
    .from('agents')
    .select('id, name, email, phone, company_name, city, rera_number, gst_number, is_verified, is_active, created_at')
    .eq('id', id)
    .single();
  return check(result, 'getAgentById');
}

/** Update agent profile fields. */
async function updateAgentProfile(id, { name, phone, company_name, city, rera_number, gst_number }) {
  const db = getDB();
  const result = await db
    .from('agents')
    .update({
      name: name?.trim() || undefined,
      phone: phone?.replace(/\D/g, '').slice(0, 15) || undefined,
      company_name: company_name?.trim() || null,
      city: city?.trim() || null,
      rera_number: rera_number?.trim() || null,
      gst_number: gst_number?.trim().toUpperCase() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, name, email, phone, company_name, city, rera_number, gst_number')
    .single();
  return check(result, 'updateAgentProfile');
}

/** Admin: get all agents with listing counts. */
async function getAllAgents() {
  const db = getDB();
  const result = await db
    .from('agents')
    .select('id, name, email, phone, company_name, city, is_active, is_verified, created_at')
    .order('created_at', { ascending: false });
  return check(result, 'getAllAgents');
}

/** Admin: toggle agent active status. */
async function toggleAgentActive(id) {
  const db = getDB();
  const { data: agent } = await db.from('agents').select('is_active').eq('id', id).single();
  if (!agent) throw new Error('Agent not found.');
  await db.from('agents').update({ is_active: !agent.is_active, updated_at: new Date().toISOString() }).eq('id', id);
  return !agent.is_active;
}

module.exports = { validateRegistration, registerAgent, loginAgent, getAgentById, updateAgentProfile, getAllAgents, toggleAgentActive };
