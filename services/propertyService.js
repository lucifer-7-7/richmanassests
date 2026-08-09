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
 *   markPaymentPending(propId)          — called before opening Razorpay checkout
 *   publishProperty({ propertyId, agentId, paidOrderId, amountPaise })
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
 * Check if property type is a land/plot/agricultural listing.
 * Beds and baths are exempt for these types.
 */
function isLandOrPlot(type) {
  if (!type) return false;
  const lowerType = type.toLowerCase();
  return lowerType.includes('plot') || lowerType.includes('land') || lowerType.includes('agricultural');
}

/**
 * Compute default property-page section titles/copy from real listing fields,
 * for use wherever a field is left blank (agent forms and the public page).
 * Returns only the fields it has a sensible default for.
 */
function getEditorialDefaults(p) {
  const land = isLandOrPlot(p.type);
  const listLabel = p.listing === 'rent' ? 'for Rent' : p.listing === 'lease' ? 'for Lease' : 'for Sale';
  const bedsPart = (!land && p.beds && p.beds !== '—' && p.beds !== 'N/A' && !/bhk|bed/i.test(p.beds)) ? `${p.beds}-Bedroom ` : '';
  return {
    story_kicker:      (p.type && p.loc) ? `${p.type} ${listLabel} in ${p.loc}` : '',
    story_heading:     (p.type && p.loc) ? `A ${bedsPart}${p.type} in ${p.loc}.` : '',
    amenities_kicker:  "What's here",
    amenities_heading: 'The essentials',
    setting_kicker:    p.setting_heading ? 'The setting' : 'Good to know',
  };
}

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
  if (!body.sqft || body.sqft.trim().length < 1)
    errs.push('Property area/size is required.');
  if (!isLandOrPlot(body.type)) {
    if (!body.beds || body.beds.trim().length < 1)
      errs.push('Number of bedrooms is required.');
    if (!body.baths || body.baths.trim().length < 1)
      errs.push('Number of bathrooms is required.');
  }
  if (!body.description || body.description.trim().length < 40)
    errs.push('Property description must be at least 40 characters.');
  if (!body.amenities || body.amenities.trim().split(/\||·|\n/).filter(a => a.trim()).length < 1)
    errs.push('List at least one amenity (separate with | or ·).');
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
    story_kicker:      body.story_kicker?.trim() || null,
    story_heading:     body.story_heading?.trim() || null,
    story_body:        body.story_body?.trim() || null,
    amenities_kicker:  body.amenities_kicker?.trim() || null,
    amenities_heading: body.amenities_heading?.trim() || null,
    setting_kicker:    body.setting_kicker?.trim() || null,
    setting_heading:   body.setting_heading?.trim() || null,
    setting_body:      body.setting_body?.trim() || null,
    setting_pills:     body.setting_pills?.trim() || null,
    details:     body.details ? (typeof body.details === 'object' ? JSON.stringify(body.details) : body.details) : null,
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
    story_kicker:      body.story_kicker?.trim() || null,
    story_heading:     body.story_heading?.trim() || null,
    story_body:        body.story_body?.trim() || null,
    amenities_kicker:  body.amenities_kicker?.trim() || null,
    amenities_heading: body.amenities_heading?.trim() || null,
    setting_kicker:    body.setting_kicker?.trim() || null,
    setting_heading:   body.setting_heading?.trim() || null,
    setting_body:      body.setting_body?.trim() || null,
    setting_pills:     body.setting_pills?.trim() || null,
    details:     body.details !== undefined ? (typeof body.details === 'object' ? JSON.stringify(body.details) : body.details) : existing.details,
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

/**
 * Restore a soft-deleted listing within 30 days.
 */
async function restoreProperty(propId, agentId = null) {
  const db = getDB();
  let query = db.from('agent_properties').select('*').eq('id', propId);
  if (agentId) query = query.eq('agent_id', agentId);
  const { data: existing } = await query.maybeSingle();

  if (!existing) throw new Error('Listing not found.');
  if (existing.status !== 'deleted') throw new Error('Listing is not in trash.');

  const deletedTime = new Date(existing.updated_at || existing.created_at).getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - deletedTime > thirtyDaysMs) {
    throw new Error('This listing was deleted over 30 days ago and can no longer be restored.');
  }

  const restoredStatus = existing.paid_order_id ? 'published' : 'draft';
  const result = await db.from('agent_properties')
    .update({ status: restoredStatus, updated_at: new Date().toISOString() })
    .eq('id', propId);

  if (result.error) throw new Error('Could not restore listing: ' + result.error.message);
  return { ...existing, status: restoredStatus };
}

/**
 * Get all soft-deleted listings (within 30-day trash retention window).
 */
async function getTrashListings(agentId = null) {
  const db = getDB();
  let query = db.from('agent_properties').select('*, agents(name, email)').eq('status', 'deleted').order('updated_at', { ascending: false });
  if (agentId) query = query.eq('agent_id', agentId);

  const { data } = await query;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  return (data || []).map(p => {
    const deletedTime = new Date(p.updated_at || p.created_at).getTime();
    const daysLeft = Math.max(0, Math.ceil((deletedTime + thirtyDaysMs - Date.now()) / (24 * 60 * 60 * 1000)));
    return {
      ...p,
      days_remaining: daysLeft,
      can_restore: daysLeft > 0,
    };
  });
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
 *
 * `agentId` is required and is matched in the UPDATE itself. Without it this function
 * published any listing id the caller passed, which let one paid order publish another
 * agent's listing. Callers must prove ownership by supplying the agent the paid order
 * belongs to — not the agent the request claims to be.
 *
 * Safe to call twice for the same payment: the webhook and the checkout-verify path both
 * fire for one successful order, and whichever loses the race is a no-op.
 */
async function publishProperty({ propertyId, agentId, paidOrderId, amountPaise }) {
  if (!propertyId) throw new Error('publishProperty requires a propertyId.');
  if (!agentId)    throw new Error('publishProperty requires an agentId.');

  const db = getDB();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LISTING_DURATION_DAYS * 24 * 60 * 60 * 1000);

  // Already published by this same order — don't restart the 12-month clock.
  const { data: existing } = await db
    .from('agent_properties')
    .select('id, status, published_at, expires_at, paid_order_id')
    .eq('id', propertyId)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (!existing) {
    throw new Error(`Property ${propertyId} not found for agent ${agentId}.`);
  }
  if (existing.status === 'published' && existing.paid_order_id === paidOrderId) {
    return existing;
  }

  const result = await db
    .from('agent_properties')
    .update({
      status:         'published',
      published_at:   now.toISOString(),
      expires_at:     expiresAt.toISOString(),  // ← correct column name per schema
      paid_order_id:  paidOrderId || null,       // ← correct column name per schema
      fee_paid_paise: amountPaise || 0,
      updated_at:     now.toISOString(),
    })
    .eq('id', propertyId)
    .eq('agent_id', agentId)
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
 *
 * Clears published_at/expires_at as well as the status: the listing fee bought a 12-month
 * slot, and refunding it takes the slot back. Leaving those set kept a refunded listing
 * looking live to anything that reads the dates rather than the status.
 */
async function markRefunded(propertyId) {
  const db = getDB();
  const result = await db
    .from('agent_properties')
    .update({
      status:       'refunded',
      published_at: null,
      expires_at:   null,
      updated_at:   new Date().toISOString(),
    })
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
    story_kicker:      body.story_kicker !== undefined      ? (body.story_kicker?.trim() || null)      : existing.story_kicker,
    story_heading:     body.story_heading !== undefined     ? (body.story_heading?.trim() || null)     : existing.story_heading,
    story_body:        body.story_body !== undefined        ? (body.story_body?.trim() || null)        : existing.story_body,
    amenities_kicker:  body.amenities_kicker !== undefined  ? (body.amenities_kicker?.trim() || null)  : existing.amenities_kicker,
    amenities_heading: body.amenities_heading !== undefined ? (body.amenities_heading?.trim() || null) : existing.amenities_heading,
    setting_kicker:    body.setting_kicker !== undefined    ? (body.setting_kicker?.trim() || null)    : existing.setting_kicker,
    setting_heading:   body.setting_heading !== undefined   ? (body.setting_heading?.trim() || null)   : existing.setting_heading,
    setting_body:      body.setting_body !== undefined      ? (body.setting_body?.trim() || null)      : existing.setting_body,
    setting_pills:     body.setting_pills !== undefined     ? (body.setting_pills?.trim() || null)     : existing.setting_pills,
    price_note:  body.price_note?.trim()  !== undefined ? (body.price_note?.trim() || null) : existing.price_note,
    beds:        body.beds?.trim()        || existing.beds,
    baths:       body.baths?.trim()       || existing.baths,
    sqft:        body.sqft?.trim()        || existing.sqft,
    subtype:     body.subtype?.trim()     || existing.subtype,
    details:     body.details !== undefined ? (typeof body.details === 'object' ? JSON.stringify(body.details) : body.details) : existing.details,
    img_card:    img_card  || existing.img_card,
    img_hero:    img_hero  || existing.img_hero,
    gallery:     currentGallery.length ? JSON.stringify(currentGallery) : existing.gallery,
    updated_at:  new Date().toISOString(),
  }).eq('id', propId).eq('agent_id', agentId).select('*').single();

  return check(result, 'updatePublishedListing');
}

module.exports = {
  isLandOrPlot,
  getEditorialDefaults,
  // Agent CRUD
  getAgentListings,
  getAgentProperty,
  validateProperty,
  createDraft,
  updateDraft,
  deleteDraft,
  restoreProperty,
  getTrashListings,
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
