/* ============================================================
   RichManAssets — home.js
   Loader · Lenis smooth scroll · hero product carousel ·
   marketplace data rendering
   ============================================================ */
(function () {
  var RMA = window.RMA || {};
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---------------- LOADER ---------------- */
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
  setTimeout(hideLoader, 1800); // hard cap so the page never stays hidden

  /* ---------------- LENIS smooth scroll ---------------- */
  function initLenis() {
    if (reduce || typeof Lenis === 'undefined') return null;
    var lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
    if (window.gsap && window.ScrollTrigger) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
    }
    // smooth in-page anchors
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
    return lenis;
  }

  /* ---------------- HERO CAROUSEL ---------------- */
  function buildHero() {
    var track = $('#heroTrack');
    if (!track || !RMA.HOMES) return;
    var ids = ['mermaid', 'kopparige', 'samudra', 'tara', 'honeyvale', 'ikigai'];
    var slides = ids.map(function (id) { return RMA.HOMES.find(function (h) { return h.id === id; }); })
      .filter(Boolean);

    function badge(p) { return p.listing === 'sale' ? 'For sale' : p.listing === 'rent' ? 'For rent' : 'For lease'; }
    var pin = RMA.svg ? RMA.svg('pin', 'pin') : '';

    track.innerHTML = slides.map(function (p, i) {
      var detail = p.hasImg ? 'properties/' + p.id + '.html' : 'contact.html?ref=' + p.id;
      var heroSrc = (RMA.IMGS && RMA.IMGS[p.id+'-hero']) ? RMA.IMGS[p.id+'-hero'] : 'assets/img/'+p.id+'-hero.jpg';
      return '<div class="hero-slide' + (i === 0 ? ' is-active' : '') + '">' +
        '<div class="hero-media"><img src="' + heroSrc + '" alt="' + p.name + ', ' + p.loc + '"' + (i === 0 ? '' : ' loading="lazy"') + ' onerror="this.src=\'assets/img/site-hero.jpg\'"' + '></div>' +
        '<div class="hero-grad"></div>' +
        '<div class="hero-ui"><div class="wrap hero-ui-in">' +
          '<div class="hero-meta">' +
            '<div class="hero-eyebrow"><span class="ln"></span>Featured &middot; ' + badge(p) + '</div>' +
            '<h1 class="hero-name">' + p.name + '</h1>' +
            '<div class="hero-loc">' + pin + ' ' + p.loc + ' <span class="sep"></span> ' + p.type + ' <span class="sep"></span> ' + p.beds + ' beds</div>' +
          '</div>' +
          '<div class="hero-side">' +
            '<div class="hero-price">' + p.price + (p.note ? '<small> ' + p.note + '</small>' : '') + '</div>' +
            '<a class="hero-view" href="' + detail + '">View home <span class="arr">&rarr;</span></a>' +
          '</div>' +
        '</div></div>' +
      '</div>';
    }).join('');

    // ambient progress dots (indicative)
    var dotsEl = $('#heroDots');
    if (dotsEl) {
      dotsEl.innerHTML = slides.map(function (p, i) {
        return '<button data-i="' + i + '" class="' + (i === 0 ? 'on' : '') + '" aria-label="Show ' + p.name + '"></button>';
      }).join('');
    }

    var slideEls = [].slice.call(track.querySelectorAll('.hero-slide'));
    var dotEls = dotsEl ? [].slice.call(dotsEl.querySelectorAll('button')) : [];
    var DUR = 6;
    var idx = 0, timer = null;

    function show(n) {
      idx = (n + slideEls.length) % slideEls.length;
      slideEls.forEach(function (s, i) { s.classList.toggle('is-active', i === idx); });
      dotEls.forEach(function (d, i) { d.classList.toggle('on', i === idx); });
    }
    function next() { show(idx + 1); }
    function play() { stop(); if (!reduce) timer = setInterval(next, DUR * 1000); }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    function go(n) { show(n); play(); }

    // dots are gentle controls (optional), pause on hover
    dotEls.forEach(function (d) { d.addEventListener('click', function () { go(+d.dataset.i); }); });
    var hero = $('.hero');
    if (hero) {
      hero.addEventListener('mouseenter', stop);
      hero.addEventListener('mouseleave', play);
    }

    play();
  }

  /* ---------------- MARKETPLACE DATA ---------------- */
  function renderData() {
    // categories
    var cat = $('#catGrid');
    if (cat && RMA.CATEGORIES) {
      cat.innerHTML = RMA.CATEGORIES.map(function (c) {
        var catSrc = c.imgUrl || ('assets/img/' + c.img + '.jpg');
        return '<a class="cat fx" href="properties.html?' + c.q + '">' +
          '<img src="' + catSrc + '" alt="' + c.title + '" loading="lazy" onerror="this.src=\'assets/img/'+c.img+'.jpg\'">' +
          '<span class="cat-arr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span>' +
          '<span class="cat-txt"><h3>' + c.title + '</h3><span class="n">' + c.note + '</span></span>' +
        '</a>';
      }).join('');
    }
    // featured
    var feat = $('#featGrid');
    if (feat && RMA.HOMES && RMA.listingCard) {
      var list = RMA.HOMES.filter(function (h) { return h.hasImg; }).slice(0, 8);
      feat.innerHTML = list.map(RMA.listingCard).join('');
      [].slice.call(feat.querySelectorAll('.plist')).forEach(function (el) { el.classList.add('fx'); });
      // GSAP momentum drag-to-scroll
      var outer = $('#featScrollOuter');
      if (outer) {
        var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
        var dragging=false, startX=0, startScroll=0, lastX=0, lastT=0, vel=0;
        var scrollTo = (typeof gsap !== 'undefined')
          ? gsap.quickTo(outer, 'scrollLeft', {duration:0.7, ease:'power3.out'})
          : null;
        outer.addEventListener('pointerdown',function(e){
          dragging=true;startX=e.clientX;startScroll=outer.scrollLeft;
          lastX=e.clientX;lastT=Date.now();vel=0;
          outer.setPointerCapture(e.pointerId);outer.style.cursor='grabbing';
          if(scrollTo) gsap.killTweensOf(outer);
        });
        outer.addEventListener('pointermove',function(e){
          if(!dragging)return;
          outer.scrollLeft=startScroll+(startX-e.clientX);
          var now=Date.now(),dt=now-lastT||1;
          vel=(lastX-e.clientX)/dt;lastX=e.clientX;lastT=now;
        });
        function endFeatDrag(){
          if(!dragging)return;dragging=false;outer.style.cursor='grab';
          if(reduce||!scrollTo)return;
          var target=Math.max(0,Math.min(outer.scrollLeft+vel*220,outer.scrollWidth-outer.clientWidth));
          scrollTo(target);
        }
        outer.addEventListener('pointerup',endFeatDrag);
        outer.addEventListener('pointercancel',endFeatDrag);
      }
    }
    // services
    var svc = $('#svcGrid');
    if (svc && RMA.SERVICES) {
      svc.innerHTML = RMA.SERVICES.map(function (s) {
        var href = s.id === 'loans' ? 'loans.html' : 'services.html#' + s.id;
        return '<a class="svc-tile fx" href="' + href + '"><span class="n">' + s.n + '</span><span class="ic">' + RMA.svg(s.icon) + '</span><h3>' + s.title + '</h3><p>' + s.desc + '</p></a>';
      }).join('');
    }
    // stars
    var star = '<svg viewBox="0 0 16 16" fill="currentColor" stroke="none"><path d="M8 1l2 4.2 4.6.6-3.4 3.2.9 4.6L8 11.4 3.9 13.6l.9-4.6L1.4 5.8 6 5.2z"/></svg>';
    ['st1', 'st2', 'st3'].forEach(function (id) { var e = $('#' + id); if (e) e.innerHTML = star.repeat(5); });
  }

  /* ---------------- LINKS + FORMS ---------------- */
  function wireUp() {
    var tel = 'tel:' + (RMA.PHONE || '');
    var wa = RMA.waLink ? RMA.waLink("Hi RichManAssets, I'd like to know more about your properties and services.") : '#';
    [['#floatWa', wa], ['#waBtn', wa], ['#floatCall', tel], ['#callBtn', tel]].forEach(function (p) {
      var e = $(p[0]); if (e) e.href = p[1];
    });
    var sv = $('#spotView'); if (sv) sv.href = 'contact.html?ref=shanta';
    var sw = $('#spotWa'); if (sw) { sw.href = RMA.waLink ? RMA.waLink('Hi RichManAssets, I would like to book a site visit for Shanta Serendipity Apartments.') : '#'; sw.target = '_blank'; sw.rel = 'noopener'; }

    // search tabs
    var tabs = $('#searchTabs');
    if (tabs) tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      tabs.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      var sl = $('#sListing'); if (sl) sl.value = b.dataset.val;
    });

    // lead form
    var lf = $('#leadForm');
    if (lf) lf.addEventListener('submit', function (e) {
      e.preventDefault();
      lf.classList.add('sent');
      var ok = lf.querySelector('.ok-msg'); if (ok) ok.classList.add('show');
    });

    // nav solid
    var nav = $('#nav');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('solid', window.scrollY > window.innerHeight * 0.7); };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  function init() {
    renderData();
    buildHero();
    wireUp();
    initLenis();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
