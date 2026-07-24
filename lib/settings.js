'use strict';

let promoBanner = {
  active: false,
  kicker: 'MONSOON EXCLUSIVE OFFER',
  title: 'Free 3D Interior Design Render with Every Home Listing',
  subtitle: 'Get photorealistic 3D visualization and turnkey interior planning at zero upfront cost.',
  bg_img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
  cta_text: 'Explore Interior Showcase →',
  cta_link: '/interiors'
};

function getPromoBanner() {
  return promoBanner;
}

function updatePromoBanner(data) {
  promoBanner = {
    ...promoBanner,
    active: data.active !== undefined ? Boolean(data.active) : promoBanner.active,
    kicker: data.kicker || promoBanner.kicker,
    title: data.title || promoBanner.title,
    subtitle: data.subtitle || promoBanner.subtitle,
    bg_img: data.bg_img || promoBanner.bg_img,
    cta_text: data.cta_text || promoBanner.cta_text,
    cta_link: data.cta_link || promoBanner.cta_link,
  };
  return promoBanner;
}

module.exports = {
  getPromoBanner,
  updatePromoBanner,
};
