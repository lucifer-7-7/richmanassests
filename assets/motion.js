/* ============================================================
   RichManAssets — motion.js
   GSAP reveals + parallax (works with Lenis from home.js)
   ============================================================ */
(function () {
  function init() {
    if (!window.gsap || !window.ScrollTrigger) return; // fail-safe: .fx stay visible
    gsap.registerPlugin(ScrollTrigger);
    var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (reduce) return; // leave everything in its visible end-state

    document.documentElement.classList.add('js-fx');
    document.documentElement.classList.add('js-split');

    /* generic reveal: any .fx rises + fades as it enters, grouped into
       natural staggers by what scrolls in together */
    gsap.set('.fx', { y: 28 });
    ScrollTrigger.batch('.fx', {
      start: 'top 88%',
      onEnter: function (els) {
        gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08, overwrite: true });
      }
    });

    /* hero parallax (subtle drift as it scrolls away) */
    if (document.querySelector('.hero-track')) {
      gsap.to('.hero-track', {
        yPercent: 8, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.5 }
      });
    }

    /* category images: gentle parallax inside their frames */
    gsap.utils.toArray('.cat img').forEach(function (img) {
      gsap.fromTo(img, { yPercent: -5 }, {
        yPercent: 5, ease: 'none',
        scrollTrigger: { trigger: img.closest('.cat'), start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    /* WHY headline: word-by-word mask rise */
    if (document.querySelector('.why-title .wi')) {
      gsap.fromTo('.why-title .wi',
        { yPercent: 110, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.06,
          scrollTrigger: { trigger: '.why-sec', start: 'top 74%' } });
    }

    /* count-up on the why index numbers */
    gsap.utils.toArray('.why-idx').forEach(function (el) {
      var target = parseInt(el.textContent, 10);
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: 1.1, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
        onUpdate: function () { el.textContent = String(Math.round(obj.v)).padStart(2, '0'); }
      });
    });

    ScrollTrigger.refresh();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
