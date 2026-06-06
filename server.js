'use strict';
require('dotenv').config();

const express    = require('express');
const session    = require('express-session');
const compression = require('compression');
const path       = require('path');
const { initDB } = require('./db/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── middleware ────────────────────────────────────────────────────
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// static assets — long cache for images/css/js
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
}));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
}));

// session
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' },
}));

// views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// expose flash-style messages to all views
app.use((req, res, next) => {
  res.locals.flash  = req.session.flash || null;
  res.locals.admin  = req.session.admin || false;
  res.locals.path   = req.path;
  delete req.session.flash;
  next();
});

// ── routes ───────────────────────────────────────────────────────
app.use('/',      require('./routes/public'));
app.use('/admin', require('./routes/admin'));

// sitemap + robots
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
});

app.get('/sitemap.xml', require('./routes/sitemap'));

// 404
app.use((req, res) => res.status(404).render('404', { title: 'Page not found — RichManAssets' }));

// ── boot ─────────────────────────────────────────────────────────
initDB();

if (require.main === module) {
  app.listen(PORT, () => console.log(`RichManAssets running → http://localhost:${PORT}`));
}

module.exports = app;
