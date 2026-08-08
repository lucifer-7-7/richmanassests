window.RMAPreview = (function() {
  let isOpen = false;

  function readFormValues(formEl) {
    const form = new FormData(formEl);
    return {
      name: form.get('name') || 'Property Name',
      price: form.get('price') || '₹0',
      loc: form.get('loc') || 'Location',
      type: form.get('type') || 'Property',
      listing: form.get('listing') || 'sale',
      beds: form.get('beds') || '',
      sqft: form.get('sqft') || '',
    };
  }

  function getImageObjectUrls(formEl) {
    const imgCardInput = formEl.querySelector('input[name="img_card"]');
    const imgHeroInput = formEl.querySelector('input[name="img_hero"]');

    const cardUrl = imgCardInput?.files[0] ? URL.createObjectURL(imgCardInput.files[0]) : '/assets/img/site-hero.jpg';
    const heroUrl = imgHeroInput?.files[0] ? URL.createObjectURL(imgHeroInput.files[0]) : cardUrl;

    return { cardUrl, heroUrl };
  }

  function renderModal(formEl) {
    const values = readFormValues(formEl);
    const { cardUrl, heroUrl } = getImageObjectUrls(formEl);

    const listingLabel = values.listing === 'sale' ? 'For Sale' : values.listing === 'rent' ? 'For Rent' : 'For Lease';

    const html = `
      <div id="rmaPreviewOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="background:white;border-radius:16px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;position:relative;">
          <button onclick="window.RMAPreview.close()" style="position:absolute;top:16px;right:16px;background:#fff;border:1px solid #e0e0e0;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:10000;">×</button>

          <div style="padding:32px;text-align:center;border-bottom:1px solid #f0f0f0;">
            <h2 style="font-family:Georgia,serif;font-size:24px;margin:0 0 8px;font-weight:500;">Preview Your Listing</h2>
            <p style="color:#999;font-size:13px;margin:0;">This is how your property will look to buyers</p>
          </div>

          <div style="padding:32px;">
            <!-- HERO PREVIEW -->
            <div style="margin-bottom:48px;">
              <div style="position:relative;height:300px;border-radius:12px;overflow:hidden;background:#f5f5f5;margin-bottom:16px;">
                <img src="${heroUrl}" style="width:100%;height:100%;object-fit:cover;" alt="Hero">
                <div style="position:absolute;inset:0;background:rgba(0,0,0,0.2);display:flex;flex-direction:column;justify-content:flex-end;padding:24px;color:white;">
                  <div style="font-size:28px;font-weight:700;margin-bottom:8px;">${values.price}</div>
                  <div style="font-size:16px;font-weight:600;margin-bottom:4px;">${values.name}</div>
                  <div style="font-size:13px;opacity:0.9;">${values.loc} · ${values.type}</div>
                </div>
              </div>
              <p style="color:#999;font-size:12px;text-align:center;margin:0;">Hero Section on Homepage</p>
            </div>

            <!-- CARD PREVIEW -->
            <div style="margin-bottom:48px;">
              <div style="display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:16px;">
                <div style="background:white;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
                  <div style="position:relative;aspect-ratio:4/3;overflow:hidden;background:#f5f5f5;">
                    <img src="${cardUrl}" style="width:100%;height:100%;object-fit:cover;" alt="Card">
                    <span style="position:absolute;top:12px;left:12px;background:#B5934C;color:white;padding:6px 12px;border-radius:999px;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">${listingLabel}</span>
                  </div>
                  <div style="padding:16px;">
                    <div style="font-family:Georgia,serif;font-size:22px;font-weight:600;letter-spacing:-0.01em;line-height:1;margin-bottom:8px;">${values.price}</div>
                    <h3 style="font-family:Georgia,serif;font-weight:500;font-size:16px;line-height:1.06;margin:0 0 6px;color:#1a1a1a;">${values.name}</h3>
                    <div style="font-family:monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#78716c;display:flex;align-items:center;gap:6px;margin-bottom:12px;">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2a6 6 0 0 0-6 6c0 3.25 6 8 6 8s6-4.75 6-8a6 6 0 0 0-6-6z"/><circle cx="8" cy="8" r="2"/></svg>
                      <span>${values.loc} · ${values.type}</span>
                    </div>
                    ${values.beds ? `<div style="display:flex;gap:12px;font-size:12px;color:#44403c;padding-top:8px;border-top:1px solid #f0f0f0;margin-top:8px;"><span>${values.beds}</span></div>` : ''}
                  </div>
                  <div style="padding:12px 16px;border-top:1px solid #f0f0f0;display:flex;gap:8px;">
                    <a href="#" style="flex:1;padding:10px;text-align:center;background:#1a1a1a;color:white;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">View Details →</a>
                    <a href="#" style="flex:none;width:42px;height:42px;display:grid;place-items:center;border-radius:50%;border:1px solid #e5e5e5;text-decoration:none;">💬</a>
                  </div>
                </div>
              </div>
              <p style="color:#999;font-size:12px;text-align:center;margin:0;">Property Card in Search Results</p>
            </div>

            <button onclick="window.RMAPreview.close()" style="width:100%;padding:12px;background:#f5f5f5;border:1px solid #e5e5e5;border-radius:8px;cursor:pointer;font-weight:600;transition:0.2s;">Close Preview</button>
          </div>
        </div>
      </div>
    `;

    return html;
  }

  return {
    open: function(formEl) {
      if (isOpen) return;
      isOpen = true;

      const modal = document.createElement('div');
      modal.innerHTML = renderModal(formEl);
      modal.id = 'rmaPreviewModal';
      document.body.appendChild(modal);

      // Close on overlay click
      const overlay = modal.querySelector('#rmaPreviewOverlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) window.RMAPreview.close();
        });
      }
    },
    close: function() {
      if (!isOpen) return;
      isOpen = false;

      const modal = document.getElementById('rmaPreviewModal');
      if (modal) {
        modal.remove();
      }
    }
  };
})();
