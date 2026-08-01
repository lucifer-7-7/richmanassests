'use strict';
/**
 * Lightweight page-view tracker middleware.
 * Logs every public GET request to the `page_views` table asynchronously.
 * Parses User-Agent for device/browser/OS without any npm dependency.
 */
const { getDB } = require('../db/db');

// ── UA parser helpers (regex-based, zero dependencies) ────────────
function parseDevice(ua) {
  if (!ua) return 'desktop';
  if (/Mobi|Android.*Mobile|iPhone|iPod|Windows Phone|BB10|Opera Mini/i.test(ua)) return 'mobile';
  if (/iPad|Android(?!.*Mobile)|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  return 'desktop';
}

function parseBrowser(ua) {
  if (!ua) return 'Unknown';
  if (/Edg\//i.test(ua))          return 'Edge';
  if (/OPR|Opera/i.test(ua))     return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung';
  if (/UCBrowser/i.test(ua))      return 'UC Browser';
  if (/CriOS|Chrome/i.test(ua))   return 'Chrome';
  if (/FxiOS|Firefox/i.test(ua))  return 'Firefox';
  if (/Safari/i.test(ua))         return 'Safari';
  if (/MSIE|Trident/i.test(ua))   return 'IE';
  return 'Other';
}

function parseOS(ua) {
  if (!ua) return 'Unknown';
  if (/Windows/i.test(ua))                   return 'Windows';
  if (/iPhone|iPad|iPod/i.test(ua))          return 'iOS';
  if (/Macintosh|Mac OS/i.test(ua))          return 'macOS';
  if (/Android/i.test(ua))                   return 'Android';
  if (/Linux/i.test(ua))                     return 'Linux';
  if (/CrOS/i.test(ua))                      return 'ChromeOS';
  return 'Other';
}

// ── Simple in-memory IP→geo cache (avoids hammering free API) ─────
const geoCache = new Map();
const GEO_CACHE_TTL = 30 * 60 * 1000; // 30 min
const GEO_MAX_SIZE  = 2000;

async function geoLookup(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return { country: 'Local', city: 'Local', region: '' };
  }

  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) return cached.data;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,regionName`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const j = await res.json();
    const data = j.status === 'success'
      ? { country: j.country || '', city: j.city || '', region: j.regionName || '' }
      : { country: '', city: '', region: '' };

    if (geoCache.size >= GEO_MAX_SIZE) {
      const oldest = geoCache.keys().next().value;
      geoCache.delete(oldest);
    }
    geoCache.set(ip, { ts: Date.now(), data });
    return data;
  } catch (_) {
    return { country: '', city: '', region: '' };
  }
}

// ── Skip paths that aren't actual page views ──────────────────────
const SKIP_PREFIX = ['/assets', '/uploads', '/favicon', '/robots', '/sitemap', '/llms', '/webhooks', '/admin', '/agent'];
const SKIP_EXT   = ['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.map', '.json'];

function shouldTrack(req) {
  if (req.method !== 'GET') return false;
  const p = req.path.toLowerCase();
  if (SKIP_PREFIX.some(s => p.startsWith(s))) return false;
  if (SKIP_EXT.some(ext => p.endsWith(ext)))  return false;
  return true;
}

// ── Middleware ─────────────────────────────────────────────────────
function trackVisit(req, res, next) {
  if (!shouldTrack(req)) return next();

  // Fire-and-forget — never block the response
  setImmediate(async () => {
    try {
      const db = getDB();
      if (!db) return;

      const ua     = req.headers['user-agent'] || '';
      const ip     = (req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.ip || '').split(',')[0].trim();
      const ref    = req.headers['referer'] || req.headers['referrer'] || '';

      const geo = await geoLookup(ip);

      await db.from('page_views').insert({
        path:        req.originalUrl || req.path,
        referrer:    ref.slice(0, 500),
        user_agent:  ua.slice(0, 500),
        device_type: parseDevice(ua),
        browser:     parseBrowser(ua),
        os:          parseOS(ua),
        ip:          ip.slice(0, 45),
        country:     (geo.country || '').slice(0, 100),
        city:        (geo.city || '').slice(0, 100),
        region:      (geo.region || '').slice(0, 100),
      });
    } catch (err) {
      // Silent — never crash the app for analytics
      if (process.env.NODE_ENV !== 'production') {
        console.error('[trackVisit]', err.message);
      }
    }
  });

  next();
}

module.exports = trackVisit;
