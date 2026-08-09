'use strict';
/**
 * routes/agent.js
 * Agent auth, dashboard, property CRUD, profile.
 */
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const { getDB } = require('../db/db');
const requireAgent        = require('../middleware/requireAgent');
const requirePropertyOwner = require('../middleware/requirePropertyOwner');
const { authLimiter }     = require('../middleware/rateLimiter');
const agentSvc  = require('../services/agentService');
const propSvc   = require('../services/propertyService');
const { getListingFee } = require('../services/paymentService');
const { logSecurityEvent } = require('../lib/securityLog');

// ── multer setup ─────────────────────────────────────────────────
// Memory storage only — no disk writes. Vercel /tmp is ephemeral and
// shared across warm invocations; writing large files there risked
// filling it up and crashing the function outright. Client-side
// compression (agent-image-compress.js) keeps buffers small before
// they ever reach this handler.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB hard ceiling (safety net; client compresses to ~3MB)
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, WebP images are allowed.'));
  },
});

async function uploadToCloudinary(buffer, publicId) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;
  const { v2 } = require('cloudinary');
  v2.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
  return new Promise((resolve, reject) => {
    const stream = v2.uploader.upload_stream({
      folder: 'richmanassets/agents',
      public_id: publicId,
      overwrite: true,
      transformation: [{ width: 1600, height: 1200, crop: 'limit', quality: 82, fetch_format: 'auto' }],
    }, (err, result) => err ? reject(err) : resolve(result.secure_url));
    stream.end(buffer);
  });
}

async function resolveImg(file, publicId) {
  if (!file) return null;
  return uploadToCloudinary(file.buffer, publicId);
}


// ── CSRF helpers (double-submit cookie, no extra package) ────────
function genCsrf(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}
function checkCsrf(req, res, next) {
  const token = req.body._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render('agent/login', {
      title: 'Session Expired',
      robots: 'noindex,nofollow',
      flash: { type: 'err', msg: 'Session expired. Please try again.' },
      csrfToken: genCsrf(req),
      next: '/agent/dashboard',
    });
  }
  next();
}

// ────────────────────────── AUTH ─────────────────────────────────

// GET /agent/register
router.get('/register', (req, res) => {
  if (req.session.agent) return res.redirect('/agent/dashboard');
  res.render('agent/register', {
    title: 'Register as Agent | RichManAssets',
    robots: 'noindex,nofollow',
    flash: null,
    csrfToken: genCsrf(req),
  });
});

// POST /agent/register
router.post('/register', authLimiter, checkCsrf, async (req, res) => {
  const { name, email, phone, password, company_name, city, rera_number, gst_number } = req.body;
  try {
    const agentAuthSvc = require('../services/agentAuthService');
    const agent = await agentAuthSvc.registerAgent({
      name, email, phone, password, company_name, city, rera_number, gst_number
    });
    req.session.agent = { id: agent.id, name: agent.name, email: agent.email, status: agent.status };
    res.redirect('/agent/verify-otp');
  } catch (err) {
    res.render('agent/register', {
      title: 'Register as Agent | RichManAssets',
      robots: 'noindex,nofollow',
      flash: { type: 'err', msg: err.message },
      csrfToken: genCsrf(req),
    });
  }
});

// GET /agent/verify-otp
router.get('/verify-otp', requireAgent, (req, res) => {
  res.render('agent/verify-otp', {
    title: 'Verify Account | RichManAssets Agent',
    robots: 'noindex,nofollow',
    agent: req.agent,
    flash: null,
    csrfToken: genCsrf(req),
  });
});

// POST /agent/verify-otp
router.post('/verify-otp', requireAgent, checkCsrf, async (req, res) => {
  try {
    const agentAuthSvc = require('../services/agentAuthService');
    const updatedAgent = await agentAuthSvc.verifyAgentAccount(req.agent.id);
    req.session.agent.status = updatedAgent.status;
    // Onboarding is free — a verified agent goes straight to work. Payment happens
    // per listing at publish time.
    res.redirect('/agent/listings');
  } catch (err) {
    res.render('agent/verify-otp', {
      title: 'Verify Account | RichManAssets Agent',
      robots: 'noindex,nofollow',
      agent: req.agent,
      flash: { type: 'err', msg: err.message },
      csrfToken: genCsrf(req),
    });
  }
});

// The former GET /agent/checkout (annual membership) is gone — onboarding is free.
// Anyone with a bookmark lands on their listings, where the per-listing fee is paid.
router.get('/checkout', requireAgent, (req, res) => res.redirect('/agent/listings'));


// GET /agent/login
router.get('/login', (req, res) => {
  if (req.session.agent) return res.redirect('/agent/dashboard');
  const reason = req.query.reason === 'banned' ? 'Your account has been suspended.' : null;
  res.render('agent/login', {
    title: 'Agent Login | RichManAssets',
    robots: 'noindex,nofollow',
    flash: reason ? { type: 'err', msg: reason } : (req.session.agentFlash || null),
    csrfToken: genCsrf(req),
    next: req.query.next || '/agent/dashboard',
  });
  delete req.session.agentFlash;
});

// POST /agent/login
router.post('/login', authLimiter, checkCsrf, async (req, res) => {
  const { email, password } = req.body;
  const nextUrl = req.body.next || '/agent/dashboard';
  try {
    const agentAuthSvc = require('../services/agentAuthService');
    const agent = await agentAuthSvc.authenticateAgent(email, password);
    if (!agent) {
      await logSecurityEvent('agent_login_failed', { email }, {
        actorType: 'agent',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      return res.render('agent/login', {
        title: 'Agent Login | RichManAssets',
        robots: 'noindex,nofollow',
        flash: { type: 'err', msg: 'Invalid email or password.' },
        csrfToken: genCsrf(req),
        next: nextUrl,
      });
    }

    if (['suspended', 'deactivated'].includes(agent.status) || agent.is_active === false) {
      return res.render('agent/login', {
        title: 'Agent Login | RichManAssets',
        robots: 'noindex,nofollow',
        flash: { type: 'err', msg: 'Your agent account has been suspended or deactivated.' },
        csrfToken: genCsrf(req),
        next: nextUrl,
      });
    }

    req.session.regenerate(async (err) => {
      if (err) throw err;
      const loginTime = Date.now();
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      req.session.agentLoginTime = loginTime;
      req.session.agent = { id: agent.id, name: agent.name, email: agent.email, status: agent.status };

      // Record sign-in log with IP & User Agent
      await agentAuthSvc.recordLoginLog({
        agentId: agent.id,
        ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        status: 'success',
      });

      if (agent.status === 'draft') return res.redirect('/agent/verify-otp');

      res.redirect(nextUrl.startsWith('/agent') ? nextUrl : '/agent/dashboard');
    });

  } catch (err) {
    res.render('agent/login', {
      title: 'Agent Login | RichManAssets',
      robots: 'noindex,nofollow',
      flash: { type: 'err', msg: err.message },
      csrfToken: genCsrf(req),
      next: nextUrl,
    });
  }
});


// POST /agent/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/agent/login'));
});
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/agent/login'));
});

// ────────────────────────── DASHBOARD ────────────────────────────

// GET /agent/dashboard
router.get('/dashboard', requireAgent, async (req, res) => {
  try {
    const listings = await propSvc.getAgentListings(req.agent.id);
    const fee = await getListingFee();
    const stats = {
      total:     listings.length,
      published: listings.filter(l => l.status === 'published').length,
      draft:     listings.filter(l => ['draft','payment_failed','payment_pending'].includes(l.status)).length,
      expired:   listings.filter(l => l.status === 'expired').length,
    };
    res.render('agent/dashboard', {
      title: 'My Dashboard | RichManAssets Agent',
      robots: 'noindex,nofollow',
      agent: req.agent,
      listings: listings.slice(0, 5),
      stats,
      feeRs: (fee.amount_paise / 100).toLocaleString('en-IN'),
      welcome: req.query.welcome === '1',
      flash: req.session.agentFlash || null,
    });
    delete req.session.agentFlash;
  } catch (err) {
    console.error('[dashboard]', err.message);
    res.render('agent/dashboard', { title: 'Dashboard', robots: 'noindex,nofollow', agent: req.agent, listings: [], stats: {}, feeRs: '999', welcome: false, flash: { type:'err', msg: 'Could not load dashboard.' } });
  }
});

// ────────────────────── PROPERTY LISTINGS ────────────────────────

// GET /agent/listings
router.get('/listings', requireAgent, async (req, res) => {
  try {
    const { status } = req.query;
    const listings = await propSvc.getAgentListings(req.agent.id, status || null);
    const fee = await getListingFee();
    res.render('agent/listings', {
      title: 'My Listings | RichManAssets Agent',
      robots: 'noindex,nofollow',
      agent: req.agent,
      listings,
      filterStatus: status || 'all',
      feeRs: (fee.amount_paise / 100).toLocaleString('en-IN'),
      flash: req.session.agentFlash || null,
      csrfToken: genCsrf(req),
    });
    delete req.session.agentFlash;
  } catch (err) {
    res.render('agent/listings', { title: 'My Listings', robots: 'noindex,nofollow', agent: req.agent, listings: [], filterStatus: 'all', feeRs: '999', flash: { type:'err', msg: err.message }, csrfToken: genCsrf(req) });
  }
});

// GET /agent/listings/new
router.get('/listings/new', requireAgent, (req, res) => {
  res.render('agent/listing-form', {
    title: 'Add New Listing | RichManAssets Agent',
    robots: 'noindex,nofollow',
    agent: req.agent,
    prop: null,
    isEdit: false,
    flash: null,
    csrfToken: genCsrf(req),
  });
});

// POST /agent/listings  — create draft
router.post('/listings', requireAgent, upload.fields([
  { name: 'img_card', maxCount: 1 },
  { name: 'img_hero', maxCount: 1 },
  { name: 'gallery',  maxCount: 10 },
]), checkCsrf, async (req, res) => {
  const errs = propSvc.validateProperty(req.body);
  if (errs.length) {
    return res.render('agent/listing-form', {
      title: 'Add New Listing | RichManAssets Agent',
      robots: 'noindex,nofollow',
      agent: req.agent,
      prop: req.body,
      isEdit: false,
      flash: { type: 'err', msg: errs.join(' ') },
      csrfToken: genCsrf(req),
    });
  }
  try {
    const files = req.files || {};
    if (!files.img_card && !files.img_hero && !files.gallery) {
      return res.render('agent/listing-form', {
        title: 'Add New Listing | RichManAssets Agent',
        robots: 'noindex,nofollow',
        agent: req.agent,
        prop: req.body,
        isEdit: false,
        flash: { type: 'err', msg: 'Please upload at least one property image.' },
        csrfToken: genCsrf(req),
      });
    }
    const propId = req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + Date.now().toString(36);
    const imgCard = files.img_card ? await resolveImg(files.img_card[0], `agent-${req.agent.id}-${propId}-card`) : null;
    const imgHero = files.img_hero ? await resolveImg(files.img_hero[0], `agent-${req.agent.id}-${propId}-hero`) : null;
    const gallery = files.gallery  ? await Promise.all(files.gallery.map((f, i) => resolveImg(f, `agent-${req.agent.id}-${propId}-g${i}`))) : [];

    const prop = await propSvc.createDraft(req.agent.id, req.body, { img_card: imgCard, img_hero: imgHero, gallery: gallery.filter(Boolean) });

    // Redirect to payment flow
    req.session.agentFlash = { type: 'ok', msg: `Listing saved as draft. Complete payment to publish it.` };
    res.redirect(`/agent/listings/${encodeURIComponent(prop.id)}/pay`);
  } catch (err) {
    res.render('agent/listing-form', {
      title: 'Add New Listing | RichManAssets Agent',
      robots: 'noindex,nofollow',
      agent: req.agent,
      prop: req.body,
      isEdit: false,
      flash: { type: 'err', msg: err.message },
      csrfToken: genCsrf(req),
    });
  }
});

// GET /agent/listings/:id/edit
router.get('/listings/:id/edit', requireAgent, requirePropertyOwner, (req, res) => {
  const prop = req.property;
  if (!['draft','payment_failed'].includes(prop.status)) {
    req.session.agentFlash = { type: 'err', msg: 'Only draft listings can be edited.' };
    return res.redirect('/agent/listings');
  }
  res.render('agent/listing-form', {
    title: `Edit: ${prop.name} | RichManAssets Agent`,
    robots: 'noindex,nofollow',
    agent: req.agent,
    prop,
    isEdit: true,
    flash: null,
    csrfToken: genCsrf(req),
  });
});

// POST /agent/listings/:id/edit
router.post('/listings/:id/edit', requireAgent, requirePropertyOwner, upload.fields([
  { name: 'img_card', maxCount: 1 },
  { name: 'img_hero', maxCount: 1 },
  { name: 'gallery',  maxCount: 10 },
]), checkCsrf, async (req, res) => {
  const errs = propSvc.validateProperty(req.body);
  if (errs.length) {
    return res.render('agent/listing-form', {
      title: `Edit Listing | RichManAssets Agent`,
      robots: 'noindex,nofollow',
      agent: req.agent, prop: { ...req.property, ...req.body }, isEdit: true,
      flash: { type: 'err', msg: errs.join(' ') }, csrfToken: genCsrf(req),
    });
  }
  try {
    const files   = req.files || {};
    const propId  = req.params.id;
    const imgCard = files.img_card ? await resolveImg(files.img_card[0], `agent-${req.agent.id}-${propId}-card`) : null;
    const imgHero = files.img_hero ? await resolveImg(files.img_hero[0], `agent-${req.agent.id}-${propId}-hero`) : null;
    const gallery = files.gallery  ? await Promise.all(files.gallery.map((f, i) => resolveImg(f, `agent-${req.agent.id}-${propId}-g${i}-${Date.now()}`))) : [];

    await propSvc.updateDraft(propId, req.agent.id, req.body, { img_card: imgCard, img_hero: imgHero, gallery: gallery.filter(Boolean) });
    req.session.agentFlash = { type: 'ok', msg: 'Listing updated.' };
    res.redirect(`/agent/listings/${encodeURIComponent(propId)}/pay`);
  } catch (err) {
    res.render('agent/listing-form', {
      title: 'Edit Listing | RichManAssets Agent',
      robots: 'noindex,nofollow',
      agent: req.agent, prop: req.property, isEdit: true,
      flash: { type: 'err', msg: err.message }, csrfToken: genCsrf(req),
    });
  }
});

// GET /agent/listings/:id/pay  — payment page
router.get('/listings/:id/pay', requireAgent, requirePropertyOwner, async (req, res) => {
  const prop = req.property;
  if (prop.status === 'published') {
    req.session.agentFlash = { type: 'ok', msg: 'This listing is already published.' };
    return res.redirect('/agent/listings');
  }
  try {
    const fee = await getListingFee();
    res.render('agent/payment', {
      title: `Pay to Publish: ${prop.name} | RichManAssets Agent`,
      robots: 'noindex,nofollow',
      agent: req.agent,
      prop,
      fee,
      feeRs: (fee.amount_paise / 100).toLocaleString('en-IN'),
      flash: req.session.agentFlash || null,
    });
    delete req.session.agentFlash;
  } catch (err) {
    res.redirect('/agent/listings');
  }
});

// POST /agent/listings/:id/delete
router.post('/listings/:id/delete', requireAgent, requirePropertyOwner, checkCsrf, async (req, res) => {
  try {
    await propSvc.deleteDraft(req.params.id, req.agent.id);
    req.session.agentFlash = { type: 'ok', msg: 'Draft listing deleted.' };
  } catch (err) {
    req.session.agentFlash = { type: 'err', msg: err.message };
  }
  res.redirect('/agent/listings');
});

// ────────────────────────── MANAGE PUBLISHED LISTING ─────────────

// GET /agent/listings/:id/manage
router.get('/listings/:id/manage', requireAgent, requirePropertyOwner, (req, res) => {
  const prop = req.property;
  if (!['published', 'expired'].includes(prop.status)) {
    req.session.agentFlash = { type: 'err', msg: 'Only published or expired listings can be managed here.' };
    return res.redirect('/agent/listings');
  }
  let gallery = [];
  try { gallery = JSON.parse(prop.gallery || '[]'); } catch (_) {}
  res.render('agent/manage-listing', {
    title: `Manage: ${prop.name} | RichManAssets Agent`,
    robots: 'noindex,nofollow',
    agent: req.agent,
    prop,
    gallery,
    flash: req.session.agentFlash || null,
    csrfToken: genCsrf(req),
  });
  delete req.session.agentFlash;
});

// POST /agent/listings/:id/manage
router.post('/listings/:id/manage', requireAgent, requirePropertyOwner, upload.fields([
  { name: 'img_card', maxCount: 1 },
  { name: 'img_hero', maxCount: 1 },
  { name: 'gallery',  maxCount: 10 },
]), checkCsrf, async (req, res) => {
  const propId = req.params.id;
  try {
    const files   = req.files || {};
    const imgCard = files.img_card ? await resolveImg(files.img_card[0], `agent-${req.agent.id}-${propId}-card`) : null;
    const imgHero = files.img_hero ? await resolveImg(files.img_hero[0], `agent-${req.agent.id}-${propId}-hero`) : null;
    const gallery = files.gallery  ? await Promise.all(files.gallery.map((f, i) => resolveImg(f, `agent-${req.agent.id}-${propId}-g${i}-${Date.now()}`))) : [];

    await propSvc.updatePublishedListing(propId, req.agent.id, req.body, {
      img_card: imgCard, img_hero: imgHero, gallery: gallery.filter(Boolean),
    });
    req.session.agentFlash = { type: 'ok', msg: 'Listing updated successfully.' };
    res.redirect(`/agent/listings/${encodeURIComponent(propId)}/manage`);
  } catch (err) {
    req.session.agentFlash = { type: 'err', msg: err.message };
    res.redirect(`/agent/listings/${encodeURIComponent(propId)}/manage`);
  }
});


// ────────────────────────── PROFILE ──────────────────────────────

// GET /agent/profile
router.get('/profile', requireAgent, async (req, res) => {
  try {
    const agent = await agentSvc.getAgentById(req.agent.id);
    res.render('agent/profile', {
      title: 'My Profile | RichManAssets Agent',
      robots: 'noindex,nofollow',
      agent,
      flash: req.session.agentFlash || null,
      csrfToken: genCsrf(req),
    });
    delete req.session.agentFlash;
  } catch (err) {
    res.redirect('/agent/dashboard');
  }
});

// POST /agent/profile
router.post('/profile', requireAgent, checkCsrf, async (req, res) => {
  try {
    const updated = await agentSvc.updateAgentProfile(req.agent.id, req.body);
    req.session.agent = { id: updated.id, name: updated.name, email: updated.email };
    req.session.agentFlash = { type: 'ok', msg: 'Profile updated successfully.' };
  } catch (err) {
    req.session.agentFlash = { type: 'err', msg: err.message };
  }
  res.redirect('/agent/profile');
});

// ────────────────────────── ENQUIRIES & LEADS ──────────────────────

// GET /agent/enquiries
router.get('/enquiries', requireAgent, async (req, res) => {
  try {
    const db = getDB();
    const agentId = req.agent.id;

    const { data: enquiriesData } = await db
      .from('enquiries')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    const enquiries = enquiriesData || [];

    res.render('agent/enquiries', {
      title: 'Property Enquiries & Leads | RichManAssets Agent',
      robots: 'noindex,nofollow',
      agent: req.agent,
      enquiries,
      flash: req.session.agentFlash || null,
      csrfToken: genCsrf(req),
    });
    delete req.session.agentFlash;
  } catch (err) {
    console.error('[/agent/enquiries] error:', err.message);
    res.redirect('/agent/dashboard');
  }
});

// POST /agent/enquiries/:id/read
router.post('/enquiries/:id/read', requireAgent, checkCsrf, async (req, res) => {
  try {
    const db = getDB();
    await db.from('enquiries').update({ is_read: true }).eq('id', req.params.id).eq('agent_id', req.agent.id);
    req.session.agentFlash = { type: 'ok', msg: 'Lead marked as read.' };
  } catch (err) {
    req.session.agentFlash = { type: 'err', msg: err.message };
  }
  res.redirect('/agent/enquiries');
});

module.exports = router;
