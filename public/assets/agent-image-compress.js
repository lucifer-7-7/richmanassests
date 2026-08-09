/**
 * Compresses images client-side before upload via <canvas> resize + JPEG re-encode.
 * Runs on file <input> change; replaces the input's FileList with compressed versions
 * so the multipart body reaching the server stays small.
 */
(function () {
  var MAX_DIMENSION = 1920;
  var TARGET_BYTES = 3 * 1024 * 1024; // 3MB
  var MIN_QUALITY = 0.5;

  function compressFile(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.resolve(file);
    if (file.size <= TARGET_BYTES) return Promise.resolve(file);

    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
          var scale = MAX_DIMENSION / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        tryQuality(canvas, 0.82, file.name, resolve, file);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file); // fall back to original if decode fails
      };
      img.src = url;
    });
  }

  function tryQuality(canvas, quality, filename, resolve, originalFile) {
    canvas.toBlob(function (blob) {
      if (!blob) return resolve(originalFile);
      if (blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
        return tryQuality(canvas, quality - 0.1, filename, resolve, originalFile);
      }
      var newName = filename.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg';
      resolve(new File([blob], newName, { type: 'image/jpeg' }));
    }, 'image/jpeg', quality);
  }

  function attach(input) {
    if (!input || input.dataset.compressBound) return;
    input.dataset.compressBound = '1';
    input.addEventListener('change', function () {
      var files = Array.from(input.files || []);
      if (!files.length) return;

      var statusEl = document.getElementById(input.id + '_status');
      if (statusEl) statusEl.textContent = 'Compressing…';

      Promise.all(files.map(compressFile)).then(function (compressed) {
        var dt = new DataTransfer();
        compressed.forEach(function (f) { dt.items.add(f); });
        input.files = dt.files;

        if (statusEl) {
          var totalKB = compressed.reduce(function (s, f) { return s + f.size; }, 0) / 1024;
          statusEl.textContent = compressed.length + ' image(s) ready (' + Math.round(totalKB) + ' KB)';
          statusEl.style.color = '#10b981';
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['img_card', 'img_hero', 'gallery'].forEach(function (id) {
      attach(document.getElementById(id));
    });
  });
})();
