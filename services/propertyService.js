'use strict';
/**
 * services/propertyService.js
 * Property lifecycle — agent CRUD, validation, payment state machine.
 *
 * Exported functions
 * ──────────────────
 * Agent CRUD
 *   getAgentListings(agentId, status?)  — list agent's own properties
 *   getAgentProperty(propId, agentId)   — single property (ownership check)
 *   validateProperty(body)              — validation, returns [] or error strings
 *   createDraft(agentId, body, images)  — insert new draft listing
 *   updateDraft(propId, agentId, body, images) — edit draft (only draft/payment_failed)
 *   deleteDraft(propId, agentId)        — delete draft (only draft/payment_failed)
 *
 * Payment state machine
 *   markPaymentPending(propId)          — called before opening Cashfree checkout
 *   publishProperty(propId, orderId, amountPaise)
 *   markPaymentFailed(propId)
 *   markRefunded(propId)
 *
 * Admin
 *   archiveProperty(propId)             — soft-archive an agent listing
 *
 * Agent manage (post-publish updates)
 *   updatePublishedListing(propId, agentId, body, images) — update details/images on live listing
 */
const { getDB, check } = require('../db/db');

const LISTING_DURATION_DAYS = 365; // 1 year active on payment

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Generate a clean property ID slug from a name + timestamp.
 */
function makeId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    + '-' + Date.now().toString(36);
}

// ── Agent CRUD ────────────────────────────────────────────────────

/**
 * Get all listings for an agent, optionally filtered by status.
 */
async function getAgentListings(agentId, status) {
  const db = getDB();
  let q = db.from('agent_properties')
    .select('*')
    .eq('agent_id', agentId)
    .neq('status', 'deleted');

  if (status) {
    q = q.eq('status', status);
  }

  q = q.order('created_at', { ascending: false });
  const result = await q;
  return check(result, 'getAgentListings');
}

/**
 * Get a single agent property by ID, verifying ownership.
 * Returns null if not found or not owned by this agent.
 */
async function getAgentProperty(propId, agentId) {
  const db = getDB();
  const result = await db
    .from('agent_properties')
    .select('*')
    .eq('id', propId)
    .eq('agent_id', agentId)
    .neq('status', 'deleted')
    .maybeSingle();

  if (result.error) return null;
  return result.data;
}

/**
 * Validate listing form body. Returns array of error strings (empty = valid).
 */
function validateProperty(body) {
  const errs = [];
  if (!body.name || body.name.trim().length < 3)
    errs.push('Property name must be at least 3 characters.');
  if (!body.loc || body.loc.trim().length < 3)
    errs.push('Location is required.');
  if (!body.type)
    errs.push('Property type is required.');
  if (!['sale', 'rent', 'lease'].includes(body.listing))
    errs.push('Listing type must be Sale, Rent or Lease.');
  if (!body.price || body.price.trim().length < 1)
    errs.push('Price display text is required (e.g. ₹85 Lakhs).');
  if (body.price_val === undefined || body.price_val === '' || isNaN(Number(body.price_val)))
    errs.push('Numeric price value is required for filtering.');
  return errs;
}

/**
 * Create a new draft listing for an agent.
 */
async function createDraft(agentId, body, { img_card, img_hero, gallery }) {
  const db = getDB();
  const id = makeId(body.name);

  const result = await db.from('agent_properties').insert({
    id,
    agent_id:    agentId,
    name:        body.name.trim(),
    loc:         body.loc.trim(),
    area:        body.area?.trim() || null,
    type:        body.type,
    listing:     body.listing,
    price:       body.price.trim(),
    price_val:   parseFloat(body.price_val) || 0,
    price_note:  body.price_note?.trim() || null,
    beds:        body.beds?.trim() || null,
    baths:       body.baths?.trim() || null,
    sqft:        body.sqft?.trim() || null,
    subtype:     body.subtype?.trim() || null,
    description: body.description?.trim() || null,
    amenities:   body.amenities?.trim() || null,
    img_card:    img_card || null,
    img_hero:    img_hero || null,
    gallery:     gallery?.length ? JSON.stringify(gallery) : null,
    status:      'draft',
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }).select('*').single();

  return check(result, 'createDraft');
}

/**
 * Update an existing draft or payment_failed listing.
 * Only images provided are updated; omitted image fields keep existing value.
 */
async function updateDraft(propId, agentId, body, { img_card, img_hero, gallery }) {
  const db = getDB();

  // Fetch existing to preserve current images if new ones not uploaded
  const { data: existing } = await db
    .from('agent_properties')
    .select('*')
    .eq('id', propId)
    .eq('agent_id', agentId)
    .single();

  if (!existing) throw new Error('Listing not found or not owned by you.');
  if (!['draft', 'payment_failed', 'payment_pending'].includes(existing.status)) {
    throw new Error('Only draft listings can be edited here. Use "Manage Listing" for published listings.');
  }

  // Merge gallery: remove requested indices, then append new images
  let currentGallery = [];
  try { currentGallery = JSON.parse(existing.gallery || '[]'); } catch (_) {}
  const removeIdxs = [].concat(body.gallery_remove || []).map(Number);
  currentGallery = currentGallery.filter((_, i) => !removeIdxs.includes(i));
  if (gallery?.length) currentGallery = currentGallery.concat(gallery.filter(Boolean));

  const result = await db.from('agent_properties').update({
    name:        body.name.trim(),
    loc:         body.loc.trim(),
    area:        body.area?.trim() || null,
    type:        body.type,
    listing:     body.listing,
    price:       body.price.trim(),
    price_val:   parseFloat(body.price_val) || 0,
    price_note:  body.price_note?.trim() || null,
    beds:        body.beds?.trim() || null,
    baths:       body.baths?.trim() || null,
    sqft:        body.sqft?.trim() || null,
    subtype:     body.subtype?.trim() || null,
    description: body.description?.trim() || null,
    amenities:   body.amenities?.trim() || null,
    img_card:    img_card || existing.img_card,
    img_hero:    img_hero || existing.img_hero,
    gallery:     currentGallery.length ? JSON.stringify(currentGallery) : null,
    updated_at:  new Date().toISOString(),
  }).eq('id', propId).eq('agent_id', agentId).select('*').single();

  return check(result, 'updateDraft');
}

/**
 * Delete a draft listing (only draft or payment_failed status).
 */
async function deleteDraft(propId, agentId) {
  const db = getDB();

  const { data: existing } = await db
    .from('agent_properties')
    .select('status')
    .eq('id', propId)
    .eq('agent_id', agentId)
    .single();

  if (!existing) throw new Error('Listing not found or not owned by you.');
  if (!['draft', 'payment_failed', 'payment_pending'].includes(existing.status)) {
    throw new Error('Only draft listings can be deleted.');
  }

  // Soft-delete
  const result = await db.from('agent_properties')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', propId)
    .eq('agent_id', agentId);

  if (result.error) throw new Error('Could not delete listing: ' + result.error.message);
  return true;
}

// ── Payment State Machine ─────────────────────────────────────────

/**
 * Mark a property as payment_pending right before opening checkout.
 */
async function markPaymentPending(propId) {
  const db = getDB();
  const result = await db
    .from('agent_properties')
    .update({ status: 'payment_pending', updated_at: new Date().toISOString() })
    .eq('id', propId)
    .select('id, status')
    .single();

  if (result.error) {
    console.error('[propertyService] markPaymentPending error:', result.error.message);
    return null;
  }
  return result.data;
}

/**
 * Publish an agent property after successful payment.
 * Sets status = 'published', records published_at and expires_at.
 */
async function publishProperty(propertyId, internalOrderId, amountPaise) {
  const db = getDB();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LISTING_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const result = await db
    .from('agent_properties')
    .update({
      status:         'published',
      published_at:   now.toISOString(),
      expires_at:     expiresAt.toISOString(),  // ← correct column name per schema
      paid_order_id:  internalOrderId || null,   // ← correct column name per schema
      fee_paid_paise: amountPaise || 0,
      updated_at:     now.toISOString(),
    })
    .eq('id', propertyId)
    .select('id, status, published_at, expires_at')
    .single();

  if (result.error) {
    console.error('[propertyService] publishProperty error:', result.error.message);
    throw new Error(`Failed to publish property ${propertyId}: ${result.error.message}`);
  }

  console.log(`[propertyService] Property ${propertyId} published until ${expiresAt.toISOString()}`);
  return result.data;
}

/**
 * Mark property as payment_failed (keeps it in draft-like state for retry).
 */
async function markPaymentFailed(propertyId) {
  const db = getDB();
  const result = await db
    .from('agent_properties')
    .update({ status: 'payment_failed', updated_at: new Date().toISOString() })
    .eq('id', propertyId)
    .select('id, status')
    .single();

  if (result.error) {
    console.error('[propertyService] markPaymentFailed error:', result.error.message);
    return null;
  }
  console.log(`[propertyService] Property ${propertyId} marked payment_failed`);
  return result.data;
}

/**
 * Mark property as refunded after a successful refund.
 */
async function markRefunded(propertyId) {
  const db = getDB();
  const result = await db
    .from('agent_properties')
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', propertyId)
    .select('id, status')
    .single();

  if (result.error) {
    console.error('[propertyService] markRefunded error:', result.error.message);
    return null;
  }
  console.log(`[propertyService] Property ${propertyId} marked refunded`);
  return result.data;
}

// ── Admin Actions ─────────────────────────────────────────────────

/**
 * Admin: soft-archive a published agent listing.
 */
async function archiveProperty(propId) {
  const db = getDB();
  const result = await db
    .from('agent_properties')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', propId)
    .select('id, status')
    .single();

  return check(result, 'archiveProperty');
}

// ── Agent Manage (post-publish) ───────────────────────────────────

/**
 * Update a published or expired listing (description, amenities, images, price_note).
 * Price and listing type cannot be changed post-publish without admin approval.
 */
async function updatePublishedListing(propId, agentId, body, { img_card, img_hero, gallery }) {
  const db = getDB();

  const { data: existing } = await db
    .from('agent_properties')
    .select('*')
    .eq('id', propId)
    .eq('agent_id', agentId)
    .single();

  if (!existing) throw new Error('Listing not found or not owned by you.');
  if (!['published', 'expired'].includes(existing.status)) {
    throw new Error('Only published or expired listings can be updated here.');
  }

  // Merge gallery
  let currentGallery = [];
  try { currentGallery = JSON.parse(existing.gallery || '[]'); } catch (_) {}
  const removeIdxs = [].concat(body.gallery_remove || []).map(Number);
  currentGallery = currentGallery.filter((_, i) => !removeIdxs.includes(i));
  if (gallery?.length) currentGallery = currentGallery.concat(gallery.filter(Boolean));

  const result = await db.from('agent_properties').update({
    // Editable post-publish: description, amenities, price_note, images, beds/baths/sqft
    description: body.description?.trim() || existing.description,
    amenities:   body.amenities?.trim()   || existing.amenities,
    price_note:  body.price_note?.trim()  !== undefined ? (body.price_note?.trim() || null) : existing.price_note,
    beds:        body.beds?.trim()        || existing.beds,
    baths:       body.baths?.trim()       || existing.baths,
    sqft:        body.sqft?.trim()        || existing.sqft,
    subtype:     body.subtype?.trim()     || existing.subtype,
    img_card:    img_card  || existing.img_card,
    img_hero:    img_hero  || existing.img_hero,
    gallery:     currentGallery.length ? JSON.stringify(currentGallery) : existing.gallery,
    updated_at:  new Date().toISOString(),
  }).eq('id', propId).eq('agent_id', agentId).select('*').single();

  return check(result, 'updatePublishedListing');
}

module.exports = {
  // Agent CRUD
  getAgentListings,
  getAgentProperty,
  validateProperty,
  createDraft,
  updateDraft,
  deleteDraft,
  // Payment state machine
  markPaymentPending,
  publishProperty,
  markPaymentFailed,
  markRefunded,
  // Admin
  archiveProperty,
  // Agent manage
  updatePublishedListing,
};
