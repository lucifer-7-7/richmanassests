/* RichManAssets — home page interactions */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---- LOADER ---- */
  var loaderHidden = false;
  function hideLoader() {
    if (loaderHidden) return;
    loaderHidden = true;
    var l = $('#loader');
    document.documentElement.classList.remove('loading');
    if (l) l.classList.add('done');
  }
  if (document.readyState === 'complete') setTimeout(hideLoader, 500);
  else window.addEventListener('load', function () { setTimeout(hideLoader, 500); });
  setTimeout(hideLoader, 1800);

  /* ---- LENIS smooth scroll ---- */
  function initLenis() {
    if (reduce || typeof Lenis === 'undefined') return;
    var lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
    if (window.gsap && window.ScrollTrigger) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
    }
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id.length < 2) return;
        var el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: -40 });
      });
    });
    window.__lenis = lenis;
  }

  /* ---- HERO CAROUSEL ---- */
  function initHero() {
    var track    = $('#heroTrack');
    var dotsEl   = $('#heroDots');
    if (!track) return;
    var slideEls = [].slice.call(track.querySelectorAll('.hero-slide'));
    var dotEls   = dotsEl ? [].slice.call(dotsEl.querySelectorAll('button')) : [];
    var idx = 0, timer = null;

    function show(n) {
      idx = (n + slideEls.length) % slideEls.length;
      slideEls.forEach(function (s, i) { s.classList.toggle('is-active', i === idx); });
      dotEls.forEach(function (d, i) { d.classList.toggle('on', i === idx); });
    }
    function play() { stop(); if (!reduce) timer = setInterval(function () { show(idx + 1); }, 6000); }
    function stop() { clearInterval(timer); timer = null; }

    dotEls.forEach(function (d) { d.addEventListener('click', function () { show(+d.dataset.i); play(); }); });
    var hero = $('.hero');
    if (hero) { hero.addEventListener('mouseenter', stop); hero.addEventListener('mouseleave', play); }
    play();
  }

  /* ---- SEARCH TABS ---- */
  function initSearch() {
    var tabs = $('#searchTabs');
    if (!tabs) return;
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      tabs.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      var sl = $('#sListing');
      if (sl) sl.value = b.dataset.val;
    });
  }

  /* ---- NAV ---- */
  function initNav() {
    var nav = $('#nav');
    if (!nav) return;
    var onScroll = function () { nav.classList.toggle('solid', window.scrollY > window.innerHeight * 0.7); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- ENQUIRY FORM (homepage inline) ---- */
  function initForm() {
    var lf = $('#leadForm');
    if (!lf) return;
    lf.addEventListener('submit', async function (e) {
      e.preventDefault();
      var data = new FormData(lf);
      var res = await fetch('/enquiry', { method: 'POST', body: new URLSearchParams(data) });
      if (res.ok) {
        var fb = lf.querySelector('.form-body');
        var ok = lf.querySelector('.ok-msg');
        if (fb) fb.style.display = 'none';
        if (ok) ok.style.display = 'block';
      }
    });
  }

  /* ---- GSAP DRAG SCROLL ---- */
  function initDragScroll(outerId) {
    var el = $('#' + outerId);
    if (!el) return;
    var reduce   = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    var dragging = false, startX = 0, startScroll = 0, lastX = 0, lastT = 0, vel = 0;
    var scrollTo = (typeof gsap !== 'undefined')
      ? gsap.quickTo(el, 'scrollLeft', { duration: 0.7, ease: 'power3.out' })
      : null;

    el.addEventListener('pointerdown', function (e) {
      dragging = true; startX = e.clientX; startScroll = el.scrollLeft;
      lastX = e.clientX; lastT = Date.now(); vel = 0;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
      if (scrollTo) gsap.killTweensOf(el);
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      el.scrollLeft = startScroll + (startX - e.clientX);
      var now = Date.now(), dt = now - lastT || 1;
      vel = (lastX - e.clientX) / dt;
      lastX = e.clientX; lastT = now;
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = 'grab';
      if (reduce || !scrollTo) return;
      var max = el.scrollWidth - el.clientWidth;
      scrollTo(Math.max(0, Math.min(el.scrollLeft + vel * 220, max)));
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('click', function (e) {
      if (Math.abs(el.scrollLeft - startScroll) > 4) e.stopPropagation();
    }, true);
  }

  /* ---- TABS FILTERING ---- */
  function initTabs() {
    function setupFilter(tabsId, gridId, cardSelector, dataAttr, outerId, showMoreBtnId) {
      var tabs  = $('#' + tabsId);
      var grid  = $('#' + gridId);
      var outer = outerId ? $('#' + outerId) : null;
      if (!tabs || !grid) return;
      tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        tabs.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');

        var filterVal = btn.dataset.filter || btn.dataset.sector;
        var cards = grid.querySelectorAll(cardSelector);

        cards.forEach(function (card) {
          var cardVal = card.dataset[dataAttr];
          var matches = filterVal === 'all' || cardVal === filterVal;
          card.classList.toggle('is-hidden', !matches);
        });

        if (outer) outer.scrollLeft = 0;
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      });
    }

    setupFilter('interiorTabs', 'interiorGrid', '.int-card', 'type', 'interiorOuter');
    setupFilter('bankTabs', 'bankGrid', '.bank-card', 'sector');
  }

  /* ---- HOME EMI CALCULATOR ---- */
  function initHomeEmi() {
    var amtInput = $('#slideAmount');
    var tenureInput = $('#slideTenure');
    var rateInput = $('#slideRate');
    if (!amtInput || !tenureInput || !rateInput) return;

    var amtVal = $('#slideAmtVal');
    var tenureVal = $('#slideTenureVal');
    var rateVal = $('#slideRateVal');
    
    var emiResult = $('#homeEmiVal');
    var emiTotal = $('#homeEmiTotal');
    var emiInterest = $('#homeEmiInterest');

    function fmt(n) {
      if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
      if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L';
      return '₹' + n.toLocaleString('en-IN');
    }

    function calculate() {
      var P = parseFloat(amtInput.value) || 0;
      var tenureYrs = parseFloat(tenureInput.value) || 0;
      var R = parseFloat(rateInput.value) || 0;

      amtVal.textContent = fmt(P);
      tenureVal.textContent = tenureYrs + ' Years';
      rateVal.textContent = R.toFixed(1) + '% p.a.';

      var r = R / 1200;
      var n = tenureYrs * 12;
      
      if (!P || !r || !n) return;
      var emi = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      var total = emi * n;
      var interest = total - P;

      var roundEmi = Math.round(emi);
      var emiStr = roundEmi.toLocaleString('en-IN');
      var parts = emiStr.split(',');
      var whole = parts[0];
      var dec = parts.slice(1).join(',');
      
      emiResult.innerHTML = '₹' + whole + (dec ? ',<span class="it">' + dec + '</span>' : '');
      emiTotal.textContent = fmt(Math.round(total));
      emiInterest.textContent = fmt(Math.round(interest));
    }

    [amtInput, tenureInput, rateInput].forEach(function (el) {
      el.addEventListener('input', calculate);
    });

    calculate();
  }

  function init() {
    initHero();
    initSearch();
    initNav();
    initForm();
    initTabs();
    initHomeEmi();
    initLenis();
    // drag-scroll for themed property strips + interior
    initDragScroll('saleOuter');
    initDragScroll('rentOuter');
    initDragScroll('commercialOuter');
    initDragScroll('landOuter');
    initDragScroll('interiorOuter');
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
