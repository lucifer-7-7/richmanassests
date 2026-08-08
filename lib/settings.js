'use strict';

const { getDB } = require('../db/db');

const CACHE_TTL = 60 * 1000; // 60 seconds
let _cache = {};

async function getSetting(key, fallback = null) {
  const now = Date.now();
  if (_cache[key] && now - _cache[key].ts < CACHE_TTL) {
    return _cache[key].value;
  }

  try {
    const db = getDB();
    const { data, error } = await db.from('settings').select('value').eq('key', key).maybeSingle();

    if (error) throw error;

    const value = data ? data.value : fallback;
    _cache[key] = { value, ts: now };

    if (!data && fallback !== null) {
      await setSetting(key, fallback);
    }

    return value;
  } catch (err) {
    console.error(`[settings] getSetting(${key}) error:`, err.message);
    return fallback;
  }
}

async function setSetting(key, value) {
  try {
    const db = getDB();
    const { error } = await db.from('settings').upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    }).eq('key', key);

    if (error) throw error;

    _cache[key] = { value, ts: Date.now() };
    return value;
  } catch (err) {
    console.error(`[settings] setSetting(${key}) error:`, err.message);
    throw err;
  }
}

function invalidateCache() {
  _cache = {};
}

async function getPromoBanner() {
  const defaultBanner = {
    active: false,
    placement: 'all',
    kicker: 'MONSOON EXCLUSIVE OFFER',
    title: 'Free 3D Interior Design Render with Every Home Listing',
    subtitle: 'Get photorealistic 3D visualization and turnkey interior planning at zero upfront cost.',
    bg_img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
    cta_text: 'Explore Interior Showcase →',
    cta_link: '/interiors',
  };

  return await getSetting('promo_banner', defaultBanner);
}

async function updatePromoBanner(data) {
  const current = await getPromoBanner();
  const updated = {
    ...current,
    active: data.active !== undefined ? Boolean(data.active) : current.active,
    placement: data.placement || current.placement || 'all',
    kicker: data.kicker || current.kicker,
    title: data.title || current.title,
    subtitle: data.subtitle || current.subtitle,
    bg_img: data.bg_img || current.bg_img,
    cta_text: data.cta_text || current.cta_text,
    cta_link: data.cta_link || current.cta_link,
  };
  return await setSetting('promo_banner', updated);
}

async function getUseDummyData() {
  return await getSetting('use_dummy_data', true);
}

async function setUseDummyData(value) {
  return await setSetting('use_dummy_data', Boolean(value));
}

async function getHeroPropertyIds() {
  return await getSetting('hero_property_ids', null);
}

async function setHeroPropertyIds(ids) {
  const capped = (Array.isArray(ids) ? ids : []).slice(0, 6);
  return await setSetting('hero_property_ids', capped.length ? capped : null);
}

module.exports = {
  getSetting,
  setSetting,
  invalidateCache,
  getPromoBanner,
  updatePromoBanner,
  getUseDummyData,
  setUseDummyData,
  getHeroPropertyIds,
  setHeroPropertyIds,
};
