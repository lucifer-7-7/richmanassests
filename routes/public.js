'use strict';
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db/db');

// ── helpers ──────────────────────────────────────────────────────
const ICON_SVGS = {
  home:   '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 16 4l12 9M7 11v15h6v-9h6v9h6V11"/></svg>',
  key:    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="11" r="5"/><path d="M13 13l13 13M22 22l3-3M25 25l3-3"/></svg>',
  coins:  '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="11" cy="8" rx="7" ry="3.2"/><path d="M4 8v6c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2V8"/><path d="M14 17v5c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2v-6c0-1.8-3.1-3.2-7-3.2"/></svg>',
  ruler:  '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="24" height="10" rx="1" transform="rotate(45 16 16)"/><path d="M13 13l2 2M16 10l2 2M19 13l2 2"/></svg>',
  sofa:   '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16v-3a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v3"/><path d="M3 16a2 2 0 0 1 2 2v4h22v-4a2 2 0 0 1 2-2 2 2 0 0 1 2 2v6H1v-6a2 2 0 0 1 2-2zM8 16v-4h16v4"/></svg>',
  scale:  '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4v24M8 28h16M16 7l-9 3 9-3 9 3M7 10l-4 8a4 4 0 0 0 8 0zM25 10l-4 8a4 4 0 0 0 8 0z"/></svg>',
  shield: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3 5 7v8c0 7 5 12 11 14 6-2 11-7 11-14V7z"/><path d="M11 16l4 4 7-8"/></svg>',
  leaf:   '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 26C6 14 16 6 27 6c0 11-8 21-20 21-1 0-1-1-1-1z"/><path d="M6 26 27 6M14 18c2-2 5-3 8-3"/></svg>',
};

const SERVICES = [
  {
    id:'buy-sell', n:'01', title:'Sales', icon:'home',
    desc:'Builder sales, resale flats, independent houses and villas — coastal and city.',
    long_desc:'We handle new launches from builders, resale apartments, independent houses and villas across the coast and the Ghats. Every listing is title-verified before we bring it to you.',
    offers:['Builder project sales','Resale flats & apartments','Independent houses','Villas & luxury homes','NRI property services','Market valuation','Title-clear listings','Documentation support'],
  },
  {
    id:'commercial', n:'02', title:'Commercial Spaces', icon:'ruler',
    desc:'Office space, retail outlets and commercial sites — grade-A and investment-grade.',
    long_desc:'From grade-A office floors to retail showrooms, we source, shortlist and negotiate commercial property for occupiers and investors alike.',
    offers:['Commercial office space','Retail & showroom space','Commercial sites','Industrial sites','Lease & outright purchase','Tenant representation','Investment yield analysis','Commercial legal support'],
  },
  {
    id:'plots', n:'03', title:'Plots & Sites', icon:'leaf',
    desc:'Residential layouts, beach-facing, river-facing, agricultural and industrial sites.',
    long_desc:'We cover the full spectrum of land — residential layout plots, commercial sites, beach-facing and river-facing plots, and verified agricultural land with RTC records.',
    offers:['Residential layout plots','Commercial sites','Beach-facing sites','River-facing sites','Agricultural sites','Industrial sites','RTC verification','RERA-approved layouts'],
  },
  {
    id:'loans', n:'04', title:'Home & Project Loans', icon:'coins',
    desc:'Public and private sector tie-ups — fastest sanction, lowest EMI.',
    long_desc:'Direct banking partnerships with SBI, Bank of Baroda, HDFC, Karnataka Bank and others mean pre-approved rates and faster sanctions than you\'ll find over the counter.',
    offers:['Home loans (public sector)','Home loans (private sector)','Project & construction loans','Plot purchase loans','Balance transfer','Top-up loans','Pre-approved EMI','Doorstep paperwork'],
  },
  {
    id:'interior', n:'05', title:'Interior Design', icon:'sofa',
    desc:'Homes and offices — 3D visualisation, fixed packages, turnkey execution.',
    long_desc:'Fixed-price interior packages with full 3D renders before execution. We cover residential homes, offices and commercial fitouts, with a single point of contact from concept to handover.',
    offers:['Full home interiors','Modular kitchen & wardrobes','Office interiors','Commercial fitouts','3D visualisation','Fixed-price packages','Turnkey execution','Post-handover support'],
  },
  {
    id:'rentals', n:'06', title:'Rentals & Lease', icon:'key',
    desc:'Vetted homes, offices and warehousing, agreements drafted in-house.',
    long_desc:'From furnished holiday lets to long-term commercial leases, we vet both parties, draft agreements in-house and stay on hand for any disputes.',
    offers:['Residential long-term lets','Furnished holiday rentals','Office & commercial space','Retail leasing','Warehouse & industrial','Tenant verification','Agreement drafting','Rent collection'],
  },
  {
    id:'legal', n:'07', title:'Legal Services', icon:'scale',
    desc:'Title checks, due diligence, registration — empaneled with major banks.',
    long_desc:'Our in-house advocate is empaneled with SBI, HDFC and Karnataka Bank — title verification and loan processing move in parallel, not in sequence.',
    offers:['Title search & verification','Due diligence reports','Sale deed drafting','Registration assistance','Encumbrance certificates','Gift & partition deeds','Power of attorney','RERA compliance'],
  },
  {
    id:'manage', n:'08', title:'Property Management', icon:'shield',
    desc:'Tenant management, rent collection and upkeep while you sit back.',
    long_desc:'Ideal for NRIs and investors who own property but cannot actively manage it. We handle everything from tenant-finding to maintenance and rent deposits.',
    offers:['Tenant onboarding','Rent collection & transfer','Maintenance coordination','Periodic inspections','Utility management','Emergency response','Financial reporting','Lease renewals'],
  },
];

const CATEGORIES = [
  { id:'builder',    title:'Builder Sales',      note:'New launches & projects',   img:'samudra-card',    q:'type=Apartment' },
  { id:'resale',     title:'Resale & Homes',     note:'Houses, villas & flats',    img:'mermaid-card',    q:'type=Villa' },
  { id:'commercial', title:'Commercial Spaces',  note:'Offices, retail & sites',   img:'jumeirah-card',   q:'type=Commercial' },
  { id:'plots',      title:'Plots & Sites',      note:'Residential, beach, river', img:'kopparige-card',  q:'type=Plot' },
  { id:'rentals',    title:'Rentals',            note:'Ready to move in',          img:'sashihitlu-card', q:'listing=rent' },
  { id:'agri',       title:'Agricultural Sites', note:'Plantation & yield land',   img:'honeyvale-card',  q:'type=Agricultural' },
];

function withIcons(services) {
  return services.map(s => ({ ...s, icon_svg: ICON_SVGS[s.icon] || '' }));
}

function getAreas(db) {
  return db.prepare("SELECT DISTINCT area FROM properties WHERE active=1 AND area != '' ORDER BY area").all().map(r => r.area);
}

function applyBudgetFilter(q, budget) {
  if (!budget) return q;
  if (budget === 'u30')   return q + ' AND price_val < 3000000';
  if (budget === '30-1c') return q + ' AND price_val >= 3000000 AND price_val < 10000000';
  if (budget === '1-5c')  return q + ' AND price_val >= 10000000 AND price_val < 50000000';
  if (budget === '5c')    return q + ' AND price_val >= 50000000';
  return q;
}

// ── HOME ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDB();
  const heroIds = ['mermaid','kopparige','samudra','tara','honeyvale','ikigai'];
  const heroSlides  = heroIds.map(id => db.prepare('SELECT * FROM properties WHERE id=? AND active=1').get(id)).filter(Boolean);
  const featured    = db.prepare('SELECT * FROM properties WHERE active=1 AND has_img=1 ORDER BY featured DESC, sort_order ASC LIMIT 6').all();
  const allListings = db.prepare('SELECT * FROM properties WHERE active=1 AND has_img=1 ORDER BY sort_order ASC').all();
  const testimonials = db.prepare('SELECT * FROM testimonials WHERE active=1').all();

  res.render('index', {
    title: 'RichManAssets — Premium Property Marketplace · Coastal Karnataka',
    heroSlides,
    featured,
    allListings,
    categories: CATEGORIES,
    services: withIcons(SERVICES),
    testimonials,
    areas: getAreas(db),
  });
});

// ── PROPERTIES BROWSE ────────────────────────────────────────────
router.get('/properties', (req, res) => {
  const db = getDB();
  const { listing, area, type, budget } = req.query;

  let sql = 'SELECT * FROM properties WHERE active=1';
  const params = [];

  if (listing) { sql += ' AND listing=?'; params.push(listing); }
  if (area)    { sql += ' AND area=?';    params.push(area); }
  if (type)    { sql += ' AND type=?';    params.push(type); }
  sql = applyBudgetFilter(sql, budget);
  sql += ' ORDER BY featured DESC, sort_order ASC, price_val DESC';

  const properties = db.prepare(sql).all(...params);

  res.render('properties', {
    title: 'Properties — Buy, Rent & Lease · RichManAssets',
    properties,
    areas: getAreas(db),
    q: { listing, area, type, budget },
  });
});

// ── PROPERTY DETAIL ──────────────────────────────────────────────
router.get('/property/:id', (req, res) => {
  const db = getDB();
  const p  = db.prepare('SELECT * FROM properties WHERE id=? AND active=1').get(req.params.id);
  if (!p) return res.status(404).render('404', { title: 'Property not found — RichManAssets' });

  const similar = db.prepare('SELECT * FROM properties WHERE id != ? AND active=1 AND type=? AND has_img=1 LIMIT 3').all(p.id, p.type);
  const next    = p.next_id ? db.prepare('SELECT * FROM properties WHERE id=? AND active=1').get(p.next_id) : null;

  res.render('property', {
    title: `${p.name} — ${p.loc} · ${p.price} · RichManAssets`,
    p, similar, next,
  });
});

// ── CONTACT ──────────────────────────────────────────────────────
router.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Enquire — Talk to a specialist · RichManAssets',
    ref: req.query.ref || '',
  });
});

// ── SERVICES ─────────────────────────────────────────────────────
router.get('/services', (req, res) => {
  res.render('services', {
    title: 'Services — Real Estate, Loans, Legal, Construction & Interiors · RichManAssets',
    services: withIcons(SERVICES),
    serviceDetails: withIcons(SERVICES),
  });
});

// ── ABOUT ─────────────────────────────────────────────────────────
router.get('/about', (req, res) => {
  const db = getDB();
  const testimonials = db.prepare('SELECT * FROM testimonials WHERE active=1').all();
  res.render('about', {
    title: 'About RichManAssets — Premium Property Consultants in Udupi, Mangaluru & Coastal Karnataka',
    testimonials,
  });
});

// ── LOANS ─────────────────────────────────────────────────────────
router.get('/loans', (req, res) => {
  res.render('loans', {
    title: 'Home Loans & EMI — Partner Bank Rates · RichManAssets',
  });
});

// ── ENQUIRY POST ─────────────────────────────────────────────────
router.post('/enquiry', (req, res) => {
  const db = getDB();
  const { name, phone, email, service, budget, time_pref, message, property_ref, page } = req.body;

  if (!phone && !email) return res.status(400).json({ ok: false });

  db.prepare(`
    INSERT INTO enquiries (name, phone, email, service, budget, time_pref, message, property_ref, page)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name||'', phone||'', email||'', service||'', budget||'', time_pref||'', message||'', property_ref||'', page||'');

  // try to send email notification (non-blocking)
  if (process.env.SMTP_USER && process.env.NOTIFY_EMAIL) {
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      t.sendMail({
        from: process.env.SMTP_USER,
        to: process.env.NOTIFY_EMAIL,
        subject: `New enquiry from ${name || 'website'}`,
        text: `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nService: ${service}\nBudget: ${budget}\nMessage: ${message}\nProperty: ${property_ref}\nPage: ${page}`,
      }).catch(() => {});
    } catch (_) {}
  }

  res.json({ ok: true });
});

module.exports = router;
