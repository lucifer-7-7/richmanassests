function toggleSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

function showPanel(id) {
  const target = document.getElementById('panel-' + id);
  if (!target) return;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar button').forEach(b => b.classList.remove('active'));
  target.classList.add('active');
  const sb = document.getElementById('sb-' + id);
  if (sb) sb.classList.add('active');

  // Mirror the active state onto the mobile bottom nav
  document.querySelectorAll('.admin-tabbar [data-panel]').forEach(function (t) {
    t.classList.toggle('is-active', t.getAttribute('data-panel') === id);
  });

  // Close drawer on mobile
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  }
  
  window.scrollTo(0,0);
}

function previewImg(input, previewId) {
  const file = input.files[0];
  if (!file) return;
  const img = document.getElementById(previewId);
  img.src = URL.createObjectURL(file);
  img.classList.add('show');
}

// auto-slug from name
const nameField = document.getElementById('nameField');
const slugField = document.getElementById('slugField');
if (nameField && slugField) {
  nameField.addEventListener('input', function() {
    if (!slugField.dataset.manual) {
      slugField.value = nameField.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    }
  });
  slugField.addEventListener('input', function() { slugField.dataset.manual = '1'; });
}

// filter properties
function filterProps() {
  const q = (document.getElementById('searchProp').value || '').toLowerCase();
  const l = document.getElementById('filterListing').value;
  document.querySelectorAll('#propGrid .prop-card').forEach(card => {
    const nameMatch = !q || card.dataset.name.includes(q);
    const listMatch = !l || card.dataset.listing === l;
    card.style.display = nameMatch && listMatch ? '' : 'none';
  });
}

// open add panel if URL hash says so
if (location.hash === '#add') showPanel('add');
if (location.search.includes('tab=enquiries')) showPanel('enquiries');
if (location.search.includes('tab=agent-listings')) showPanel('agent-listings');
if (location.search.includes('tab=agents')) showPanel('agents');
if (location.search.includes('tab=payments')) showPanel('payments');
if (location.search.includes('tab=webhooks')) showPanel('webhooks');
if (location.search.includes('tab=audit')) showPanel('audit');
if (location.search.includes('tab=analytics')) showPanel('analytics');

// filter enquiries
function filterEnquiries() {
  const q = (document.getElementById('searchEnq').value || '').toLowerCase();
  const f = document.getElementById('filterEnqStatus').value;
  document.querySelectorAll('#enqGrid .enq-card').forEach(card => {
    const textContent = (card.dataset.name + ' ' + card.dataset.details).toLowerCase();
    const textMatch = !q || textContent.includes(q);
    const statusMatch = !f || (f === 'unread' && card.dataset.read === '0') || (f === 'read' && card.dataset.read === '1');
    card.style.display = textMatch && statusMatch ? '' : 'none';
  });
}

// filter payments (mobile & desktop)
function filterPayments() {
  const searchInput = document.getElementById('searchPayment');
  const statusSelect = document.getElementById('filterPaymentStatus');
  if (!searchInput || !statusSelect) return;
  const q = searchInput.value.toLowerCase().trim();
  const st = statusSelect.value.toLowerCase().trim();
  document.querySelectorAll('.payment-row').forEach(row => {
    const textMatch = !q || (row.dataset.search || '').includes(q);
    const rowStatus = row.dataset.status || '';
    let statusMatch = !st;
    if (st === 'paid') statusMatch = (rowStatus === 'paid' || rowStatus === 'captured');
    else if (st === 'failed') statusMatch = (rowStatus === 'failed' || rowStatus === 'cancelled');
    else if (st === 'processing') statusMatch = (rowStatus === 'processing');
    else if (st === 'created') statusMatch = (rowStatus === 'created');
    else if (st === 'refunded') statusMatch = (rowStatus === 'refunded' || rowStatus === 'refund_initiated');
    
    row.style.display = textMatch && statusMatch ? '' : 'none';
  });
}

function togglePayDetail(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = (el.style.display === 'none' || !el.style.display) ? 'table-row' : 'none';
}

// ── gallery multi-preview ──
function previewGallery(input, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  Array.from(input.files).forEach(function(file) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.cssText = 'width:80px;height:54px;object-fit:cover;border-radius:10px;border:1px solid #e0ddd6';
    container.appendChild(img);
  });
}

// ── tag-input (amenities + pills) ──
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.tag-input{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border:1px solid transparent;border-radius:12px;min-height:44px;cursor:text;background:var(--surface2)}',
    '.tag-input:focus-within{background:#fff;border-color:#0F0F12;box-shadow:0 0 0 3px rgba(15,15,18,0.06)}',
    '.tag-chip{display:inline-flex;align-items:center;gap:6px;background:#0F0F12;color:#fff;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700}',
    '.tag-chip button{background:none;border:0;cursor:pointer;color:#8E8E93;font-size:14px;line-height:1;padding:0 2px}',
    '.tag-chip button:hover{color:#fff}',
    '.tag-typeahead{border:0;outline:0;flex:1;min-width:120px;font:inherit;font-size:13.5px;background:none;padding:2px 4px}',
    '.gallery-prev{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}',
  ].join('');
  document.head.appendChild(style);

  function initTagInput(containerEl, hiddenInputId) {
    if (!containerEl) return;
    var hidden = document.getElementById(hiddenInputId);
    var chips = [];

    var input = document.createElement('input');
    input.className = 'tag-typeahead';
    input.placeholder = 'Type and press Enter…';
    containerEl.appendChild(input);

    function sync() {
      if (hidden) hidden.value = chips.join('|');
    }
    function addChip(val) {
      val = val.trim();
      if (!val || chips.indexOf(val) !== -1) return;
      chips.push(val);
      var chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = val;
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.addEventListener('click', function() {
        chips.splice(chips.indexOf(val), 1);
        chip.remove();
        sync();
      });
      chip.appendChild(del);
      containerEl.insertBefore(chip, input);
      sync();
    }

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addChip(input.value.replace(/,/g,''));
        input.value = '';
      } else if (e.key === 'Backspace' && !input.value && chips.length) {
        var last = chips[chips.length - 1];
        chips.pop();
        containerEl.querySelectorAll('.tag-chip')[containerEl.querySelectorAll('.tag-chip').length - 1].remove();
        sync();
      }
    });
    input.addEventListener('blur', function() {
      if (input.value.trim()) { addChip(input.value); input.value = ''; }
    });
    containerEl.addEventListener('click', function() { input.focus(); });

    if (hidden && hidden.value) {
      hidden.value.split('|').forEach(function(v) { addChip(v); });
    }
  }

  initTagInput(document.getElementById('amen-tags-add'), 'amenities-add');
  initTagInput(document.getElementById('pills-tags-add'), 'setting_pills-add');

  // Dynamic property type field adaptation for Admin Add Property form
  var addPtype = document.getElementById('add-ptype');
  var lblAddBeds = document.getElementById('lbl-add-beds');
  var inputAddBeds = document.getElementById('add-beds');
  var lblAddBaths = document.getElementById('lbl-add-baths');
  var inputAddBaths = document.getElementById('add-baths');
  var lblAddSqft = document.getElementById('lbl-add-sqft');
  var inputAddSqft = document.getElementById('add-sqft');

  function updateAddPropFieldLabels() {
    if (!addPtype) return;
    var v = (addPtype.value || '').toLowerCase();
    if (v.includes('plot') || v.includes('land')) {
      if (lblAddBeds) lblAddBeds.textContent = 'Road Width / Facing';
      if (inputAddBeds) inputAddBeds.placeholder = 'e.g. 30 ft road · East facing';
      if (lblAddBaths) lblAddBaths.textContent = 'Plot Dimensions';
      if (inputAddBaths) inputAddBaths.placeholder = 'e.g. 40 x 60 ft';
      if (lblAddSqft) lblAddSqft.textContent = 'Plot Area (sqft / Cents)';
      if (inputAddSqft) inputAddSqft.placeholder = 'e.g. 10 Cents (4,356 sqft)';
    } else if (v.includes('agricultural')) {
      if (lblAddBeds) lblAddBeds.textContent = 'Irrigation Source';
      if (inputAddBeds) inputAddBeds.placeholder = 'e.g. Borewell & River stream';
      if (lblAddBaths) lblAddBaths.textContent = 'Soil Type / Crop';
      if (inputAddBaths) inputAddBaths.placeholder = 'e.g. Red fertile soil · Coconut plantation';
      if (lblAddSqft) lblAddSqft.textContent = 'Land Area (Acres)';
      if (inputAddSqft) inputAddSqft.placeholder = 'e.g. 3.5 Acres';
    } else if (v.includes('commercial') || v.includes('office') || v.includes('shop')) {
      if (lblAddBeds) lblAddBeds.textContent = 'Floor Level / Lift';
      if (inputAddBeds) inputAddBeds.placeholder = 'e.g. 2nd Floor (Lift available)';
      if (lblAddBaths) lblAddBaths.textContent = 'Washrooms / Parking';
      if (inputAddBaths) inputAddBaths.placeholder = 'e.g. 2 Washrooms · 4 Car parking';
      if (lblAddSqft) lblAddSqft.textContent = 'Carpet Area (sqft)';
      if (inputAddSqft) inputAddSqft.placeholder = 'e.g. 2,200 sqft';
    } else {
      if (lblAddBeds) lblAddBeds.textContent = 'Bedrooms';
      if (inputAddBeds) inputAddBeds.placeholder = 'e.g. 4';
      if (lblAddBaths) lblAddBaths.textContent = 'Bathrooms';
      if (inputAddBaths) inputAddBaths.placeholder = 'e.g. 4';
      if (lblAddSqft) lblAddSqft.textContent = 'Built-up Area (sqft)';
      if (inputAddSqft) inputAddSqft.placeholder = 'e.g. 4,200 sqft';
    }
  }
  if (addPtype) {
    addPtype.addEventListener('change', updateAddPropFieldLabels);
    updateAddPropFieldLabels();
  }
})();

// ── Hero Picker Logic ──
window.HeroPicker = (function() {
  var selectedOrder = [];
  var maxItems = 6;

  function getSelectedCheckboxes() {
    return Array.from(document.querySelectorAll('input[name="hero_ids"]:checked'));
  }

  function updateSelection() {
    var checkboxes = getSelectedCheckboxes();

    // Enforce 6-item cap
    if (checkboxes.length > maxItems) {
      checkboxes[checkboxes.length - 1].checked = false;
      checkboxes = getSelectedCheckboxes();
    }

    // Build selection order from checked state
    selectedOrder = checkboxes.map(cb => cb.value);

    // Update preview strip
    var strip = document.getElementById('heroPreviewStrip');
    if (selectedOrder.length === 0) {
      strip.innerHTML = '<div style="font-size:13px;color:var(--muted);flex:0 0 auto;">None selected yet</div>';
    } else {
      strip.innerHTML = selectedOrder.map(function(propId) {
        var checkbox = document.querySelector('input[value="' + propId + '"]');
        if (!checkbox) return '';
        var name = checkbox.getAttribute('data-prop-name') || 'Unknown';
        var img = checkbox.getAttribute('data-prop-img') || '/assets/img/site-hero.jpg';
        return '<div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
          '<img src="' + img + '" alt="' + name + '" style="width:80px;height:60px;object-fit:cover;border-radius:8px;border:2px solid #0F0F12;">' +
          '<span style="font-size:11px;color:var(--ink-2);text-align:center;max-width:80px;white-space:normal;line-height:1.2;">' + name + '</span>' +
          '</div>';
      }).join('');
    }

    // Update cap message
    var capMsg = document.getElementById('heroCapMessage');
    if (capMsg) capMsg.textContent = selectedOrder.length + ' selected' + (selectedOrder.length === maxItems ? ' (max reached)' : '');

    // Update order badges and overlay highlighting
    Array.from(document.querySelectorAll('input[name="hero_ids"]')).forEach(function(cb) {
      var wrapper = cb.closest('div[style*="position:relative"]');
      if (!wrapper) return;

      var badge = wrapper.querySelector('.hero-order-badge');
      var overlay = wrapper.querySelector('.hero-thumb-overlay');
      var label = cb.closest('label');

      if (cb.checked) {
        var position = selectedOrder.indexOf(cb.value) + 1;
        if (badge) {
          badge.style.display = 'flex';
          badge.textContent = position;
        }
        if (overlay) overlay.style.background = 'rgba(0,0,0,0.3)';
        if (label) label.style.borderColor = '#0F0F12';
      } else {
        if (badge) badge.style.display = 'none';
        if (overlay) overlay.style.background = 'rgba(0,0,0,0)';
        if (label) label.style.borderColor = 'var(--line)';
      }
    });

    // Disable remaining checkboxes if at max
    var allCheckboxes = Array.from(document.querySelectorAll('input[name="hero_ids"]'));
    var atMax = selectedOrder.length >= maxItems;
    allCheckboxes.forEach(function(cb) {
      if (!cb.checked) {
        cb.disabled = atMax;
      } else {
        cb.disabled = false;
      }
      var label = cb.closest('label');
      if (label) label.style.opacity = cb.disabled ? '0.5' : '1';
      if (label) label.style.pointerEvents = cb.disabled ? 'none' : 'auto';
    });
  }

  // Form submission: build ordered hidden inputs
  var heroForm = document.getElementById('heroForm');
  if (heroForm) {
    heroForm.addEventListener('submit', function(e) {
      e.preventDefault();

      // Remove old hidden inputs
      Array.from(heroForm.querySelectorAll('input[type="hidden"][name="hero_ids[]"]')).forEach(el => el.remove());

      // Add ordered hidden inputs
      selectedOrder.forEach(function(propId) {
        var hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'hero_ids[]';
        hidden.value = propId;
        heroForm.appendChild(hidden);
      });

      heroForm.submit();
    });
  }

  // Initial update on page load
  updateSelection();

  return {
    updateSelection: updateSelection,
  };
})();

/* ──────────────────────────────────────────────────────────────────
   Delegated event listeners.
   This file replaced ~30 inline on* handlers that the Content-Security-
   Policy blocks (script-src has no 'unsafe-inline' for this page), which
   is why tab switching and the mobile drawer stopped working entirely.
   Markup now carries data-* attributes; behaviour is bound here.
   ────────────────────────────────────────────────────────────────── */
(function () {
  document.addEventListener('click', function (e) {
    // Sidebar / bottom-nav panel switching
    var panelEl = e.target.closest('[data-panel]');
    if (panelEl) {
      e.preventDefault();
      showPanel(panelEl.getAttribute('data-panel'));
      return;
    }

    // Hamburger + drawer overlay
    if (e.target.closest('[data-toggle-sidebar]')) {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // Expandable payment detail row
    var payRow = e.target.closest('[data-pay-detail]');
    if (payRow) {
      togglePayDetail(payRow.getAttribute('data-pay-detail'));
      return;
    }

    // Invoice link inside a clickable payment row
    if (e.target.closest('[data-stop-propagation]')) e.stopPropagation();
  });

  // Search / filter inputs
  var FILTERS = { props: filterProps, enquiries: filterEnquiries, payments: filterPayments };
  ['input', 'change'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      var el = e.target.closest('[data-filter]');
      if (!el) return;
      var fn = FILTERS[el.getAttribute('data-filter')];
      if (fn) fn();
    });
  });

  // File-input previews + hero picker
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-preview-img')) previewImg(t, t.getAttribute('data-preview-img'));
    if (t.hasAttribute && t.hasAttribute('data-preview-gallery')) previewGallery(t, t.getAttribute('data-preview-gallery'));
    if (t.hasAttribute && t.hasAttribute('data-hero-checkbox') && window.HeroPicker) window.HeroPicker.updateSelection();
  });

  // Destructive-action confirmations (replaces onsubmit="return confirm(...)")
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-confirm]');
    if (form && !window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
  });
})();
