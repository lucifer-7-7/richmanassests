'use strict';

// Inserts delivery-time transform params (f_auto,q_auto,w_) into a Cloudinary URL.
// Upload-time fetch_format:'auto' cannot resolve a browser's Accept header, so images
// were being served as full-size PNGs — this fixes it at the one place URLs render.
function cldOptimize(url, { w } = {}) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1 || !url.includes('res.cloudinary.com')) return url;

  const params = ['f_auto', 'q_auto'];
  if (w) params.push(`w_${w}`);

  const before = url.slice(0, idx + marker.length);
  const after = url.slice(idx + marker.length);
  return before + params.join(',') + '/' + after;
}

module.exports = { cldOptimize };
