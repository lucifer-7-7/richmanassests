'use strict';
const express = require('express');
const router = express.Router();
const { getDB } = require('../db/db');
const { getPromoBanner } = require('../lib/settings');

// canonical site origin (production domain) for SEO tags
const SITE = process.env.SITE_URL || 'https://richmanassets.com';
const canon = (path) => SITE + path;

// ── helpers ──────────────────────────────────────────────────────
const ICON_SVGS = {
  home: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 16 4l12 9M7 11v15h6v-9h6v9h6V11"/></svg>',
  key: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="11" r="5"/><path d="M13 13l13 13M22 22l3-3M25 25l3-3"/></svg>',
  coins: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="11" cy="8" rx="7" ry="3.2"/><path d="M4 8v6c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2V8"/><path d="M14 17v5c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2v-6c0-1.8-3.1-3.2-7-3.2"/></svg>',
  ruler: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="24" height="10" rx="1" transform="rotate(45 16 16)"/><path d="M13 13l2 2M16 10l2 2M19 13l2 2"/></svg>',
  sofa: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16v-3a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v3"/><path d="M3 16a2 2 0 0 1 2 2v4h22v-4a2 2 0 0 1 2-2 2 2 0 0 1 2 2v6H1v-6a2 2 0 0 1 2-2zM8 16v-4h16v4"/></svg>',
  scale: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4v24M8 28h16M16 7l-9 3 9-3 9 3M7 10l-4 8a4 4 0 0 0 8 0zM25 10l-4 8a4 4 0 0 0 8 0z"/></svg>',
  shield: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3 5 7v8c0 7 5 12 11 14 6-2 11-7 11-14V7z"/><path d="M11 16l4 4 7-8"/></svg>',
  leaf: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 26C6 14 16 6 27 6c0 11-8 21-20 21-1 0-1-1-1-1z"/><path d="M6 26 27 6M14 18c2-2 5-3 8-3"/></svg>',
};

const SERVICES = [
  {
    id: 'buy-sell', n: '01', title: 'Sales', icon: 'home',
    desc: 'Builder sales, resale flats, independent houses and villas across the coast and city.',
    long_desc: 'We handle new launches from builders, resale apartments, independent houses and villas across the coast and the Ghats. Every listing is title-verified before we bring it to you.',
    offers: ['Builder project sales', 'Resale flats & apartments', 'Independent houses', 'Villas & luxury homes', 'NRI property services', 'Market valuation', 'Title-clear listings', 'Documentation support'],
  },
  {
    id: 'commercial', n: '02', title: 'Commercial Spaces', icon: 'ruler',
    desc: 'Office space, retail outlets and commercial sites, grade-A and investment-grade.',
    long_desc: 'From grade-A office floors to retail showrooms, we source, shortlist and negotiate commercial property for occupiers and investors alike.',
    offers: ['Commercial office space', 'Retail & showroom space', 'Commercial sites', 'Industrial sites', 'Lease & outright purchase', 'Tenant representation', 'Investment yield analysis', 'Commercial legal support'],
  },
  {
    id: 'plots', n: '03', title: 'Plots & Sites', icon: 'leaf',
    desc: 'Residential layouts, beach-facing, river-facing, agricultural and industrial sites.',
    long_desc: 'We cover the full spectrum of land: residential layout plots, commercial sites, beach-facing and river-facing plots, and verified agricultural land with RTC records.',
    offers: ['Residential layout plots', 'Commercial sites', 'Beach-facing sites', 'River-facing sites', 'Agricultural sites', 'Industrial sites', 'RTC verification', 'RERA-approved layouts'],
  },
  {
    id: 'loans', n: '04', title: 'Home & Project Loans', icon: 'coins',
    desc: 'Public and private sector tie-ups for the fastest sanction and lowest EMI.',
    long_desc: 'Direct banking partnerships with SBI, Bank of Baroda, HDFC, Karnataka Bank and others mean pre-approved rates and faster sanctions than you\'ll find over the counter.',
    offers: ['Home loans (public sector)', 'Home loans (private sector)', 'Project & construction loans', 'Plot purchase loans', 'Balance transfer', 'Top-up loans', 'Pre-approved EMI', 'Doorstep paperwork'],
  },
  {
    id: 'interior', n: '05', title: 'Interior Design', icon: 'sofa',
    desc: 'Homes and offices, with 3D visualisation, fixed packages and turnkey execution.',
    long_desc: 'Fixed-price interior packages with full 3D renders before execution. We cover residential homes, offices and commercial fitouts, with a single point of contact from concept to handover.',
    offers: ['Full home interiors', 'Modular kitchen & wardrobes', 'Office interiors', 'Commercial fitouts', '3D visualisation', 'Fixed-price packages', 'Turnkey execution', 'Post-handover support'],
  },
  {
    id: 'rentals', n: '06', title: 'Rentals & Lease', icon: 'key',
    desc: 'Vetted homes, offices and warehousing, agreements drafted in-house.',
    long_desc: 'From furnished holiday lets to long-term commercial leases, we vet both parties, draft agreements in-house and stay on hand for any disputes.',
    offers: ['Residential long-term lets', 'Furnished holiday rentals', 'Office & commercial space', 'Retail leasing', 'Warehouse & industrial', 'Tenant verification', 'Agreement drafting', 'Rent collection'],
  },
  {
    id: 'legal', n: '07', title: 'Legal Services', icon: 'scale',
    desc: 'Title checks, due diligence and registration, empaneled with major banks.',
    long_desc: 'Our in-house advocate is empaneled with SBI, HDFC and Karnataka Bank, so title verification and loan processing move in parallel, not in sequence.',
    offers: ['Title search & verification', 'Due diligence reports', 'Sale deed drafting', 'Registration assistance', 'Encumbrance certificates', 'Gift & partition deeds', 'Power of attorney', 'RERA compliance'],
  },
  {
    id: 'manage', n: '08', title: 'Property Management', icon: 'shield',
    desc: 'Tenant management, rent collection and upkeep while you sit back.',
    long_desc: 'Ideal for NRIs and investors who own property but cannot actively manage it. We handle everything from tenant-finding to maintenance and rent deposits.',
    offers: ['Tenant onboarding', 'Rent collection & transfer', 'Maintenance coordination', 'Periodic inspections', 'Utility management', 'Emergency response', 'Financial reporting', 'Lease renewals'],
  },
];

const CATEGORIES = [
  { id: 'builder', title: 'Builder Sales', note: 'New launches & projects', img: 'samudra-card', q: 'type=Apartment' },
  { id: 'resale', title: 'Resale & Homes', note: 'Houses, villas & flats', img: 'mermaid-card', q: 'type=Villa' },
  { id: 'commercial', title: 'Commercial Spaces', note: 'Offices, retail & sites', img: 'jumeirah-card', q: 'type=Commercial' },
  { id: 'plots', title: 'Plots & Sites', note: 'Residential, beach, river', img: 'kopparige-card', q: 'type=Plot' },
  { id: 'rentals', title: 'Rentals', note: 'Ready to move in', img: 'sashihitlu-card', q: 'listing=rent' },
  { id: 'agri', title: 'Agricultural Sites', note: 'Plantation & yield land', img: 'honeyvale-card', q: 'type=Agricultural' },
];

function withIcons(services) {
  return services.map(s => ({ ...s, icon_svg: ICON_SVGS[s.icon] || '' }));
}

async function getAreas(db) {
  const { data } = await db.from('properties').select('area').eq('active', true).neq('area', '');
  if (!data) return [];
  return [...new Set(data.map(r => r.area).filter(Boolean))].sort();
}

function applyBudgetFilter(q, budget) {
  if (!budget) return q;
  if (budget === 'u30') return q + ' AND price_val < 3000000';
  if (budget === '30-1c') return q + ' AND price_val >= 3000000 AND price_val < 10000000';
  if (budget === '1-5c') return q + ' AND price_val >= 10000000 AND price_val < 50000000';
  if (budget === '5c') return q + ' AND price_val >= 50000000';
  return q;
}

// ── HOME ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const heroIds = ['mermaid', 'kopparige', 'samudra', 'tara', 'honeyvale', 'ikigai'];

    const [allRes, testimonialsRes, areasRes] = await Promise.all([
      db.from('properties').select('*').eq('active', true).eq('has_img', true).order('sort_order', { ascending: true }),
      db.from('testimonials').select('*').eq('active', true),
      db.from('properties').select('area').eq('active', true).neq('area', ''),
    ]);

    const allProps    = allRes.data || [];
    const testimonials = testimonialsRes.data || [];
    const areas = [...new Set((areasRes.data || []).map(r => r.area).filter(Boolean))].sort();

    // hero slides: prioritise named IDs, fall back to first 6 featured
    const heroSlides = heroIds
      .map(id => allProps.find(p => p.id === id))
      .filter(Boolean)
      .slice(0, 6);
    const finalHero = heroSlides.length ? heroSlides : allProps.filter(p => p.featured).slice(0, 6);

    const allListings = allProps;

    res.render('index', {
      title: 'Real Estate in Udupi & Mangaluru: Villas, Flats, Plots, Rentals | RichManAssets',
      description: 'Buy, rent or lease property in Udupi, Mangaluru & coastal Karnataka. Verified villas, apartments, plots, commercial space & agricultural land, plus home loans, legal & interiors under one roof.',
      canonical: canon('/'),
      siteUrl: SITE,
      heroSlides: finalHero,
      featured: allProps.filter(p => p.featured).slice(0, 6),
      allListings,
      categories: CATEGORIES,
      services: withIcons(SERVICES),
      testimonials,
      areas,
      promoBanner: getPromoBanner(),
    });
  } catch (err) {
    console.error('[/] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── PROPERTIES BROWSE ────────────────────────────────────────────
router.get('/properties', async (req, res) => {
  try {
    const db = getDB();
    const { listing, area, type, budget } = req.query;

    let query = db.from('properties').select('*').eq('active', true);
    if (listing) query = query.eq('listing', listing);
    if (area)    query = query.eq('area', area);
    if (type)    query = query.eq('type', type);
    if (budget === 'u30')   query = query.lt('price_val', 3000000);
    if (budget === '30-1c') query = query.gte('price_val', 3000000).lt('price_val', 10000000);
    if (budget === '1-5c')  query = query.gte('price_val', 10000000).lt('price_val', 50000000);
    if (budget === '5c')    query = query.gte('price_val', 50000000);
    query = query.order('featured', { ascending: false }).order('sort_order', { ascending: true }).order('price_val', { ascending: false });

    const [propsRes, areasRes] = await Promise.all([
      query,
      db.from('properties').select('area').eq('active', true).neq('area', ''),
    ]);
    const properties = propsRes.data || [];
    const areas = [...new Set((areasRes.data || []).map(r => r.area).filter(Boolean))].sort();

    const listLabel = listing === 'rent' ? 'for Rent' : listing === 'lease' ? 'for Lease' : listing === 'sale' ? 'for Sale' : 'for Sale, Rent & Lease';
    const typeLabel = type ? (type === 'Plot' ? 'Plots' : type + 's') : 'Property';
    const where = area ? ` in ${area}` : ' in Udupi & Mangaluru';
    const pageTitle = `${typeLabel} ${listLabel}${where} | RichManAssets`;
    const pageDesc = `Browse ${properties.length} verified ${typeLabel.toLowerCase()} ${listLabel.toLowerCase()}${where} and across coastal Karnataka. Title-checked listings with photos, price and direct enquiry.`;
    const canonPath = '/properties' + (area ? '?area=' + encodeURIComponent(area) : '');

    const itemList = {
      '@context': 'https://schema.org', '@type': 'ItemList',
      'name': pageTitle, 'description': pageDesc,
      'numberOfItems': properties.length,
      'itemListElement': properties.slice(0, 20).map((p, i) => ({
        '@type': 'ListItem', 'position': i + 1,
        'url': `${SITE}/property/${p.id}`, 'name': `${p.name}, ${p.loc}`,
      })),
    };
    const breadcrumbLdList = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', position: 1, name: 'Home', item: canon('/') },
        { '@type': 'ListItem', position: 2, name: 'Properties', item: canon('/properties') },
        ...(area ? [{ '@type': 'ListItem', position: 3, name: `Property in ${area}`, item: canon(`/properties?area=${encodeURIComponent(area)}`) }] : []),
      ],
    };

    res.render('properties', {
      title: pageTitle, description: pageDesc,
      canonical: canon(canonPath), siteUrl: SITE,
      jsonld: JSON.stringify([itemList, breadcrumbLdList]),
      properties, areas, q: { listing, area, type, budget },
    });
  } catch (err) {
    console.error('[/properties] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── PROPERTY DETAIL ──────────────────────────────────────────────
router.get('/property/:id', async (req, res) => {
  try {
    const db = getDB();
    const { data: p } = await db.from('properties').select('*').eq('id', req.params.id).eq('active', true).maybeSingle();
    if (!p) return res.status(404).render('404', { title: 'Property not found | RichManAssets' });

    const [similarRes, nextRes] = await Promise.all([
      db.from('properties').select('*').neq('id', p.id).eq('active', true).eq('type', p.type).eq('has_img', true).limit(3),
      p.next_id ? db.from('properties').select('*').eq('id', p.next_id).eq('active', true).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const similar = similarRes.data || [];
    const next = nextRes.data || null;

    const absImg = (u) => !u ? null : (u.indexOf('http') === 0 ? u : '/' + u.replace(/^\//, ''));
    let gallery = [];
    try { gallery = JSON.parse(p.gallery || '[]'); } catch (_) { }
    const rawImages = [p.img_hero, p.img_card, ...gallery].map(absImg).filter(Boolean);
    const SAMPLE_FALLERY_FALLBACKS = [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80'
    ];
    const allImages = [...new Set([...rawImages, ...SAMPLE_GALLERY_FALLBACKS])].slice(0, 5);

    const listLabel = p.listing === 'rent' ? 'for Rent' : p.listing === 'lease' ? 'for Lease' : 'for Sale';
    const pageTitle = `${p.name} in ${p.loc}, ${p.type} ${listLabel} at ${p.price} | RichManAssets`;
    const pageDesc = (p.story_body ? String(p.story_body).replace(/\s+/g, ' ').slice(0, 150)
      : `${p.type} ${listLabel.toLowerCase()} in ${p.loc}, coastal Karnataka. ${p.beds && p.beds !== '—' ? p.beds + ' beds · ' : ''}${p.sqft || ''}. Price ${p.price}.`).trim() + '…';

    const productLd = {
      '@context': 'https://schema.org', '@type': 'Product',
      'name': `${p.name}, ${p.loc}`, 'description': pageDesc,
      'image': allImages,
      'category': `${p.type} for ${p.listing === 'rent' ? 'Rent' : p.listing === 'lease' ? 'Lease' : 'Sale'} in ${p.loc}`,
      'brand': { '@type': 'Brand', 'name': 'RichManAssets' },
      'seller': { '@type': 'RealEstateAgent', '@id': `${SITE}/#organization`, 'name': 'RichManAssets', 'telephone': '+919036001234', 'url': SITE },
      'offers': {
        '@type': 'Offer', 'price': p.price_val || undefined, 'priceCurrency': 'INR',
        'availability': 'https://schema.org/InStock', 'url': canon('/property/' + p.id),
        'areaServed': p.area || p.loc,
        'validFrom': p.created_at ? p.created_at.split('T')[0] : undefined,
      },
    };
    const breadcrumbLd = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', position: 1, name: 'Home', item: canon('/') },
        { '@type': 'ListItem', position: 2, name: 'Properties', item: canon('/properties') },
        { '@type': 'ListItem', position: 3, name: p.name, item: canon('/property/' + p.id) },
      ],
    };

    res.render('property', {
      title: pageTitle, description: pageDesc,
      canonical: canon('/property/' + p.id), siteUrl: SITE,
      ogType: 'product', ogImage: allImages[0],
      jsonld: JSON.stringify([productLd, breadcrumbLd]),
      p, similar, next, allImages,
    });
  } catch (err) {
    console.error('[/property/:id] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── CONTACT ──────────────────────────────────────────────────────
router.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact & Enquire: Property Specialists in Udupi & Mangaluru | RichManAssets',
    description: 'Talk to a RichManAssets property specialist in Udupi or Mangaluru. Call, WhatsApp or send your brief for a same-day response on buying, renting, plots, loans, legal and interiors.',
    canonical: canon('/contact'),
    siteUrl: SITE,
    ref: req.query.ref || '',
  });
});

// ── SERVICES ─────────────────────────────────────────────────────
router.get('/services', (req, res) => {
  res.render('services', {
    title: 'Real Estate Services in Udupi & Mangaluru: Sales, Loans, Legal & Interiors | RichManAssets',
    description: 'One team for everything property in coastal Karnataka: builder & resale sales, commercial space, plots, home loans, legal due-diligence, construction and interiors.',
    canonical: canon('/services'),
    siteUrl: SITE,
    services: withIcons(SERVICES),
    serviceDetails: withIcons(SERVICES),
  });
});

// ── INTERIOR DESIGN SHOWCASE ──────────────────────────────────────
router.get('/interiors', (req, res) => {
  res.render('interiors', {
    title: 'Interior Design & Bespoke Spaces in Udupi & Mangaluru | RichManAssets',
    description: 'Explore turnkey interior design, 3D renders, and custom joinery for coastal villas, penthouses, modular kitchens, and corporate offices across coastal Karnataka.',
    canonical: canon('/interiors'),
    siteUrl: SITE,
  });
});

// ── ABOUT ─────────────────────────────────────────────────────────
router.get('/about', async (req, res) => {
  try {
    const db = getDB();
    const { data: testimonials } = await db.from('testimonials').select('*').eq('active', true);
    const faqLd = {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      'mainEntity': [
        { '@type': 'Question', name: 'Which areas do you cover for property in coastal Karnataka?',
          acceptedAnswer: { '@type': 'Answer', text: 'We cover Udupi, Mangaluru, Manipal, Surathkal, Mulki, Kapu, Padubidri, Maravanthe and the wider Dakshina Kannada and Udupi districts, plus hill stations like Sakleshpur and Chikmagalur.' } },
        { '@type': 'Question', name: 'Do you help with home loans and legal paperwork?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes. We have direct tie-ups with SBI, Bank of Baroda, HDFC, Karnataka Bank and others for fast, pre-approved home and project loans, and an in-house advocate for title checks, due diligence and registration.' } },
        { '@type': 'Question', name: 'Are your property listings title-verified?',
          acceptedAnswer: { '@type': 'Answer', text: 'Every listing is title-checked and verified before we publish it. We only market title-clear property across Udupi and Mangaluru.' } },
        { '@type': 'Question', name: 'Do you work with NRI buyers and investors?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes. We offer end-to-end NRI services including remote site visits, documentation, loans, registration and full property management after purchase.' } },
      ],
    };
    res.render('about', {
      title: 'About RichManAssets: Property Consultants in Udupi & Mangaluru, Coastal Karnataka',
      description: 'RichManAssets (Vittu Bharat Associates LLP) is a coastal-Karnataka real-estate firm in Udupi & Mangaluru. 15+ years, 1,200+ families, ₹500 Cr+ transacted across sales, loans, legal, construction and interiors under one roof.',
      canonical: canon('/about'), siteUrl: SITE,
      jsonld: JSON.stringify(faqLd),
      testimonials: testimonials || [],
    });
  } catch (err) {
    console.error('[/about] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── LOANS ─────────────────────────────────────────────────────────
router.get('/loans', (req, res) => {
  res.render('loans', {
    title: 'Home Loans & EMI in Udupi & Mangaluru: Partner Bank Rates | RichManAssets',
    description: 'Pre-approved home and project loans in coastal Karnataka from SBI, Bank of Baroda, HDFC, Karnataka Bank and more. Compare EMI, check eligibility and get doorstep paperwork.',
    canonical: canon('/loans'),
    siteUrl: SITE,
  });
});

// ── ENQUIRY POST ─────────────────────────────────────────────────
router.post('/enquiry', async (req, res) => {
  const db = getDB();
  const { name, phone, email, service, budget, time_pref, message, property_ref, page } = req.body;

  if (!phone && !email) return res.status(400).json({ ok: false });

  await db.from('enquiries').insert({
    name: name || '', phone: phone || '', email: email || '',
    service: service || '', budget: budget || '', time_pref: time_pref || '',
    message: message || '', property_ref: property_ref || '', page: page || '',
  });

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
      }).catch(() => { });
    } catch (_) { }
  }

  res.json({ ok: true });
});

module.exports = router;
