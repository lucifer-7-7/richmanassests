'use strict';
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const path     = require('path');
const { getDB } = require('../db/db');

// ── upload setup (disk buffer → optional cloudinary) ─────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/assets/img/uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-z0-9.]/gi, '-').toLowerCase()),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

async function uploadToCloudinary(localPath, publicId) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;
  const { v2 } = require('cloudinary');
  v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const result = await v2.uploader.upload(localPath, {
    folder: 'richmanassets',
    public_id: publicId,
    overwrite: true,
    transformation: [{ width: 1600, height: 1200, crop: 'limit', quality: 82, fetch_format: 'auto' }],
  });
  // delete local file after cloud upload
  try { require('fs').unlinkSync(localPath); } catch (_) {}
  return result.secure_url;
}

// ── auth middleware ───────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session.admin) return next();
  req.session.flash = 'Please sign in to access the admin panel.';
  res.redirect('/admin/login');
}

// ── hash password once at startup ────────────────────────────────
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

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ── DASHBOARD ────────────────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
  const db = getDB();
  const properties  = db.prepare('SELECT * FROM properties ORDER BY sort_order ASC, created_at DESC').all();
  const enquiries   = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 100').all();
  const stats = {
    total:       db.prepare('SELECT COUNT(*) as c FROM properties').get().c,
    active:      db.prepare('SELECT COUNT(*) as c FROM properties WHERE active=1').get().c,
    enquiries:   db.prepare('SELECT COUNT(*) as c FROM enquiries').get().c,
    unreadEnquiries: db.prepare("SELECT COUNT(*) as c FROM enquiries WHERE is_read=0").get().c,
  };

  res.render('admin/dashboard', {
    flash: req.session.flash || null,
    properties, enquiries, stats,
  });
  delete req.session.flash;
});

// ── ADD PROPERTY ─────────────────────────────────────────────────
router.post('/property', requireAdmin, upload.fields([
  { name: 'img_card',  maxCount: 1  },
  { name: 'img_hero',  maxCount: 1  },
  { name: 'gallery',   maxCount: 10 },
]), async (req, res) => {
    const db   = getDB();
    const body = req.body;
    const files = req.files || {};
    const propId = body.id.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    let imgCard = files.img_card ? await resolveImg(files.img_card[0], propId + '-card') : null;
    let imgHero = files.img_hero ? await resolveImg(files.img_hero[0], propId + '-hero') : null;

    // gallery: upload each, store JSON array
    let galleryUrls = null;
    if (files.gallery && files.gallery.length) {
      const urls = await Promise.all(
        files.gallery.map((f, i) => resolveImg(f, propId + '-gallery-' + i))
      );
      galleryUrls = JSON.stringify(urls.filter(Boolean));
    }

    try {
      db.prepare(`
        INSERT INTO properties
          (id, name, loc, area, type, listing, price, price_val, price_note,
           beds, baths, sqft, subtype, featured, has_img, img_card, img_hero, gallery,
           story_kicker, story_heading, story_body, amenities,
           setting_heading, setting_body, setting_pills,
           emi_label, emi_val, sort_order, active)
        VALUES
          (@id, @name, @loc, @area, @type, @listing, @price, @price_val, @price_note,
           @beds, @baths, @sqft, @subtype, @featured, @has_img, @img_card, @img_hero, @gallery,
           @story_kicker, @story_heading, @story_body, @amenities,
           @setting_heading, @setting_body, @setting_pills,
           @emi_label, @emi_val, @sort_order, 1)
      `).run({
        id:            propId,
        name:          body.name,
        loc:           body.loc,
        area:          body.area || '',
        type:          body.type,
        listing:       body.listing,
        price:         body.price,
        price_val:     parseFloat(body.price_val) || 0,
        price_note:    body.price_note || null,
        beds:          body.beds || null,
        baths:         body.baths || null,
        sqft:          body.sqft || null,
        subtype:       body.subtype || null,
        featured:      body.featured === '1' ? 1 : 0,
        has_img:       (imgCard || imgHero) ? 1 : 0,
        img_card:      imgCard,
        img_hero:      imgHero,
        gallery:       galleryUrls,
        story_kicker:  body.story_kicker || null,
        story_heading: body.story_heading || null,
        story_body:    body.story_body || null,
        amenities:     body.amenities || null,
        setting_heading: body.setting_heading || null,
        setting_body:  body.setting_body || null,
        setting_pills: body.setting_pills || null,
        emi_label:     body.emi_label || null,
        emi_val:       body.emi_val || null,
        sort_order:    parseInt(body.sort_order) || 99,
      });
      req.session.flash = { type:'ok', msg: `Property "${body.name}" added successfully.` };
    } catch (e) {
      req.session.flash = { type:'err', msg: 'Error: ' + e.message };
    }
    res.redirect('/admin');
});

// ── EDIT FORM ─────────────────────────────────────────────────────
router.get('/property/:id/edit', requireAdmin, (req, res) => {
  const db = getDB();
  const p  = db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);
  if (!p) { req.session.flash = { type:'err', msg: 'Property not found.' }; return res.redirect('/admin'); }
  res.render('admin/edit', { p, flash: req.session.flash || null });
  delete req.session.flash;
});

// ── SAVE EDIT ─────────────────────────────────────────────────────
router.post('/property/:id/edit', requireAdmin, upload.fields([
  { name: 'img_card',  maxCount: 1  },
  { name: 'img_hero',  maxCount: 1  },
  { name: 'gallery',   maxCount: 10 },
]), async (req, res) => {
    const db   = getDB();
    const body = req.body;
    const files = req.files || {};
    const id   = req.params.id;

    const existing = db.prepare('SELECT * FROM properties WHERE id=?').get(id);
    if (!existing) { req.session.flash = { type:'err', msg: 'Property not found.' }; return res.redirect('/admin'); }

    const imgCard = files.img_card ? await resolveImg(files.img_card[0], id + '-card') : existing.img_card;
    const imgHero = files.img_hero ? await resolveImg(files.img_hero[0], id + '-hero') : existing.img_hero;

    // gallery: new uploads append to existing; send gallery_remove[] ids to remove specific ones
    let existingGallery = [];
    try { existingGallery = JSON.parse(existing.gallery || '[]'); } catch(_) {}
    // handle removals (indices sent as gallery_remove[]=0&gallery_remove[]=2)
    const removeIdxs = [].concat(body.gallery_remove || []).map(Number);
    existingGallery = existingGallery.filter((_, i) => !removeIdxs.includes(i));
    if (files.gallery && files.gallery.length) {
      const newUrls = await Promise.all(
        files.gallery.map((f, i) => resolveImg(f, id + '-gallery-' + Date.now() + '-' + i))
      );
      existingGallery = existingGallery.concat(newUrls.filter(Boolean));
    }
    const galleryUrls = existingGallery.length ? JSON.stringify(existingGallery) : null;

    try {
      db.prepare(`
        UPDATE properties SET
          name=@name, loc=@loc, area=@area, type=@type, listing=@listing,
          price=@price, price_val=@price_val, price_note=@price_note,
          beds=@beds, baths=@baths, sqft=@sqft, subtype=@subtype,
          featured=@featured, has_img=@has_img, img_card=@img_card, img_hero=@img_hero,
          gallery=@gallery,
          story_kicker=@story_kicker, story_heading=@story_heading, story_body=@story_body,
          amenities=@amenities, setting_heading=@setting_heading, setting_body=@setting_body,
          setting_pills=@setting_pills, emi_label=@emi_label, emi_val=@emi_val, sort_order=@sort_order
        WHERE id=@id
      `).run({
        id,
        name:          body.name,
        loc:           body.loc,
        area:          body.area || '',
        type:          body.type,
        listing:       body.listing,
        price:         body.price,
        price_val:     parseFloat(body.price_val) || 0,
        price_note:    body.price_note || null,
        beds:          body.beds || null,
        baths:         body.baths || null,
        sqft:          body.sqft || null,
        subtype:       body.subtype || null,
        featured:      body.featured === '1' ? 1 : 0,
        has_img:       (imgCard || imgHero) ? 1 : 0,
        img_card:      imgCard,
        img_hero:      imgHero,
        gallery:       galleryUrls,
        story_kicker:  body.story_kicker || null,
        story_heading: body.story_heading || null,
        story_body:    body.story_body || null,
        amenities:     body.amenities || null,
        setting_heading: body.setting_heading || null,
        setting_body:  body.setting_body || null,
        setting_pills: body.setting_pills || null,
        emi_label:     body.emi_label || null,
        emi_val:       body.emi_val || null,
        sort_order:    parseInt(body.sort_order) || 99,
      });
      req.session.flash = { type:'ok', msg: `"${body.name}" updated.` };
    } catch (e) {
      req.session.flash = { type:'err', msg: 'Error: ' + e.message };
    }
    res.redirect('/admin/property/' + id + '/edit');
});

// ── TOGGLE ACTIVE ─────────────────────────────────────────────────
router.post('/property/:id/toggle', requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE properties SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=?').run(req.params.id);
  res.redirect('/admin');
});

// ── DELETE ────────────────────────────────────────────────────────
router.post('/property/:id/delete', requireAdmin, (req, res) => {
  const db = getDB();
  const p  = db.prepare('SELECT name FROM properties WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM properties WHERE id=?').run(req.params.id);
  req.session.flash = { type:'ok', msg: `"${p ? p.name : req.params.id}" deleted.` };
  res.redirect('/admin');
});

// ── ENQUIRY ACTIONS ──────────────────────────────────────────────
router.post('/enquiries/:id/toggle-read', requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE enquiries SET is_read = CASE WHEN is_read=1 THEN 0 ELSE 1 END WHERE id=?').run(req.params.id);
  res.redirect('/admin?tab=enquiries');
});

router.post('/enquiries/mark-all-read', requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE enquiries SET is_read = 1').run();
  res.redirect('/admin?tab=enquiries');
});

router.post('/enquiries/:id/delete', requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM enquiries WHERE id=?').run(req.params.id);
  req.session.flash = { type:'ok', msg: 'Enquiry deleted successfully.' };
  res.redirect('/admin?tab=enquiries');
});

// ── helpers ───────────────────────────────────────────────────────
async function resolveImg(file, publicId) {
  if (!file) return null;
  // try cloudinary upload first
  const cloudUrl = await uploadToCloudinary(file.path, publicId).catch(() => null);
  if (cloudUrl) return cloudUrl;
  // fallback: local path relative to public/
  const rel = file.path.replace(/\\/g, '/').split('public/')[1];
  return rel || file.path;
}

module.exports = router;
