'use strict';
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const { getDB, check } = require('../db/db');
const propSvc  = require('../services/propertyService');
const agentSvc = require('../services/agentService');
const { getAllOrders, initiateRefund } = require('../services/paymentService');
const { getPromoBanner, updatePromoBanner, getUseDummyData, setUseDummyData, getHeroPropertyIds, setHeroPropertyIds } = require('../lib/settings');
const { logSecurityEvent } = require('../lib/securityLog');
const { authLimiter } = require('../middleware/rateLimiter');

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
      // Both Origin and Referer absent — allow through.
      // SameSite=lax cookie policy already prevents cross-site form POSTs.
      // Blocking here causes false logouts on same-origin admin forms.
    }
  }
  next();
});

// ── upload ────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

async function uploadToCloudinaryBuffer(buffer, publicId) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;
  const { v2 } = require('cloudinary');
  v2.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
  return new Promise((resolve, reject) => {
    const stream = v2.uploader.upload_stream({
      folder: 'richmanassets', public_id: publicId, overwrite: true,
      transformation: [{ width: 1600, height: 1200, crop: 'limit', quality: 82, fetch_format: 'auto' }],
    }, (err, result) => err ? reject(err) : resolve(result.secure_url));
    stream.end(buffer);
  });
}

async function resolveImg(file, publicId) {
  if (!file) return null;
  return uploadToCloudinaryBuffer(file.buffer, publicId);
}

// ── auth ──────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session.admin) return next();
  req.session.flash = 'Please sign in to access the admin panel.';
  res.redirect('/admin/login');
}

let PASS_HASH;
function getHash() {
  // No fallback — server.js refuses to boot without ADMIN_PASSWORD.
  if (!PASS_HASH) PASS_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
  return PASS_HASH;
}

// ── LOGIN ────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { flash: req.session.flash || null });
  delete req.session.flash;
});
router.post('/login', authLimiter, (req, res) => {
  const { password } = req.body;
  if (bcrypt.compareSync(password || '', getHash())) {
    req.session.admin = true;
    return req.session.save((err) => {
      res.redirect('/admin');
    });
  }
  // Durable record — a run of these is the only signal that someone is guessing the
  // single admin password, and console output does not survive a restart.
  logSecurityEvent('admin_login_failed', {}, {
    actorType: 'admin',
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  req.session.flash = 'Incorrect password.';
  req.session.save(() => res.redirect('/admin/login'));
});
router.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/admin/login')); });

// ── DASHBOARD ────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const [propsRes, enquiriesRes, agentPropsRes, agentsRes, orders, logsRes, auditRes] = await Promise.all([
      db.from('properties').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      db.from('enquiries').select('*').order('created_at', { ascending: false }).limit(100),
      db.from('agent_properties').select('*, agents(name, email, phone)').neq('status', 'deleted').order('created_at', { ascending: false }).limit(50),
      db.from('agents').select('id, name, email, is_active, created_at').order('created_at', { ascending: false }).limit(20),
      getAllOrders(500),
      db.from('webhook_events').select('*').order('received_at', { ascending: false }).limit(100),
      db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
    ]);

    const properties  = propsRes.data  || [];
    const enquiries   = enquiriesRes.data || [];
    const agentProps  = agentPropsRes.data || [];
    const agents      = agentsRes.data || [];
    const logs        = logsRes.data || [];
    const auditLogs   = auditRes.data || [];

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

    // ── Analytics: fetch page_views aggregates ────────────────────
    let analytics = { totalAll: 0, today: 0, week: 0, month: 0, devices: [], browsers: [], oses: [], countries: [], cities: [], topPages: [], topReferrers: [], trend: [], trendPeak: 0 };
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart  = new Date(now - 7 * 86400000).toISOString();
      const monthStart = new Date(now - 30 * 86400000).toISOString();

      // Fetch recent 2000 page views for client-side aggregation (efficient for moderate traffic)
      const pvRes = await db.from('page_views').select('path, device_type, browser, os, country, city, referrer, created_at')
        .order('created_at', { ascending: false }).limit(2000);
      const pvRows = pvRes.data || [];

      const { count: pvTotal } = await db.from('page_views').select('*', { count: 'exact', head: true });
      const { count: pvToday } = await db.from('page_views').select('*', { count: 'exact', head: true }).gte('created_at', todayStart);
      const { count: pvWeek }  = await db.from('page_views').select('*', { count: 'exact', head: true }).gte('created_at', weekStart);
      const { count: pvMonth } = await db.from('page_views').select('*', { count: 'exact', head: true }).gte('created_at', monthStart);

      analytics.totalAll = pvTotal || 0;
      analytics.today    = pvToday || 0;
      analytics.week     = pvWeek  || 0;
      analytics.month    = pvMonth || 0;

      // Aggregate breakdowns from recent rows
      function topN(arr, key, n) {
        const map = {};
        arr.forEach(r => { const v = r[key] || 'Unknown'; map[v] = (map[v] || 0) + 1; });
        return Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, n).map(([k,v]) => ({ label: k, count: v }));
      }
      analytics.devices     = topN(pvRows, 'device_type', 5);
      analytics.browsers    = topN(pvRows, 'browser', 8);
      analytics.oses        = topN(pvRows, 'os', 8);
      analytics.countries   = topN(pvRows, 'country', 10);
      analytics.cities      = topN(pvRows, 'city', 10);
      analytics.topPages    = topN(pvRows, 'path', 10);

      // Top referrers (clean up)
      const refRows = pvRows.filter(r => r.referrer && !r.referrer.includes(req.get('host') || 'richmanassets'));
      analytics.topReferrers = topN(refRows, 'referrer', 10).map(r => {
        try { r.label = new URL(r.label).hostname; } catch(_) {}
        return r;
      });

      // Daily trend for the last 30 days — every day present (zero-filled) so the
      // chart shows real gaps in traffic instead of silently collapsing them.
      const dayBuckets = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        dayBuckets[d.toISOString().slice(0, 10)] = 0;
      }
      pvRows.forEach(r => {
        if (!r.created_at) return;
        const key = new Date(r.created_at).toISOString().slice(0, 10);
        if (key in dayBuckets) dayBuckets[key]++;
      });
      const trendEntries = Object.entries(dayBuckets);
      const trendPeak = Math.max(1, ...trendEntries.map(([, v]) => v));
      analytics.trend = trendEntries.map(([day, count]) => ({
        day,
        count,
        pct: Math.round((count / trendPeak) * 100),
        label: new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      }));
      analytics.trendPeak = trendPeak;
    } catch (aErr) {
      console.error('[admin/analytics]', aErr.message);
    }

    const [promoBanner, useDummyData, heroIds] = await Promise.all([
      getPromoBanner(),
      getUseDummyData(),
      getHeroPropertyIds(),
    ]);

    const allPropsForHero = [
      ...properties.map(p => ({ id: p.id, name: p.name, img_card: p.img_card })),
      ...agentProps.map(p => ({ id: p.id, name: p.name, img_card: p.img_card })),
    ];

    res.render('admin/dashboard', {
      flash: req.session.flash || null,
      properties, enquiries, agentProps, agents, orders, logs, auditLogs, stats, analytics,
      promoBanner, useDummyData, heroIds, allPropsForHero,
    });
    delete req.session.flash;
  } catch (err) {
    console.error('[admin/dashboard]', err.message);
    res.render('admin/dashboard', { flash: { type:'err', msg: err.message }, properties:[], enquiries:[], agentProps:[], agents:[], orders:[], logs:[], auditLogs:[], stats:{}, analytics:{ totalAll:0, today:0, week:0, month:0, devices:[], browsers:[], oses:[], countries:[], cities:[], topPages:[], topReferrers:[], trend:[], trendPeak:0 }, promoBanner:null, useDummyData:true, heroIds:[], allPropsForHero:[] });
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
      subtype: body.subtype || null, details: body.details ? (typeof body.details === 'object' ? JSON.stringify(body.details) : body.details) : null,
      featured: body.featured === '1',
      has_img: !!(imgCard || imgHero), img_card: imgCard, img_hero: imgHero, gallery: galleryUrls,
      story_kicker: body.story_kicker || null, story_heading: body.story_heading || null, story_body: body.story_body || null,
      amenities: body.amenities || null, setting_heading: body.setting_heading || null,
      setting_body: body.setting_body || null, setting_pills: body.setting_pills || null,
      emi_label: body.emi_label || null, emi_val: body.emi_val || null,
      sort_order: parseInt(body.sort_order) || 99, active: true, is_dummy: false,
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
  const orderIdxs = body.gallery_order
    ? body.gallery_order.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < existingGallery.length)
    : existingGallery.map((_, i) => i);
  existingGallery = orderIdxs.filter((i) => !removeIdxs.includes(i)).map((i) => existingGallery[i]);
  if (files.gallery?.length) {
    const newUrls = await Promise.all(files.gallery.map((f, i) => resolveImg(f, id + '-gallery-' + Date.now() + '-' + i)));
    existingGallery = existingGallery.concat(newUrls.filter(Boolean));
  }

  try {
    await db.from('properties').update({
      name: body.name, loc: body.loc, area: body.area || '', type: body.type, listing: body.listing,
      price: body.price, price_val: parseFloat(body.price_val) || 0, price_note: body.price_note || null,
      beds: body.beds || null, baths: body.baths || null, sqft: body.sqft || null, subtype: body.subtype || null,
      details: body.details !== undefined ? (typeof body.details === 'object' ? JSON.stringify(body.details) : body.details) : existing.details,
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
  req.session.save(() => res.redirect('/admin?tab=enquiries'));
});
router.post('/enquiries/mark-all-read', requireAdmin, async (req, res) => {
  const db = getDB();
  await db.from('enquiries').update({ is_read: true }).eq('is_read', false);
  req.session.save(() => res.redirect('/admin?tab=enquiries'));
});
router.post('/enquiries/:id/delete', requireAdmin, async (req, res) => {
  const db = getDB();
  await db.from('enquiries').delete().eq('id', req.params.id);
  req.session.flash = { type:'ok', msg: 'Enquiry deleted successfully.' };
  req.session.save(() => res.redirect('/admin?tab=enquiries'));
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

// ── AGENT LISTINGS RESTORE (Admin Action) ─────────────────────────
router.post('/agent-listings/:id/restore', requireAdmin, async (req, res) => {
  try {
    await propSvc.restoreProperty(req.params.id);
    req.session.flash = { type: 'ok', msg: 'Listing restored successfully from Trash.' };
  } catch (err) {
    req.session.flash = { type: 'err', msg: err.message };
  }
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

// ── PURGE JUNK / TEST AGENTS (Admin Action) ──────────────────────
router.post('/agents/purge-test-agents', requireAdmin, async (req, res) => {
  const db = getDB();
  try {
    const { data: testAgents } = await db.from('agents').select('id, name, email').or('email.like.agent_test_%,email.like.testagent_%');
    if (testAgents && testAgents.length > 0) {
      const ids = testAgents.map(a => a.id);
      await db.from('agents').delete().in('id', ids);
      req.session.flash = { type: 'ok', msg: `Purged ${ids.length} test/junk accounts from database.` };
    } else {
      req.session.flash = { type: 'ok', msg: 'No test/junk accounts found.' };
    }
  } catch (err) {
    req.session.flash = { type: 'err', msg: err.message };
  }
  res.redirect('/admin?tab=agents');
});

// ── DELETE INDIVIDUAL AGENT ACCOUNT (Admin Action) ───────────────
router.post('/agents/:id/delete', requireAdmin, async (req, res) => {
  const db = getDB();
  try {
    const { data: ag } = await db.from('agents').select('name').eq('id', req.params.id).maybeSingle();
    await db.from('agents').delete().eq('id', req.params.id);
    req.session.flash = { type: 'ok', msg: `Agent "${ag ? ag.name : req.params.id}" deleted permanently.` };
  } catch (err) {
    req.session.flash = { type: 'err', msg: err.message };
  }
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

router.get('/invoices/:orderId', requireAdmin, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const orders = await getAllOrders(500);
    let order = orders.find(o => 
      String(o.internal_order_id) === String(orderId) || 
      String(o.id) === String(orderId) || 

      String(o.razorpay_order_id) === String(orderId) ||
      String(o.property_id) === String(orderId)
    );

    if (!order) {
      const db = getDB();
      // id is BIGINT — only include it in the OR filter when orderId actually looks numeric,
      // otherwise Postgres rejects the whole filter with a type-cast error (e.g. Razorpay's "order_xxx" ids).
      const orFilters = [`internal_order_id.eq.${orderId}`, `razorpay_order_id.eq.${orderId}`];
      if (/^\d+$/.test(orderId)) orFilters.push(`id.eq.${orderId}`);
      const { data: dbOrder } = await db
        .from('payment_orders')
        .select('*, agents(*), agent_properties(*)')
        .or(orFilters.join(','))
        .maybeSingle();
      if (dbOrder) {
        order = dbOrder;
        if (!order.internal_order_id) order.internal_order_id = order.razorpay_order_id || String(order.id);
      }
    }

    if (!order) return res.status(404).send('Invoice not found');

    let agent = order.agents;
    if (!agent && order.agent_id) {
      try {
        const db = getDB();
        const { data: ag } = await db.from('agents').select('*').eq('id', order.agent_id).maybeSingle();
        if (ag) agent = ag;
      } catch (_) {}
    }
    if (!agent) agent = { name: 'Agent #' + (order.agent_id || ''), email: 'agent@richmanassets.com' };

    res.render('agent/invoice-detail', {
      title: `Invoice ${order.internal_order_id || order.id} | RichManAssets`,
      robots: 'noindex,nofollow',
      order,
      agent,
    });
  } catch (err) {
    console.error('[admin/invoices/:orderId]', err.message);
    res.status(500).send('Server error loading invoice');
  }
});

router.get('/webhook-logs', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { data: logs } = await db.from('webhook_events').select('*').order('received_at', { ascending: false }).limit(100);
    res.render('admin/webhook-logs', { title: 'Webhook Logs | Admin', flash: null, logs: logs || [] });
  } catch (err) {
    res.render('admin/webhook-logs', { title: 'Webhook Logs | Admin', flash: { type:'err', msg: err.message }, logs: [] });
  }
});

// ── ADMIN ANALYTICS DASHBOARDS ──────────────────────────────────
const analyticsSvc = require('../services/adminAnalyticsService');

router.get('/analytics/agents', requireAdmin, async (req, res) => {
  try {
    const analytics = await analyticsSvc.getAgentAnalytics();
    res.render('admin/analytics-agents', {
      title: 'Agent Analytics | Admin',
      flash: req.session.flash || null,
      analytics,
    });
    delete req.session.flash;
  } catch (err) {
    console.error('[GET /admin/analytics/agents]', err.message);
    res.status(500).send('Error loading Agent Analytics');
  }
});

router.get('/analytics/enquiries', requireAdmin, async (req, res) => {
  try {
    const analytics = await analyticsSvc.getEnquiryAnalytics();
    res.render('admin/analytics-enquiries', {
      title: 'Enquiry Analytics | Admin',
      flash: req.session.flash || null,
      analytics,
    });
    delete req.session.flash;
  } catch (err) {
    console.error('[GET /admin/analytics/enquiries]', err.message);
    res.status(500).send('Error loading Enquiry Analytics');
  }
});

router.get('/analytics/payments', requireAdmin, async (req, res) => {
  try {
    const analytics = await analyticsSvc.getPaymentAnalytics();
    res.render('admin/analytics-payments', {
      title: 'Payment Analytics & Reconciliation | Admin',
      flash: req.session.flash || null,
      analytics,
    });
    delete req.session.flash;
  } catch (err) {
    console.error('[GET /admin/analytics/payments]', err.message);
    res.status(500).send('Error loading Payment Analytics');
  }
});

// ── ADMIN REFUND ACTION ──────────────────────────────────────────
router.post('/payments/:id/refund', requireAdmin, async (req, res) => {
  const db = getDB();
  const paymentId = req.params.id;
  const { reason, amount_paise } = req.body;

  try {
    const { data: payment } = await db.from('payments').select('*, payment_orders(*)').eq('id', paymentId).single();
    if (!payment) throw new Error('Payment not found');

    if (payment.status === 'refunded') {
      throw new Error('This payment has already been refunded.');
    }
    if (payment.status !== 'captured') {
      throw new Error(`Only captured payments can be refunded (this one is "${payment.status}").`);
    }
    if (!payment.razorpay_payment_id) {
      throw new Error('This payment has no Razorpay payment id and cannot be refunded automatically.');
    }

    // Clamp to what was actually captured. The amount arrives from a form field, and an
    // unclamped parseInt let a typo (or a crafted POST) refund more than the customer paid.
    const requested = parseInt(amount_paise, 10);
    const refundAmount = Number.isInteger(requested) && requested > 0
      ? Math.min(requested, payment.amount_paise)
      : payment.amount_paise;

    const razorpaySvc = require('../services/razorpayService');
    const refundReason = reason || 'Admin Initiated Refund';
    const adminUser = req.session.adminUser || 'admin';

    const rzpRefund = await razorpaySvc.initiateRazorpayRefund({
      razorpay_payment_id: payment.razorpay_payment_id,
      amount_paise: refundAmount,
      notes: { reason: refundReason, admin: adminUser },
    });

    const refundRow = {
      payment_id: payment.id,
      razorpay_refund_id: rzpRefund.id,
      amount_paise: refundAmount,
      status: rzpRefund.status === 'processed' ? 'processed' : 'pending',
      reason: refundReason,
      initiated_by: adminUser,
      created_at: new Date().toISOString(),
    };

    const insertRes = await db.from('refunds').insert(refundRow);
    if (insertRes.error) {
      // Money has already moved — surface it rather than reporting clean success.
      console.error('[Admin Refund] refunds insert failed after Razorpay refund succeeded:', {
        razorpay_refund_id: rzpRefund.id, error: insertRes.error.message,
      });
    }

    await db.from('payments').update({ status: 'refunded' }).eq('id', payment.id);

    if (payment.payment_orders?.razorpay_order_id) {
      await db.from('payment_orders').update({
        status: 'refund_initiated',
        refund_id: rzpRefund.id,
        refund_amount_paise: refundAmount,
        refund_status: rzpRefund.status || 'pending',
        updated_at: new Date().toISOString(),
      }).eq('razorpay_order_id', payment.payment_orders.razorpay_order_id);
    }

    const refundedRs = (refundAmount / 100).toLocaleString('en-IN');
    req.session.flash = { type: 'ok', msg: `Refund of ₹${refundedRs} initiated: ${rzpRefund.id}` };
  } catch (err) {
    console.error('[Admin Refund Error]:', err.message);
    req.session.flash = { type: 'err', msg: err.message };
  }
  res.redirect('/admin/analytics/payments');
});

// ── AGENT DEEP AUDIT VIEW & CONTROLS ─────────────────────────────
router.get('/agents/:id', requireAdmin, async (req, res) => {
  const agentAuthSvc = require('../services/agentAuthService');
  try {
    const auditData = await agentAuthSvc.getAgentFullAudit(req.params.id);
    if (!auditData || !auditData.agent) {
      req.session.flash = { type: 'err', msg: 'Agent not found.' };
      return res.redirect('/admin?tab=agents');
    }
    res.render('admin/agent-detail', {
      title: `Agent: ${auditData.agent.name} | Admin`,
      flash: req.session.flash || null,
      auditData,
    });
    delete req.session.flash;
  } catch (err) {
    console.error('[GET /admin/agents/:id Error]:', err.message);
    res.status(500).send('Error loading Agent profile & audit details.');
  }
});

// ── ADMIN RESET AGENT PASSWORD ───────────────────────────────────
router.post('/agents/:id/reset-password', requireAdmin, async (req, res) => {
  const agentAuthSvc = require('../services/agentAuthService');
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    req.session.flash = { type: 'err', msg: 'Password must be at least 8 characters long.' };
    return res.redirect(`/admin/agents/${req.params.id}`);
  }
  try {
    await agentAuthSvc.resetAgentPassword({
      agentId: req.params.id,
      newPassword: new_password,
      adminUser: 'admin',
    });
    req.session.flash = { type: 'ok', msg: 'Agent password reset successfully. All active sessions revoked.' };
  } catch (err) {
    req.session.flash = { type: 'err', msg: err.message };
  }
  res.redirect(`/admin/agents/${req.params.id}`);
});

// ── ADMIN REVOKE ALL AGENT SESSIONS ──────────────────────────────
router.post('/agents/:id/revoke-sessions', requireAdmin, async (req, res) => {
  const agentAuthSvc = require('../services/agentAuthService');
  try {
    await agentAuthSvc.revokeAgentSessions({
      agentId: req.params.id,
      adminUser: 'admin',
    });
    req.session.flash = { type: 'ok', msg: 'All active sessions for this agent have been forcibly revoked.' };
  } catch (err) {
    req.session.flash = { type: 'err', msg: err.message };
  }
  res.redirect(`/admin/agents/${req.params.id}`);
});

// ── MANUAL AGENT STATUS OVERRIDE ─────────────────────────────────
router.post('/agents/:id/status', requireAdmin, async (req, res) => {
  const agentAuthSvc = require('../services/agentAuthService');
  const { new_status, reason } = req.body;
  try {
    await agentAuthSvc.updateAgentStatus(req.params.id, new_status, reason || 'Admin manual override', 'admin');
    req.session.flash = { type: 'ok', msg: `Agent status updated to "${new_status}".` };
  } catch (err) {
    req.session.flash = { type: 'err', msg: err.message };
  }
  res.redirect(`/admin/agents/${req.params.id}`);
});


router.post('/settings/promo-banner', requireAdmin, upload.single('banner_photo'), async (req, res) => {
  const { active, placement, kicker, title, subtitle, bg_img, cta_text, cta_link } = req.body;
  let bannerImg = bg_img;

  if (req.file) {
    const uploadedUrl = await resolveImg(req.file, `promo-ad-banner-${Date.now()}`);
    if (uploadedUrl) bannerImg = uploadedUrl;
  }

  await updatePromoBanner({
    active: active === 'on' || active === 'true' || active === true,
    placement: placement || 'all',
    kicker, title, subtitle,
    bg_img: bannerImg,
    cta_text, cta_link,
  });

  req.session.flash = { type: 'ok', msg: 'Promotional Ad Banner updated successfully!' };
  res.redirect('/admin');
});

// ── TOGGLE DUMMY DATA ────────────────────────────────────────────
router.post('/settings/toggle-dummy-data', requireAdmin, async (req, res) => {
  try {
    const current = await getUseDummyData();
    await setUseDummyData(!current);
    req.session.flash = { type: 'ok', msg: `Dummy data turned ${!current ? 'ON' : 'OFF'}.` };
  } catch (err) {
    console.error('[toggle-dummy-data]', err.message);
    req.session.flash = { type: 'err', msg: err.message };
  }
  res.redirect('/admin');
});

// ── SET HERO PROPERTIES ──────────────────────────────────────────
router.post('/settings/hero', requireAdmin, async (req, res) => {
  try {
    const ids = [].concat(req.body.hero_ids || []).filter(Boolean).slice(0, 6);
    await setHeroPropertyIds(ids);
    req.session.flash = { type: 'ok', msg: 'Hero section updated.' };
  } catch (err) {
    console.error('[set-hero]', err.message);
    req.session.flash = { type: 'err', msg: err.message };
  }
  res.redirect('/admin');
});

module.exports = router;

