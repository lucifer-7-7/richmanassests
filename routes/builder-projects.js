'use strict';
const express = require('express');
const router = express.Router();
const { getDB } = require('../db/db');

const SITE = process.env.SITE_URL || 'https://richmanassets.com';
const canon = (p) => SITE + p;

function parseJSON(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch (_) { return fallback; }
}

function normalize(row) {
  return {
    ...row,
    proximity: parseJSON(row.proximity, []),
    unit_types: parseJSON(row.unit_types, []),
    floor_breakdown: parseJSON(row.floor_breakdown, []),
    commercial_shops: parseJSON(row.commercial_shops, null),
    structure_specs: parseJSON(row.structure_specs, []),
    flooring_specs: parseJSON(row.flooring_specs, []),
    electrical_specs: parseJSON(row.electrical_specs, []),
    doors_windows_specs: parseJSON(row.doors_windows_specs, []),
    kitchen_specs: parseJSON(row.kitchen_specs, []),
    bathroom_specs: parseJSON(row.bathroom_specs, []),
    amenities: parseJSON(row.amenities, []),
    terrace_amenities: parseJSON(row.terrace_amenities, null),
    bank_partners: parseJSON(row.bank_partners, null),
    highlights: parseJSON(row.highlights, []),
    gallery: parseJSON(row.gallery, []),
  };
}

async function getActiveBuilderProjects(db) {
  const { data, error } = await db.from('builder_projects').select('*').eq('status', 'active').order('sort_order', { ascending: true });
  if (error) { console.error('[builder-projects] list error:', error.message); return []; }
  return (data || []).map(normalize);
}

// ── LISTING ──────────────────────────────────────────────────────
router.get('/builder-projects', async (req, res) => {
  try {
    const db = getDB();
    const projects = await getActiveBuilderProjects(db);

    const itemList = {
      '@context': 'https://schema.org', '@type': 'ItemList',
      'name': 'Builder Projects in Udupi', 'numberOfItems': projects.length,
      'itemListElement': projects.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: canon('/builder-project/' + p.slug), name: p.name })),
    };

    res.render('builder-projects', {
      title: 'New Builder Projects & Flats in Udupi — RERA Approved | RichManAssets',
      description: 'Browse new-launch builder projects in Udupi — 1, 2 & 3 BHK flats, RERA status, unit mix, amenities and real site photos, direct from the promoter data.',
      keywords: 'builder projects udupi, new flats udupi, upcoming projects udupi, rera approved flats udupi, new launch apartments udupi, flats for sale in udupi',
      geoPlace: 'Udupi, Karnataka, India',
      canonical: canon('/builder-projects'), siteUrl: SITE,
      jsonld: JSON.stringify([itemList]),
      projects,
    });
  } catch (err) {
    console.error('[/builder-projects] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── DETAIL ───────────────────────────────────────────────────────
router.get('/builder-project/:slug', async (req, res) => {
  try {
    const db = getDB();
    const { data: row } = await db.from('builder_projects').select('*').eq('slug', req.params.slug).eq('status', 'active').maybeSingle();
    if (!row) return res.status(404).render('404', { title: 'Project not found | RichManAssets' });

    const p = normalize(row);
    const allProjects = await getActiveBuilderProjects(db);
    const similar = allProjects.filter(x => x.id !== p.id).slice(0, 3);

    const allImages = p.gallery.map(g => g.url).filter(Boolean);
    const configs = [...new Set((p.unit_types || []).map(u => u.config))].join(' & ');

    const apartmentComplexLd = {
      '@context': 'https://schema.org', '@type': 'ApartmentComplex',
      'name': p.name, 'description': p.seo_description || p.marketing_desc || p.unit_mix_summary,
      'image': allImages,
      'address': { '@type': 'PostalAddress', 'streetAddress': p.address || p.loc, 'addressLocality': p.area || 'Udupi', 'addressRegion': 'Karnataka', 'addressCountry': 'IN' },
      'numberOfAccommodationUnits': (p.unit_types || []).reduce((sum, u) => sum + (u.count || 1), 0) || undefined,
      'petsAllowed': undefined,
    };
    const breadcrumbLd = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', position: 1, name: 'Home', item: canon('/') },
        { '@type': 'ListItem', position: 2, name: 'Builder Projects', item: canon('/builder-projects') },
        { '@type': 'ListItem', position: 3, name: p.name, item: canon('/builder-project/' + p.slug) },
      ],
    };

    res.render('builder-project', {
      title: p.seo_title || `${p.name} — ${configs} Flats in ${p.area} | RichManAssets`,
      description: p.seo_description || p.marketing_desc || p.unit_mix_summary,
      keywords: p.seo_keywords,
      geoPlace: `${p.area || 'Udupi'}, Karnataka, India`,
      canonical: canon('/builder-project/' + p.slug), siteUrl: SITE,
      ogType: 'website', ogImage: allImages[0],
      jsonld: JSON.stringify([apartmentComplexLd, breadcrumbLd]),
      p, similar, allImages, configs,
    });
  } catch (err) {
    console.error('[/builder-project/:slug] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── ENQUIRY (AJAX) ───────────────────────────────────────────────
router.post('/builder-project/:slug/enquire', async (req, res) => {
  try {
    const db = getDB();
    const { name, phone, email, message } = req.body;
    if (!name || !phone) return res.status(400).json({ ok: false, error: 'Name and Phone number are required.' });

    const { data: p } = await db.from('builder_projects').select('id, name, loc, contact_numbers').eq('slug', req.params.slug).maybeSingle();
    if (!p) return res.status(404).json({ ok: false, error: 'Project not found.' });

    await db.from('enquiries').insert({
      property_id: p.id, property_name: p.name,
      name: name.trim(), phone: phone.trim(), email: (email || '').trim(), message: (message || '').trim(),
      property_ref: `${p.name} (${p.loc})`, page: '/builder-project/' + req.params.slug,
      created_at: new Date().toISOString(),
    });

    let agentPhone = '9380939961';
    if (p.contact_numbers) {
      const first = String(p.contact_numbers).split(',')[0].trim();
      if (first) agentPhone = first;
    }
    const cleanPhone = agentPhone.replace(/\D/g, '');
    const fullPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const waText = `Hi, I am interested in "${p.name}" (${p.loc}).\n\nBuyer: ${name.trim()}\nPhone: ${phone.trim()}${email ? '\nEmail: ' + email.trim() : ''}${message ? '\nMessage: ' + message.trim() : ''}`;
    const whatsappUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(waText)}`;

    res.json({ ok: true, whatsappUrl, msg: 'Enquiry submitted successfully!' });
  } catch (err) {
    console.error('[/builder-project/:slug/enquire] error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to process enquiry. Please try again.' });
  }
});

module.exports = router;
module.exports.getActiveBuilderProjects = getActiveBuilderProjects;
module.exports.normalize = normalize;
