'use strict';
const express = require('express');
const router = express.Router();
const { getDB } = require('../db/db');
const { getPromoBanner, getUseDummyData, getHeroPropertyIds } = require('../lib/settings');
const propSvc = require('../services/propertyService');
const { getActiveBuilderProjects } = require('./builder-projects');

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
  { id: 'builder', title: 'Builder Sales', note: 'New launches & projects', img: 'samudra-card', q: 'type=Apartment', href: '/builder-projects' },
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

function buildPropertiesSEO({ listing, area, type, budget, q, count = 0 }) {
  const listingMap = {
    rent: { verb: 'for Rent', noun: 'Rentals' },
    lease: { verb: 'for Lease', noun: 'Lease Properties' },
    sale: { verb: 'for Sale', noun: 'Properties for Sale' },
  };
  const typeMap = {
    Apartment: { plural: 'Apartments', singular: 'Apartment', keyword: 'flats' },
    Villa: { plural: 'Villas', singular: 'Villa', keyword: 'villas' },
    Plot: { plural: 'Plots', singular: 'Plot', keyword: 'plots' },
    Commercial: { plural: 'Commercial Spaces', singular: 'Commercial Property', keyword: 'commercial spaces' },
    Agricultural: { plural: 'Agricultural Land', singular: 'Agricultural Land', keyword: 'agricultural land' },
    House: { plural: 'Houses', singular: 'House', keyword: 'houses' },
  };
  const budgetMap = {
    'u30': 'Under ₹30 Lakhs',
    '30-1c': '₹30L to ₹1 Crore',
    '1-5c': '₹1 Cr to ₹5 Crores',
    '5c': 'Above ₹5 Crores',
  };

  const lInfo = listingMap[listing] || { verb: 'for Sale & Rent', noun: 'Properties' };
  const tInfo = typeMap[type] || (type ? { plural: `${type}s`, singular: type, keyword: String(type).toLowerCase() } : { plural: 'Properties', singular: 'Property', keyword: 'property' });
  const targetArea = area ? String(area).trim() : '';
  const searchQ = q ? String(q).trim() : '';
  const countText = count > 0 ? `${count} verified` : 'verified';

  let pageTitle = '';
  let headerKicker = '';
  let headerTitle = '';
  let headerDesc = '';

  if (searchQ) {
    headerKicker = `Search · "${searchQ}"`;
    headerTitle = `Properties for <span class="it">"${searchQ}".</span>`;
    headerDesc = `Showing ${countText} properties matching "${searchQ}".`;
    pageTitle = `Search: "${searchQ}" — Properties | RichManAssets`;
  } else if (targetArea && type && listing) {
    headerKicker = `${targetArea} · ${type} · ${lInfo.verb}`;
    headerTitle = `${tInfo.plural} ${lInfo.verb} in <span class="it">${targetArea}.</span>`;
    headerDesc = `Showing ${countText} ${tInfo.plural.toLowerCase()} ${lInfo.verb.toLowerCase()} in ${targetArea}.`;
    pageTitle = `${tInfo.plural} ${lInfo.verb} in ${targetArea} | RichManAssets`;
  } else if (targetArea && type) {
    headerKicker = `${targetArea} · ${type}`;
    headerTitle = `${tInfo.plural} in <span class="it">${targetArea}.</span>`;
    headerDesc = `Showing ${countText} ${tInfo.plural.toLowerCase()} in ${targetArea}.`;
    pageTitle = `${tInfo.plural} in ${targetArea} | RichManAssets`;
  } else if (targetArea && listing) {
    headerKicker = `${targetArea} · ${lInfo.noun}`;
    headerTitle = `Properties ${lInfo.verb} in <span class="it">${targetArea}.</span>`;
    headerDesc = `Showing ${countText} properties ${lInfo.verb.toLowerCase()} in ${targetArea}.`;
    pageTitle = `Properties ${lInfo.verb} in ${targetArea} | RichManAssets`;
  } else if (targetArea) {
    headerKicker = `${targetArea} · Real Estate`;
    headerTitle = `Properties in <span class="it">${targetArea}.</span>`;
    headerDesc = `Showing ${countText} properties available in ${targetArea}.`;
    pageTitle = `Real Estate & Property in ${targetArea} | RichManAssets`;
  } else if (type && listing) {
    headerKicker = `${type} · ${lInfo.noun}`;
    headerTitle = `${tInfo.plural} <span class="it">${lInfo.verb}.</span>`;
    headerDesc = `Showing ${countText} ${tInfo.plural.toLowerCase()} ${lInfo.verb.toLowerCase()}.`;
    pageTitle = `${tInfo.plural} ${lInfo.verb} | RichManAssets`;
  } else if (type) {
    headerKicker = `${type} Listings`;
    headerTitle = `${tInfo.plural} for <span class="it">Sale & Rent.</span>`;
    headerDesc = `Showing ${countText} ${tInfo.plural.toLowerCase()} available.`;
    pageTitle = `${tInfo.plural} for Sale & Rent | RichManAssets`;
  } else if (listing) {
    headerKicker = `${lInfo.noun}`;
    headerTitle = `Properties <span class="it">${lInfo.verb}.</span>`;
    headerDesc = `Showing ${countText} properties ${lInfo.verb.toLowerCase()}.`;
    pageTitle = `Properties ${lInfo.verb} | RichManAssets`;
  } else {
    headerKicker = `All Properties`;
    headerTitle = `Find your <span class="it">property.</span>`;
    headerDesc = `Explore verified villas, apartments, plots & commercial spaces.`;
    pageTitle = `Properties for Sale & Rent in Udupi | RichManAssets`;
  }

  if (budgetMap[budget]) {
    headerKicker += ` · ${budgetMap[budget]}`;
    pageTitle = `${pageTitle.replace(' | RichManAssets', '')} (${budgetMap[budget]}) | RichManAssets`;
  }

  const locKw = targetArea ? targetArea.toLowerCase() : 'udupi';
  const typeKw = tInfo.keyword;

  const kwSet = new Set([
    `${typeKw} ${lInfo.verb.toLowerCase()} in ${locKw}`,
    `real estate in ${locKw}`,
    `property in ${locKw}`,
    `${tInfo.singular.toLowerCase()} in ${locKw}`,
    `buy ${typeKw} ${locKw}`,
    `${locKw} property portal`,
  ]);

  if (searchQ) {
    kwSet.add(`${searchQ.toLowerCase()} property`);
  }

  const keywords = Array.from(kwSet).join(', ');
  const geoPlace = targetArea ? `${targetArea}, Karnataka, India` : 'Udupi, Karnataka, India';

  let queryParams = [];
  if (searchQ) queryParams.push(`q=${encodeURIComponent(searchQ)}`);
  if (listing) queryParams.push(`listing=${encodeURIComponent(listing)}`);
  if (targetArea) queryParams.push(`area=${encodeURIComponent(targetArea)}`);
  if (type) queryParams.push(`type=${encodeURIComponent(type)}`);
  if (budget) queryParams.push(`budget=${encodeURIComponent(budget)}`);
  const canonPath = '/properties' + (queryParams.length ? '?' + queryParams.join('&') : '');

  return { pageTitle, pageDesc: headerDesc, keywords, geoPlace, canonPath, headerKicker, headerTitle, headerDesc };
}

// Helper to fetch all active admin properties AND published agent properties with error safety
async function getAllPublicProperties(db) {
  try {
    let adminProps = [];
    let agentProps = [];
    let builderProps = [];

    try {
      const { data } = await db.from('properties').select('*').eq('active', true);
      adminProps = data || [];
      const useDummy = await getUseDummyData();
      if (!useDummy) adminProps = adminProps.filter(p => !p.is_dummy);
    } catch (e1) {
      console.error('[getAllPublicProperties] properties err:', e1.message);
    }

    try {
      const { data } = await db.from('agent_properties').select('*').eq('status', 'published');
      agentProps = (data || []).map(p => ({ ...p, active: true, has_img: Boolean(p.img_card || p.img_hero), is_agent_listing: true }));
    } catch (e2) {
      console.error('[getAllPublicProperties] agent_properties err:', e2.message);
    }

    try {
      const raw = await getActiveBuilderProjects(db);
      builderProps = raw.map(p => {
        const configs = [...new Set((p.unit_types || []).map(u => u.config))].join(', ');
        const sqftRange = [...new Set((p.unit_types || []).map(u => u.sizeRange).filter(Boolean))].join(', ');
        return {
          id: p.id, slug: p.slug, name: p.name, loc: p.loc, area: p.area,
          type: 'Apartment', listing: 'sale',
          price: 'Price on request', price_val: 0, price_note: null,
          beds: configs || null, baths: null, sqft: sqftRange || null,
          subtype: 'Builder Project',
          description: [p.tagline, p.marketing_desc, p.unit_mix_summary, p.seo_keywords].filter(Boolean).join(' '),
          amenities: (p.amenities || []).join(' | '),
          active: true, has_img: Boolean(p.img_card || p.img_hero),
          img_card: p.img_card, img_hero: p.img_hero,
          featured: false, sort_order: p.sort_order || 0,
          is_builder_project: true,
        };
      });
    } catch (e3) {
      console.error('[getAllPublicProperties] builder_projects err:', e3.message);
    }

    return [...adminProps, ...agentProps, ...builderProps];
  } catch (err) {
    console.error('[getAllPublicProperties] error:', err.message);
    return [];
  }
}

// Levenshtein edit distance — used for typo-tolerant fuzzy matching
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// Does token fuzzy-match any whitespace-separated word in str (typo tolerance)?
function fuzzyIncludes(str, token) {
  if (token.length < 4) return false; // too short for fuzzy matching to be meaningful
  const maxDist = token.length <= 5 ? 1 : 2;
  const words = str.split(/\s+/).filter(Boolean);
  return words.some(w => Math.abs(w.length - token.length) <= maxDist && editDistance(w, token) <= maxDist);
}

// Base sort used whenever there's no free-text query to rank by
function sortByDefault(list) {
  return [...list].sort((a, b) => {
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return (b.price_val || 0) - (a.price_val || 0);
  });
}

// Tokenized relevant keyword matcher & scorer
function searchAndSortProperties(allProps, { listing, area, type, budget, q }) {
  let list = [...allProps];

  if (listing) list = list.filter(p => p.listing === listing);
  if (area) {
    const cleanArea = area.toLowerCase().trim();
    list = list.filter(p => (p.area && p.area.toLowerCase().trim() === cleanArea) || (p.loc && p.loc.toLowerCase().includes(cleanArea)));
  }
  if (type) list = list.filter(p => p.type && p.type.toLowerCase().trim() === type.toLowerCase().trim());

  if (budget === 'u30')   list = list.filter(p => p.is_builder_project || (p.price_val || 0) < 3000000);
  if (budget === '30-1c') list = list.filter(p => p.is_builder_project || ((p.price_val || 0) >= 3000000 && (p.price_val || 0) < 10000000));
  if (budget === '1-5c')  list = list.filter(p => p.is_builder_project || ((p.price_val || 0) >= 10000000 && (p.price_val || 0) < 50000000));
  if (budget === '5c')    list = list.filter(p => p.is_builder_project || (p.price_val || 0) >= 50000000);

  if (!q || !q.trim()) {
    return { properties: sortByDefault(list), fallback: false };
  }

  const tokens = q.trim().toLowerCase().split(/\s+/).filter(t => t.length > 0);
  if (!tokens.length) return { properties: list, fallback: false };

  const scored = [];
  for (const p of list) {
    let score = 0;
    const nameStr = (p.name || '').toLowerCase();
    const locStr  = (p.loc || '').toLowerCase() + ' ' + (p.area || '').toLowerCase();
    const typeStr = (p.type || '').toLowerCase() + ' ' + (p.subtype || '').toLowerCase() + ' ' + (p.listing || '').toLowerCase();
    const descStr = (p.description || '').toLowerCase() + ' ' + (p.story_heading || '').toLowerCase() + ' ' + (p.story_body || '').toLowerCase() + ' ' + (p.amenities || '').toLowerCase() + ' ' + (p.price_note || '').toLowerCase();

    for (const token of tokens) {
      if (nameStr.includes(token)) score += 10;
      else if (fuzzyIncludes(nameStr, token)) score += 5;

      if (locStr.includes(token))  score += 8;
      else if (fuzzyIncludes(locStr, token)) score += 4;

      if (typeStr.includes(token)) score += 6;
      else if (fuzzyIncludes(typeStr, token)) score += 3;

      if (descStr.includes(token)) score += 3;
      else if (fuzzyIncludes(descStr, token)) score += 1;
    }

    if (score > 0) {
      scored.push({ property: p, score });
    }
  }

  if (scored.length) {
    scored.sort((a, b) => b.score - a.score);
    return { properties: scored.map(s => s.property), fallback: false };
  }

  // Nothing matched, even fuzzily — fall back to the other active filters (or everything)
  // so the user sees relevant properties instead of a dead end.
  return { properties: sortByDefault(list).slice(0, 12), fallback: true };
}

// ── HOME ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getDB();

    const [allProps, testimonialsRes, configuredHeroIds, promoBanner] = await Promise.all([
      getAllPublicProperties(db),
      db.from('testimonials').select('*').eq('active', true),
      getHeroPropertyIds(),
      getPromoBanner(),
    ]);

    const testimonials = testimonialsRes.data || [];
    const areas = [...new Set(allProps.map(r => r.area || r.loc).filter(Boolean))].sort();

    // hero slides: prioritise configured IDs, fall back to featured or top active
    let heroSlides = [];
    if (configuredHeroIds && Array.isArray(configuredHeroIds) && configuredHeroIds.length) {
      heroSlides = configuredHeroIds
        .map(id => allProps.find(p => p.id === id))
        .filter(Boolean)
        .slice(0, 6);
    }
    const finalHero = heroSlides.length ? heroSlides : allProps.filter(p => p.featured || p.img_hero).slice(0, 6);

    res.render('index', {
      title: 'Real Estate & Property in Udupi & Mangaluru | RichManAssets',
      description: 'Buy, rent or lease verified villas, flats, plots & commercial property in Udupi, Manipal & Mangaluru. Home loans, legal & interiors by RichManAssets.',
      keywords: 'real estate udupi, property in udupi, flats for sale in udupi, villas in udupi, plots for sale in udupi, real estate agent udupi, property in mangaluru, home loans udupi, richman assets, luxury homes udupi, commercial space mangaluru',
      geoPlace: 'Udupi, Karnataka, India',
      canonical: canon('/'),
      siteUrl: SITE,
      heroSlides: finalHero,
      featured: allProps.filter(p => p.featured || p.has_img).slice(0, 6),
      allListings: allProps,
      categories: CATEGORIES,
      services: withIcons(SERVICES),
      testimonials,
      areas,
      promoBanner,
    });
  } catch (err) {
    console.error('[/] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── PROPERTIES BROWSE & SEARCH ───────────────────────────────────
router.get('/properties', async (req, res) => {
  try {
    const db = getDB();
    const { listing, area, type, budget, q } = req.query;

    const allProps = await getAllPublicProperties(db);
    const { properties, fallback: fallbackSearch } = searchAndSortProperties(allProps, { listing, area, type, budget, q });
    const areas = [...new Set(allProps.map(r => r.area || r.loc).filter(Boolean))].sort();

    const seo = buildPropertiesSEO({ listing, area, type, budget, q, count: properties.length });

    const itemList = {
      '@context': 'https://schema.org', '@type': 'ItemList',
      'name': seo.pageTitle, 'description': seo.pageDesc,
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

    const promoBanner = await getPromoBanner();
    res.render('properties', {
      title: seo.pageTitle,
      description: seo.pageDesc,
      keywords: seo.keywords,
      geoPlace: seo.geoPlace,
      canonical: canon(seo.canonPath),
      siteUrl: SITE,
      jsonld: JSON.stringify([itemList, breadcrumbLdList]),
      properties, areas, q: { listing, area, type, budget, q: q || '' },
      headerKicker: seo.headerKicker,
      headerTitle: seo.headerTitle,
      headerDesc: seo.headerDesc,
      fallbackSearch,
      promoBanner,
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
    let p = null;

    const { data: adminProp } = await db.from('properties').select('*').eq('id', req.params.id).eq('active', true).maybeSingle();
    p = adminProp;

    // Filter out dummy properties if setting is off
    if (p) {
      const useDummy = await getUseDummyData();
      if (!useDummy && p.is_dummy) {
        p = null;
      }
    }

    if (!p) {
      const { data: agentProp } = await db.from('agent_properties').select('*').eq('id', req.params.id).maybeSingle();
      if (agentProp && (agentProp.status === 'published' || (req.session?.agent?.id && String(req.session.agent.id) === String(agentProp.agent_id)))) {
        p = agentProp;
      }
    }

    if (!p) return res.status(404).render('404', { title: 'Property not found | RichManAssets' });

    let agentInfo = {
      id: null,
      name: 'RichManAssets Advisory',
      company_name: 'RichManAssets Corporate Office',
      phone: '9380939961',
      city: p.loc || 'Udupi & Mangaluru',
      is_verified: true,
      rera_number: 'PRM/KA/RERA/1251/309/PR/210312/004012'
    };

    if (p.agent_id) {
      const { data: foundAgent } = await db.from('agents').select('id, name, company_name, phone, city, is_verified, rera_number').eq('id', p.agent_id).maybeSingle();
      if (foundAgent) {
        agentInfo = foundAgent;
      }
    }

    const rawDate = p.published_at || p.created_at;
    let postedDate = 'Recently';
    let postedAgo = 'Recently posted';
    if (rawDate) {
      const d = new Date(rawDate);
      postedDate = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const diffMs = Date.now() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) postedAgo = 'Posted today';
      else if (diffDays === 1) postedAgo = 'Posted 1 day ago';
      else if (diffDays > 1 && diffDays < 30) postedAgo = `Posted ${diffDays} days ago`;
      else postedAgo = `Posted on ${postedDate}`;
    }

    const allPublic = await getAllPublicProperties(db);
    const similar = allPublic
      .filter(item => item.id !== p.id && item.type && item.type.toLowerCase().trim() === (p.type || '').toLowerCase().trim() && item.has_img)
      .slice(0, 3);

    let next = p.next_id ? (allPublic.find(item => item.id === p.next_id) || null) : null;
    if (!next && allPublic.length > 1) {
      const idx = allPublic.findIndex(item => item.id === p.id);
      if (idx !== -1) {
        next = allPublic[(idx + 1) % allPublic.length];
      }
    }

    const absImg = (u) => !u ? null : (u.indexOf('http') === 0 ? u : '/' + u.replace(/^\//, ''));
    let gallery = [];
    try { gallery = JSON.parse(p.gallery || '[]'); } catch (_) { }
    const rawImages = [p.img_hero, p.img_card, ...gallery].map(absImg).filter(Boolean);
    const allImages = [...new Set(rawImages)];

    const listLabel = p.listing === 'rent' ? 'for Rent' : p.listing === 'lease' ? 'for Lease' : 'for Sale';
    const pageTitle = `${p.name} — ${p.type} ${listLabel} in ${p.loc} | RichManAssets`;
    const specsStr = [p.beds && p.beds !== '—' ? `${p.beds} Beds` : null, p.sqft ? p.sqft : null, p.price ? `Price: ${p.price}` : null].filter(Boolean).join(' · ');
    const pageDesc = `${p.name} in ${p.loc}: Verified ${p.type.toLowerCase()} ${listLabel.toLowerCase()}. ${specsStr}. Title-cleared real estate in Udupi & Mangaluru.`;
    const propKeywords = `${p.name.toLowerCase()}, ${p.type.toLowerCase()} in ${p.loc.toLowerCase()}, ${p.loc.toLowerCase()} real estate, ${p.type.toLowerCase()} ${listLabel.toLowerCase()} ${p.loc.toLowerCase()}, property for ${p.listing} in ${p.loc.toLowerCase()}, richman assets`;
    const propGeoPlace = `${p.loc}, Karnataka, India`;

    const productLd = {
      '@context': 'https://schema.org', '@type': 'Product',
      'name': `${p.name}, ${p.loc}`, 'description': pageDesc,
      'image': allImages,
      'category': `${p.type} for ${p.listing === 'rent' ? 'Rent' : p.listing === 'lease' ? 'Lease' : 'Sale'} in ${p.loc}`,
      'brand': { '@type': 'Brand', 'name': 'RichManAssets' },
      'seller': { '@type': 'RealEstateAgent', '@id': `${SITE}/#organization`, 'name': agentInfo.name || 'RichManAssets', 'telephone': '+91' + (agentInfo.phone || '9380939961'), 'url': SITE },
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

    const promoBanner = await getPromoBanner();
    const pTypeLower = (p.type || '').toLowerCase();
    const isLandOrPlot = pTypeLower.includes('plot') || pTypeLower.includes('land') || pTypeLower.includes('agricultural');

    // Fill in any blank editorial fields with defaults derived from real listing data
    // — agents can override each one from the listing form; this is just the fallback.
    const editorialDefaults = propSvc.getEditorialDefaults(p);
    Object.keys(editorialDefaults).forEach((k) => { if (!p[k]) p[k] = editorialDefaults[k]; });

    res.render('property', {
      title: pageTitle,
      description: pageDesc,
      keywords: propKeywords,
      geoPlace: propGeoPlace,
      canonical: canon('/property/' + p.id), siteUrl: SITE,
      ogType: 'product', ogImage: allImages[0],
      jsonld: JSON.stringify([productLd, breadcrumbLd]),
      p, similar, next, allImages,
      agentInfo, postedDate, postedAgo,
      promoBanner, isLandOrPlot,
    });
  } catch (err) {
    console.error('[/property/:id] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── PROPERTY ENQUIRY SUBMISSION (AJAX) ───────────────────────────
router.post('/property/:id/enquire', async (req, res) => {
  try {
    const db = getDB();
    const { name, phone, email, message } = req.body;
    const propId = req.params.id;

    if (!name || !phone) {
      return res.status(400).json({ ok: false, error: 'Name and Phone number are required.' });
    }

    let p = null;
    const { data: adminProp } = await db.from('properties').select('*').eq('id', propId).maybeSingle();
    p = adminProp;
    if (!p) {
      const { data: agentProp } = await db.from('agent_properties').select('*').eq('id', propId).maybeSingle();
      p = agentProp;
    }

    if (!p) {
      return res.status(404).json({ ok: false, error: 'Property not found.' });
    }

    let agentId = p.agent_id || null;
    let agentPhone = '9380939961';
    let agentName = 'RichManAssets Advisory';

    if (agentId) {
      const { data: ag } = await db.from('agents').select('id, name, phone').eq('id', agentId).maybeSingle();
      if (ag) {
        if (ag.phone) agentPhone = ag.phone;
        if (ag.name) agentName = ag.name;
      }
    }

    const insertObj = {
      name: name.trim(),
      phone: phone.trim(),
      email: (email || '').trim(),
      message: (message || '').trim(),
      property_ref: p.name + ' (' + p.loc + ')',
      page: '/property/' + p.id,
      created_at: new Date().toISOString(),
    };

    const { error: insertErr } = await db.from('enquiries').insert(insertObj);
    if (insertErr) {
      console.error('[/property/:id/enquire] insert error:', insertErr.message);
      return res.status(500).json({ ok: false, error: 'Failed to process enquiry. Please try again.' });
    }

    // Formulate WhatsApp message
    const cleanPhone = agentPhone.replace(/\D/g, '');
    const fullPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const waText = `Hi ${agentName}, I am interested in "${p.name}" (${p.loc}, ${p.price}).\n\nBuyer: ${name.trim()}\nPhone: ${phone.trim()}${email ? '\nEmail: ' + email.trim() : ''}${message ? '\nMessage: ' + message.trim() : ''}`;
    const whatsappUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(waText)}`;

    res.json({ ok: true, whatsappUrl, msg: 'Enquiry submitted successfully!' });
  } catch (err) {
    console.error('[/property/:id/enquire] error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to process enquiry. Please try again.' });
  }
});

// ── CONTACT ──────────────────────────────────────────────────────
router.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact Us | Real Estate Agency in Udupi & Mangaluru | RichManAssets',
    description: 'Contact RichManAssets property consultants in Udupi & Mangaluru. Call +91 93809 39961 or submit your enquiry for site visits, loans & legal aid.',
    keywords: 'contact richman assets, property dealer contact udupi, real estate agent udupi number, property consultant mangaluru, enquire real estate udupi',
    geoPlace: 'Udupi, Karnataka, India',
    canonical: canon('/contact'),
    siteUrl: SITE,
    ref: req.query.ref || '',
  });
});

// ── SERVICES ─────────────────────────────────────────────────────
router.get('/services', (req, res) => {
  res.render('services', {
    title: 'Real Estate Services in Udupi & Mangaluru | RichManAssets',
    description: 'End-to-end real estate services in coastal Karnataka: builder sales, commercial leases, plot verification, home loans, legal checks & turnkey interiors.',
    keywords: 'real estate services udupi, property legal title check udupi, property management udupi, commercial leasing mangaluru, plot verification rera, builder sales agency',
    geoPlace: 'Udupi & Mangaluru, Karnataka, India',
    canonical: canon('/services'),
    siteUrl: SITE,
    services: withIcons(SERVICES),
    serviceDetails: withIcons(SERVICES),
  });
});

// ── INTERIOR DESIGN SHOWCASE ──────────────────────────────────────
router.get('/interiors', (req, res) => {
  res.render('interiors', {
    title: 'Turnkey Interior Design in Udupi & Mangaluru | RichManAssets',
    description: 'Turnkey interior design, 3D renders, modular kitchens & corporate office fitouts in Udupi, Manipal & Mangaluru with transparent fixed pricing.',
    keywords: 'interior design udupi, modular kitchen udupi, home interior designer manipal, villa interior design mangaluru, office fitout udupi, turnkey interior package',
    geoPlace: 'Udupi, Karnataka, India',
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
      title: 'About Us | Real Estate Agency in Udupi & Mangaluru | RichManAssets',
      description: 'RichManAssets (Vittu Bharat Associates LLP) is a premier property consultancy in Udupi & Mangaluru. 15+ years experience, 1,200+ families served.',
      keywords: 'richman assets, vittu bharat associates llp, top real estate agency udupi, property consultants mangaluru, best property agent udupi, real estate company coastal karnataka',
      geoPlace: 'Udupi, Karnataka, India',
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
    title: 'Home Loans & EMI Assistance in Udupi & Mangaluru | RichManAssets',
    description: 'Pre-approved home and project loans in coastal Karnataka with partner bank rates from SBI, HDFC, Bank of Baroda & Karnataka Bank.',
    keywords: 'home loans udupi, sbi home loan udupi, hdfc home loan mangaluru, project loan udupi, property loan consultant, low interest rate home loan udupi',
    geoPlace: 'Udupi & Mangaluru, Karnataka, India',
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
