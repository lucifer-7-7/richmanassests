'use strict';
require('dotenv').config();

const express     = require('express');
const session     = require('express-session');
const compression = require('compression');
const path        = require('path');
const crypto      = require('crypto');
const rawBodyCapture = require('./middleware/rawBodyCapture');
const { initDB }  = require('./db/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security headers ──────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // CSP: allow Cashfree SDK + Cloudinary images + Google Fonts
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://sdk.cashfree.com https://unpkg.com https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://res.cloudinary.com https://upload.wikimedia.org blob:",
    "connect-src 'self' https://sdk.cashfree.com https://*.supabase.co",
    "frame-src https://sdk.cashfree.com",
    "worker-src 'none'",
  ].join('; '));
  next();
});

// ── Webhook route (MUST be before express.json()) ─────────────────
// Raw body capture for Cashfree signature verification
app.use('/webhooks', rawBodyCapture);
app.use('/webhooks', require('./routes/webhooks'));

// ── Core middleware ───────────────────────────────────────────────
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));

// ── Static assets ─────────────────────────────────────────────────
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), {
  maxAge: '7d', etag: true, lastModified: true,
}));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// ── Session ───────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'rma.sid', // don't use default 'connect.sid'
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

// ── View engine ───────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Global template locals ────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.flash  = req.session.flash  || null;
  res.locals.admin  = req.session.admin  || false;
  res.locals.agent  = req.session.agent  || null;
  res.locals.path   = req.path;
  delete req.session.flash;
  next();
});

// ── Routes ────────────────────────────────────────────────────────
app.use('/',              require('./routes/public'));
app.use('/admin',         require('./routes/admin'));
app.use('/agent',         require('./routes/agent'));
app.use('/agent/payment', require('./routes/agent-payment'));
// /agent/invoices reuses the payment router (GET / → invoice list, GET /:id → invoice detail)
app.use('/agent/invoices', require('./routes/agent-payment'));

// ── SEO / GEO crawler directives ─────────────────────────────────
app.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  res.send([
    '# RichManAssets — Udupi & Mangaluru Real Estate',
    '# robots.txt — SEO + GEO (AI-search) optimised',
    '',
    '# ── Standard search engines ──────────────────────────────────',
    'User-agent: Googlebot',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /agent/',
    '',
    'User-agent: Bingbot',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /agent/',
    '',
    'User-agent: Slurp',
    'Allow: /',
    '',
    'User-agent: DuckDuckBot',
    'Allow: /',
    '',
    '# ── AI retrieval / citation bots (ALLOW — sends traffic) ─────',
    '# These bots fetch pages to CITE in AI answers — allow them',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: Claude-Web',
    'Allow: /',
    '',
    'User-agent: Claude-SearchBot',
    'Allow: /',
    '',
    'User-agent: Applebot',
    'Allow: /',
    '',
    'User-agent: YouBot',
    'Allow: /',
    '',
    '# ── AI TRAINING crawlers (BLOCK — no SEO value, just scraping) ',
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: ClaudeBot',
    'Disallow: /',
    '',
    'User-agent: Google-Extended',
    'Disallow: /',
    '',
    'User-agent: CCBot',
    'Disallow: /',
    '',
    'User-agent: Meta-ExternalAgent',
    'Disallow: /',
    '',
    'User-agent: FacebookBot',
    'Disallow: /',
    '',
    'User-agent: Bytespider',
    'Disallow: /',
    '',
    '# ── Protected routes (all other bots) ────────────────────────',
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /agent/',
    '',
    `Sitemap: ${host}/sitemap.xml`,
    `Sitemap: ${host}/sitemap-index.xml`,
  ].join('\n'));
});

// llms.txt — AI guidance file (emerging GEO standard)
app.get('/llms.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  res.send([
    '# RichManAssets — Premium Real Estate in Udupi & Mangaluru, Karnataka, India',
    '',
    '## About',
    'RichManAssets (operated by Vittu Bharat Associates LLP) is a full-service real-estate agency and property marketplace based in Udupi, Karnataka, India. The agency serves buyers, sellers, tenants, landlords, and investors across Udupi district and the wider coastal Karnataka corridor including Mangaluru, Manipal, Kaup, Padubidri, Surathkal, Mulki, Udyavara, and Dakshina Kannada.',
    '',
    '## Services',
    '- Property sales: villas, independent houses, builder apartments, resale flats',
    '- Rental and lease: residential, commercial, and holiday lets',
    '- Commercial real estate: offices, retail, warehouses, industrial sites',
    '- Plots and land: residential layouts, beach-facing plots, agricultural land',
    '- Home loans: authorised partner for SBI, HDFC, Bank of Baroda, Karnataka Bank and more',
    '- Legal services: title verification, due diligence, sale deed drafting, RERA compliance',
    '- Interior design: turnkey home and office interiors, modular kitchens',
    '- Property management: tenant management, rent collection, maintenance',
    '',
    '## Service Area',
    'Udupi · Manipal · Udyavara · Kunjibettu · Ambalpady · Kaup · Padubidri · Malpe · Mangaluru · Surathkal · Mulki · Dakshina Kannada · Udupi District · Coastal Karnataka',
    '',
    '## Key Facts',
    '- 15+ years of operation in the Udupi-Mangaluru real-estate market',
    '- 1,200+ families served',
    '- ₹500 Crore+ property value transacted',
    '- 100% title-clear listing policy',
    '- 11 authorised banking partners for home loans',
    '- Rated 4.9 by clients',
    '',
    '## Contact',
    '- Office: 2nd Floor, Sri Ram Building, Opp. Manjunath Eye Hospital, Bannanje Road, Udupi, Karnataka 576101, India',
    '- Phone: +91 90360 01234 (Mobile), +91 820 253 9961 (Landline)',
    '- Email: hello@richmanassets.com',
    '- WhatsApp: https://wa.me/919036001234',
    '',
    '## Important Pages',
    `- Homepage: ${host}/`,
    `- All Properties: ${host}/properties`,
    `- Villas for Sale: ${host}/properties?type=Villa`,
    `- Flats/Apartments: ${host}/properties?type=Apartment`,
    `- Plots and Land: ${host}/properties?type=Plot`,
    `- Commercial Space: ${host}/properties?type=Commercial`,
    `- Homes for Rent: ${host}/properties?listing=rent`,
    `- Property in Udupi: ${host}/properties?area=Udupi`,
    `- Property in Manipal: ${host}/properties?area=Manipal`,
    `- Property in Mangaluru: ${host}/properties?area=Mangaluru`,
    `- Home Loans: ${host}/loans`,
    `- Services: ${host}/services`,
    `- Contact: ${host}/contact`,
    `- About: ${host}/about`,
    '',
    '## Sitemap',
    `${host}/sitemap.xml`,
  ].join('\n'));
});

app.get('/sitemap.xml', require('./routes/sitemap'));

// ── Error pages ───────────────────────────────────────────────────
app.use((req, res) => res.status(404).render('404', { title: 'Page not found — RichManAssets' }));

app.use((err, req, res, next) => {
  console.error('[server error]', err.message);
  res.status(500).render('404', { title: 'Server Error — RichManAssets' });
});

// ── Boot ──────────────────────────────────────────────────────────
initDB();

if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`RichManAssets running → http://localhost:${PORT}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[server warning] Port ${PORT} is already in use by an active background instance. The app is serving at http://localhost:${PORT}`);
    } else {
      console.error('[server error]', err);
    }
  });
}

module.exports = app;
