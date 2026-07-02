'use strict';
const { getDB } = require('../db/db');

const TODAY = new Date().toISOString().split('T')[0];

function xmlUrl(loc, { changefreq = 'monthly', priority = '0.7', lastmod } = {}) {
  return `\n  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

module.exports = async function sitemap(req, res) {
  try {
    const db   = getDB();
    const base = `${req.protocol}://${req.get('host')}`;

    // Fetch all published properties
    let props = [], agentProps = [], areas = [];
    try {
      const [propsRes, agentPropsRes] = await Promise.all([
        db.from('properties').select('id, created_at').eq('active', true),
        db.from('agent_properties').select('id, published_at').eq('status', 'published'),
      ]);
      props      = propsRes.data || [];
      agentProps = agentPropsRes.data || [];

      const areaRes = await db.from('properties').select('area').eq('active', true).neq('area', '');
      areas = [...new Set((areaRes.data || []).map(r => r.area).filter(Boolean))].sort();
    } catch (_) {
      // Fallback for SQLite-based local dev
      try {
        props = db.prepare('SELECT id, created_at FROM properties WHERE active=1').all();
        areas = db.prepare("SELECT DISTINCT area FROM properties WHERE active=1 AND area!='' ORDER BY area").all().map(r => r.area);
      } catch (__) { /* ignore */ }
    }

    // ── Static pages ──────────────────────────────────────────────
    const staticPages = [
      { loc: '/',           priority: '1.0', changefreq: 'weekly',   lastmod: TODAY },
      { loc: '/properties', priority: '0.95', changefreq: 'daily',   lastmod: TODAY },
      { loc: '/services',   priority: '0.8', changefreq: 'monthly',  lastmod: TODAY },
      { loc: '/about',      priority: '0.75', changefreq: 'monthly', lastmod: TODAY },
      { loc: '/loans',      priority: '0.8', changefreq: 'monthly',  lastmod: TODAY },
      { loc: '/contact',    priority: '0.75', changefreq: 'monthly', lastmod: TODAY },
    ];

    // ── Property-type landing pages (keyword targets) ─────────────
    const typePages = [
      { type: 'Villa',        label: 'Villas',        pri: '0.85' },
      { type: 'House',        label: 'Houses',        pri: '0.85' },
      { type: 'Apartment',    label: 'Apartments',    pri: '0.85' },
      { type: 'Plot',         label: 'Plots',         pri: '0.85' },
      { type: 'Commercial',   label: 'Commercial',    pri: '0.8'  },
      { type: 'Agricultural', label: 'Agricultural',  pri: '0.75' },
      { type: 'Estate',       label: 'Estates',       pri: '0.75' },
    ];

    // ── Listing-type landing pages ────────────────────────────────
    const listingPages = [
      { listing: 'sale',  pri: '0.9' },
      { listing: 'rent',  pri: '0.85' },
      { listing: 'lease', pri: '0.8' },
    ];

    const urls = [
      // Static
      ...staticPages.map(p => xmlUrl(`${base}${p.loc}`, p)),
      // Property type pages
      ...typePages.map(t => xmlUrl(`${base}/properties?type=${encodeURIComponent(t.type)}`, { changefreq: 'weekly', priority: t.pri, lastmod: TODAY })),
      // Listing type pages
      ...listingPages.map(l => xmlUrl(`${base}/properties?listing=${l.listing}`, { changefreq: 'weekly', priority: l.pri, lastmod: TODAY })),
      // Area pages (high local-SEO value)
      ...areas.map(a => xmlUrl(`${base}/properties?area=${encodeURIComponent(a)}`, { changefreq: 'weekly', priority: '0.8', lastmod: TODAY })),
      // Area + type combos for top localities
      ...['Udupi', 'Manipal', 'Mangaluru'].flatMap(a => [
        xmlUrl(`${base}/properties?area=${encodeURIComponent(a)}&listing=sale`,  { changefreq: 'weekly', priority: '0.75', lastmod: TODAY }),
        xmlUrl(`${base}/properties?area=${encodeURIComponent(a)}&type=Villa`,    { changefreq: 'weekly', priority: '0.7',  lastmod: TODAY }),
        xmlUrl(`${base}/properties?area=${encodeURIComponent(a)}&type=Plot`,     { changefreq: 'weekly', priority: '0.7',  lastmod: TODAY }),
        xmlUrl(`${base}/properties?area=${encodeURIComponent(a)}&type=Apartment`,{ changefreq: 'weekly', priority: '0.7',  lastmod: TODAY }),
      ]),
      // Individual property pages
      ...props.map(p => xmlUrl(`${base}/property/${p.id}`, {
        lastmod: p.created_at ? p.created_at.split('T')[0] : TODAY,
        changefreq: 'monthly', priority: '0.8',
      })),
      ...agentProps.map(p => xmlUrl(`${base}/property/${p.id}`, {
        lastmod: p.published_at ? p.published_at.split('T')[0] : TODAY,
        changefreq: 'monthly', priority: '0.75',
      })),
    ];

    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}\n</urlset>`);
  } catch (err) {
    console.error('[sitemap]', err.message);
    res.status(500).send('Sitemap error');
  }
};
