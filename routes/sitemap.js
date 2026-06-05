'use strict';
const { getDB } = require('../db/db');

module.exports = function sitemap(req, res) {
  const db     = getDB();
  const base   = `${req.protocol}://${req.get('host')}`;
  const props  = db.prepare('SELECT id, created_at FROM properties WHERE active=1').all();

  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/properties', priority: '0.9', changefreq: 'daily' },
    { loc: '/services', priority: '0.8', changefreq: 'monthly' },
    { loc: '/loans', priority: '0.7', changefreq: 'monthly' },
    { loc: '/contact', priority: '0.7', changefreq: 'monthly' },
  ];

  const urls = [
    ...staticPages.map(p => `
  <url>
    <loc>${base}${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
    ...props.map(p => `
  <url>
    <loc>${base}/property/${p.id}</loc>
    <lastmod>${p.created_at ? p.created_at.split(' ')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`),
  ];

  res.set('Content-Type', 'application/xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`);
};
