'use strict';
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const path     = require('path');
const { getDB, check } = require('../db/db');
const propSvc  = require('../services/propertyService');
const agentSvc = require('../services/agentService');
const { getAllOrders, initiateRefund } = require('../services/paymentService');
const { getPromoBanner, updatePromoBanner } = require('../lib/settings');

// ── CSRF Protection: Verify Host Origin for all POST/PUT/DELETE requests ──
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const host = req.get('host');

    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== host) {
          console.warn('[CSRF Blocked] Origin mismatch:', originUrl.host, 'expected:', host);
          return res.status(403).render('404', { title: '403 Forbidden — RichManAssets' });
        }
      } catch (_) {
        return res.status(403).render('404', { title: '403 Forbidden — RichManAssets' });
      }
    } else if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.host !== host) {
          console.warn('[CSRF Blocked] Referer mismatch:', refererUrl.host, 'expected:', host);
          return res.status(403).render('404', { title: '403 Forbidden — RichManAssets' });
        }
      } catch (_) {
        return res.status(403).render('404', { title: '403 Forbidden — RichManAssets' });
      }
    } else {
      console.warn('[CSRF Blocked] Missing Origin and Referer headers');
      return res.status(403).render('404', { title: '403 Forbidden — RichManAssets' });
    }
  }
  next();
});

// ── upload ────────────────────────────────────────────────────────
const uploadDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '../public/assets/img/uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-z0-9.]/gi, '-').toLowerCase()),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

async function uploadToCloudinary(localPath, publicId) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;
  const { v2 } = require('cloudinary');
  v2.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
  const result = await v2.uploader.upload(localPath, { folder: 'richmanassets', public_id: publicId, overwrite: true, transformation: [{ width: 1600, height: 1200, crop: 'limit', quality: 82, fetch_format: 'auto' }] });
  try { require('fs').unlinkSync(localPath); } catch (_) {}
  return result.secure_url;
}
async function resolveImg(file, publicId) {
  if (!file) return null;
  const cloudUrl = await uploadToCloudinary(file.path, publicId).catch(() => null);
  if (cloudUrl) return cloudUrl;
  const rel = file.path.replace(/\\/g, '/').split('public/')[1];
  return rel || file.path;
}

// ── auth ──────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session.admin) return next();
  req.session.flash = 'Please sign in to access the admin panel.';
  res.redirect('/admin/login');
}

let PASS_HASH;
function getHash() {
  if (!PASS_HASH) PASS_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'changeme123', 10);
  return PASS_HASH;
}

// ── LOGIN ────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { flash: req.session.flash || null });
  delete req.session.flash;
});
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (bcrypt.compareSync(password || '', getHash())) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  req.session.flash = 'Incorrect password.';
  res.redirect('/admin/login');
});
router.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/admin/login')); });

// ── DASHBOARD ────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const [propsRes, enquiriesRes, agentPropsRes, agentsRes, ordersRes, logsRes] = await Promise.all([
      db.from('properties').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      db.from('enquiries').select('*').order('created_at', { ascending: false }).limit(100),
      db.from('agent_properties').select('*, agents(name, email, phone)').neq('status', 'deleted').order('created_at', { ascending: false }).limit(50),
      db.from('agents').select('id, name, email, is_active, created_at').order('created_at', { ascending: false }).limit(20),
      db.from('payment_orders').select('*, agents(name, email), agent_properties(name, loc)').order('created_at', { ascending: false }).limit(100),
      db.from('webhook_logs').select('*').order('received_at', { ascending: false }).limit(100),
    ]);

    const properties  = propsRes.data  || [];
    const enquiries   = enquiriesRes.data || [];
    const agentProps  = agentPropsRes.data || [];
    const agents      = agentsRes.data || [];
    const orders      = ordersRes.data || [];
    const logs        = logsRes.data || [];

    const { count: totalProps }   = await db.from('properties').select('*', { count: 'exact', head: true });
    const { count: activeProps }  = await db.from('properties').select('*', { count: 'exact', head: true }).eq('active', true);
    const { count: totalEnq }     = await db.from('enquiries').select('*', { count: 'exact', head: true });
    const { count: unreadEnq }    = await db.from('enquiries').select('*', { count: 'exact', head: true }).eq('is_read', false);
    const { count: totalAgentP }  = await db.from('agent_properties').select('*', { count: 'exact', head: true }).eq('status', 'published');
    const { count: totalAgents }  = await db.from('agents').select('*', { count: 'exact', head: true });

    const stats = {
      total: totalProps || 0, active: activeProps || 0,
      enquiries: totalEnq || 0, unreadEnquiries: unreadEnq || 0,
      agentPublished: totalAgentP || 0, totalAgents: totalAgents || 0,
    };

    res.render('admin/dashboard', {
      flash: req.session.flash || null,
      properties, enquiries, agentProps, agents, orders, logs, stats,
      promoBanner: getPromoBanner(),
    });
    delete req.session.flash;
  } catch (err) {
    console.error('[admin/dashboard]', err.message);
    res.render('admin/dashboard', { flash: { type:'err', msg: err.message }, properties:[], enquiries:[], agentProps:[], agents:[], orders:[], logs:[], stats:{} });
  }
});

// ── ADD PROPERTY ─────────────────────────────────────────────────
router.post('/property', requireAdmin, upload.fields([
  { name: 'img_card', maxCount: 1 }, { name: 'img_hero', maxCount: 1 }, { name: 'gallery', maxCount: 10 },
]), async (req, res) => {
  const db    = getDB();
  const body  = req.body;
  const files = req.files || {};
  const propId = body.id.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const imgCard = files.img_card ? await resolveImg(files.img_card[0], propId + '-card') : null;
  const imgHero = files.img_hero ? await resolveImg(files.img_hero[0], propId + '-hero') : null;
  let galleryUrls = null;
  if (files.gallery?.length) {
    const urls = await Promise.all(files.gallery.map((f, i) => resolveImg(f, propId + '-gallery-' + i)));
    galleryUrls = JSON.stringify(urls.filter(Boolean));
  }

  try {
    await db.from('properties').insert({
      id: propId, name: body.name, loc: body.loc, area: body.area || '',
      type: body.type, listing: body.listing, price: body.price,
      price_val: parseFloat(body.price_val) || 0, price_note: body.price_note || null,
      beds: body.beds || null, baths: body.baths || null, sqft: body.sqft || null,
      subtype: body.subtype || null, featured: body.featured === '1',
      has_img: !!(imgCard || imgHero), img_card: imgCard, img_hero: imgHero, gallery: galleryUrls,
      story_kicker: body.story_kicker || null, story_heading: body.story_heading || null, story_body: body.story_body || null,
      amenities: body.amenities || null, setting_heading: body.setting_heading || null,
      setting_body: body.setting_body || null, setting_pills: body.setting_pills || null,
      emi_label: body.emi_label || null, emi_val: body.emi_val || null,
      sort_order: parseInt(body.sort_order) || 99, active: true,
    });
    req.session.flash = { type:'ok', msg: `Property "${body.name}" added successfully.` };
  } catch (e) {
    req.session.flash = { type:'err', msg: 'Error: ' + e.message };
  }
  res.redirect('/admin');
});

// ── EDIT FORM ─────────────────────────────────────────────────────
router.get('/property/:id/edit', requireAdmin, async (req, res) => {
  const db = getDB();
  const { data: p } = await db.from('properties').select('*').eq('id', req.params.id).maybeSingle();
  if (!p) { req.session.flash = { type:'err', msg: 'Property not found.' }; return res.redirect('/admin'); }
  res.render('admin/edit', { p, flash: req.session.flash || null });
  delete req.session.flash;
});

// ── SAVE EDIT ─────────────────────────────────────────────────────
router.post('/property/:id/edit', requireAdmin, upload.fields([
  { name: 'img_card', maxCount: 1 }, { name: 'img_hero', maxCount: 1 }, { name: 'gallery', maxCount: 10 },
]), async (req, res) => {
  const db    = getDB();
  const body  = req.body;
  const files = req.files || {};
  const id    = req.params.id;

  const { data: existing } = await db.from('properties').select('*').eq('id', id).maybeSingle();
  if (!existing) { req.session.flash = { type:'err', msg: 'Property not found.' }; return res.redirect('/admin'); }

  const imgCard = files.img_card ? await resolveImg(files.img_card[0], id + '-card') : existing.img_card;
  const imgHero = files.img_hero ? await resolveImg(files.img_hero[0], id + '-hero') : existing.img_hero;

  let existingGallery = [];
  try { existingGallery = JSON.parse(existing.gallery || '[]'); } catch(_) {}
  const removeIdxs = [].concat(body.gallery_remove || []).map(Number);
  existingGallery = existingGallery.filter((_, i) => !removeIdxs.includes(i));
  if (files.gallery?.length) {
    const newUrls = await Promise.all(files.gallery.map((f, i) => resolveImg(f, id + '-gallery-' + Date.now() + '-' + i)));
    existingGallery = existingGallery.concat(newUrls.filter(Boolean));
  }

  try {
    await db.from('properties').update({
      name: body.name, loc: body.loc, area: body.area || '', type: body.type, listing: body.listing,
      price: body.price, price_val: parseFloat(body.price_val) || 0, price_note: body.price_note || null,
      beds: body.beds || null, baths: body.baths || null, sqft: body.sqft || null, subtype: body.subtype || null,
      featured: body.featured === '1', has_img: !!(imgCard || imgHero), img_card: imgCard, img_hero: imgHero,
      gallery: existingGallery.length ? JSON.stringify(existingGallery) : null,
      story_kicker: body.story_kicker || null, story_heading: body.story_heading || null, story_body: body.story_body || null,
      amenities: body.amenities || null, setting_heading: body.setting_heading || null,
      setting_body: body.setting_body || null, setting_pills: body.setting_pills || null,
      emi_label: body.emi_label || null, emi_val: body.emi_val || null, sort_order: parseInt(body.sort_order) || 99,
    }).eq('id', id);
    req.session.flash = { type:'ok', msg: `"${body.name}" updated.` };
  } catch (e) { req.session.flash = { type:'err', msg: 'Error: ' + e.message }; }
  res.redirect('/admin/property/' + id + '/edit');
});

// ── TOGGLE ACTIVE ─────────────────────────────────────────────────
router.post('/property/:id/toggle', requireAdmin, async (req, res) => {
  const db = getDB();
  const { data: p } = await db.from('properties').select('active').eq('id', req.params.id).maybeSingle();
  if (p) await db.from('properties').update({ active: !p.active }).eq('id', req.params.id);
  res.redirect('/admin');
});

// ── DELETE ADMIN PROPERTY ─────────────────────────────────────────
router.post('/property/:id/delete', requireAdmin, async (req, res) => {
  const db = getDB();
  const { data: p } = await db.from('properties').select('name').eq('id', req.params.id).maybeSingle();
  await db.from('properties').delete().eq('id', req.params.id);
  req.session.flash = { type:'ok', msg: `"${p ? p.name : req.params.id}" deleted.` };
  res.redirect('/admin');
});

// ── ENQUIRY ACTIONS ──────────────────────────────────────────────
router.post('/enquiries/:id/toggle-read', requireAdmin, async (req, res) => {
  const db = getDB();
  const { data: e } = await db.from('enquiries').select('is_read').eq('id', req.params.id).maybeSingle();
  if (e) await db.from('enquiries').update({ is_read: !e.is_read }).eq('id', req.params.id);
  res.redirect('/admin?tab=enquiries');
});
router.post('/enquiries/mark-all-read', requireAdmin, async (req, res) => {
  const db = getDB();
  await db.from('enquiries').update({ is_read: true });
  res.redirect('/admin?tab=enquiries');
});
router.post('/enquiries/:id/delete', requireAdmin, async (req, res) => {
  const db = getDB();
  await db.from('enquiries').delete().eq('id', req.params.id);
  req.session.flash = { type:'ok', msg: 'Enquiry deleted successfully.' };
  res.redirect('/admin?tab=enquiries');
});

// ── AGENT LISTINGS (Admin actions) ───────────────────────────────
router.post('/agent-listings/:id/archive', requireAdmin, async (req, res) => {
  try { await propSvc.archiveProperty(req.params.id); req.session.flash = { type:'ok', msg: 'Listing archived.' }; }
  catch (err) { req.session.flash = { type:'err', msg: err.message }; }
  res.redirect('/admin?tab=agent-listings');
});

router.post('/agent-listings/:id/refund', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { data: prop } = await db.from('agent_properties').select('paid_order_id').eq('id', req.params.id).maybeSingle();
    if (!prop?.paid_order_id) throw new Error('No paid order found for this listing.');
    const result = await initiateRefund(prop.paid_order_id, req.body.reason || 'Admin initiated refund');
    req.session.flash = { type:'ok', msg: `Refund initiated: ${result.refund_id}` };
  } catch (err) { req.session.flash = { type:'err', msg: err.message }; }
  res.redirect('/admin?tab=agent-listings');
});

// ── AGENT MANAGEMENT ─────────────────────────────────────────────
router.post('/agents/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const newState = await agentSvc.toggleAgentActive(req.params.id);
    req.session.flash = { type:'ok', msg: `Agent ${newState ? 'reactivated' : 'banned'}.` };
  } catch (err) { req.session.flash = { type:'err', msg: err.message }; }
  res.redirect('/admin?tab=agents');
});

// ── PAYMENTS / WEBHOOK LOGS (Admin view) ─────────────────────────
router.get('/payments', requireAdmin, async (req, res) => {
  try {
    const orders = await getAllOrders(200);
    res.render('admin/payments', { title: 'Payments | Admin', flash: req.session.flash || null, orders });
    delete req.session.flash;
  } catch (err) {
    res.render('admin/payments', { title: 'Payments | Admin', flash: { type:'err', msg: err.message }, orders: [] });
  }
});

router.get('/webhook-logs', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { data: logs } = await db.from('webhook_logs').select('*').order('received_at', { ascending: false }).limit(100);
    res.render('admin/webhook-logs', { title: 'Webhook Logs | Admin', flash: null, logs: logs || [] });
  } catch (err) {
    res.render('admin/webhook-logs', { title: 'Webhook Logs | Admin', flash: { type:'err', msg: err.message }, logs: [] });
  }
});

router.post('/settings/promo-banner', requireAdmin, (req, res) => {
  const { active, kicker, title, subtitle, bg_img, cta_text, cta_link } = req.body;
  updatePromoBanner({
    active: active === 'on' || active === 'true' || active === true,
    kicker, title, subtitle, bg_img, cta_text, cta_link,
  });
  req.session.flash = 'Promotional Ad Banner settings updated successfully!';
  res.redirect('/admin');
});

module.exports = router;
