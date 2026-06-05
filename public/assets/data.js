/* ============ RichManAssets — shared data + renderers ============ */
window.RMA = (function () {

  const SERVICES = [
    { id:"buy-sell",  n:"01", title:"Buying & Selling",      desc:"Title-clear villas, houses, apartments and plots across the coast and the Ghats.", icon:"home" },
    { id:"rentals",   n:"02", title:"Rentals & Lease",       desc:"Vetted homes, offices, retail and warehousing, with agreements drafted in-house.",  icon:"key" },
    { id:"loans",     n:"03", title:"Home & Project Loans",  desc:"Banking tie-ups, quick eligibility and the lowest EMI we can find you.",           icon:"coins" },
    { id:"construct", n:"04", title:"Construction & Develop.",desc:"Turnkey residential, commercial and industrial builds, from foundation to handover.", icon:"ruler" },
    { id:"interior",  n:"05", title:"Interior Design",        desc:"Residential and commercial interiors with 3D visualisation and fixed packages.",     icon:"sofa" },
    { id:"legal",     n:"06", title:"Legal Services",         desc:"Title checks, due diligence and registration, empaneled with major banks.",         icon:"scale" },
    { id:"manage",    n:"07", title:"Property Management",    desc:"Tenant verification, rent collection and upkeep while you sit back.",              icon:"shield" },
    { id:"agri",      n:"08", title:"Agricultural & Yield",   desc:"Plantation, orchard and revenue-generating land with verified RTC records.",        icon:"leaf" },
  ];

  // marketplace browse categories (image-led)
  const CATEGORIES = [
    { id:"villas",     title:"Villas & Homes",     note:"Coastal & hillside living", img:"mermaid-card",   q:"type=Villa" },
    { id:"plots",      title:"Plots & Land",       note:"Residential & commercial",  img:"kopparige-card", q:"type=Plot" },
    { id:"commercial", title:"Commercial",         note:"Offices, retail, venues",   img:"jumeirah-card",  q:"type=Commercial" },
    { id:"agri",       title:"Agricultural",       note:"Plantation & yield land",   img:"honeyvale-card", q:"type=Agricultural" },
    { id:"rentals",    title:"Rentals",            note:"Live in, move quickly",     img:"sashihitlu-card",q:"listing=rent" },
    { id:"builder",    title:"Builder Projects",   note:"New launches",             img:"samudra-card",   q:"type=Apartment" },
  ];

  // listing: 'sale' | 'rent' | 'lease'
  const HOMES = [
    {id:"mermaid",   name:"Villa Mermaid",        loc:"Mulki Backwaters",    area:"Mulki",       type:"Villa",       listing:"sale", price:"₹7.5 Cr", priceVal:75000000,  beds:4, baths:4, sqft:"4,200", hasImg:true, featured:true},
    {id:"kopparige", name:"Kopparige Hills",      loc:"Sakleshpur Valley",   area:"Sakleshpur",  type:"Estate",      listing:"sale", price:"₹9.2 Cr", priceVal:92000000,  beds:5, baths:5, sqft:"3 acres", hasImg:true, featured:true},
    {id:"samudra",   name:"Samudra",              loc:"Sasihithlu Beach",    area:"Sasihithlu",  type:"Villa",       listing:"sale", price:"₹8.1 Cr", priceVal:81000000,  beds:5, baths:5, sqft:"5,000", hasImg:true, featured:true},
    {id:"tara",      name:"Tara Beach House",     loc:"Someshwara",          area:"Someshwara",  type:"Villa",       listing:"sale", price:"₹6.9 Cr", priceVal:69000000,  beds:4, baths:4, sqft:"3,800", hasImg:true, featured:true},
    {id:"tatasth",   name:"Tatasth",              loc:"Yermal Beach",        area:"Yermal",      type:"House",       listing:"sale", price:"₹6.4 Cr", priceVal:64000000,  beds:5, baths:5, sqft:"4,500", hasImg:true},
    {id:"honeyvale", name:"Honeyvale",            loc:"Chikmagalur Estate",  area:"Chikmagalur", type:"Estate",      listing:"sale", price:"₹5.6 Cr", priceVal:56000000,  beds:4, baths:4, sqft:"6 acres", hasImg:true},
    {id:"backwater", name:"The Backwater House",  loc:"Mulki",               area:"Mulki",       type:"Villa",       listing:"sale", price:"₹5.2 Cr", priceVal:52000000,  beds:4, baths:4, sqft:"3,600", hasImg:true},
    {id:"girija",    name:"Girija Villa",         loc:"Surathkal",           area:"Surathkal",   type:"Villa",       listing:"sale", price:"₹4.7 Cr", priceVal:47000000,  beds:4, baths:4, sqft:"3,400", hasImg:true},
    {id:"ikigai",    name:"Ikigai",               loc:"Kapu Coast",          area:"Kapu",        type:"Villa",       listing:"sale", price:"₹3.9 Cr", priceVal:39000000,  beds:3, baths:3, sqft:"2,400", hasImg:true},
    {id:"sereno",    name:"Casa Sereno",          loc:"Manipal",             area:"Manipal",     type:"House",       listing:"sale", price:"₹2.95 Cr",priceVal:29500000,  beds:3, baths:3, sqft:"2,200", hasImg:true},
    {id:"sashihitlu",name:"Sashihitlu Sands",     loc:"Sasihithlu",          area:"Sasihithlu",  type:"House",       listing:"rent", price:"₹1.85 L", priceVal:185000,    beds:4, baths:4, sqft:"3,000", hasImg:true, note:"/month"},
    {id:"sandranch", name:"Sand Ranch",           loc:"Maravanthe",          area:"Maravanthe",  type:"House",       listing:"rent", price:"₹1.25 L", priceVal:125000,    beds:4, baths:3, sqft:"2,600", hasImg:true, note:"/month"},
    {id:"jumeirah",  name:"The Lawn House",       loc:"Padubidri",           area:"Padubidri",   type:"Commercial",  listing:"lease",price:"₹3.5 L",  priceVal:350000,    beds:6, baths:6, sqft:"30,000", hasImg:true, note:"/month", subtype:"Event venue"},
    // breadth (awaiting photos)
    {id:"shanta",    name:"Shanta Serendipity Apartments", loc:"Mangaluru", area:"Kadri",  type:"Apartment", listing:"sale", price:"₹62 L", priceVal:6200000, beds:"2 to 3", baths:"2 to 3", sqft:"1,150+", hasImg:false, featured:true, badgeTxt:"Now selling", subtype:"Builder project"},
    {id:"office-hampankatta", name:"Grade-A Office Floor", loc:"Hampankatta, Mangaluru", area:"Hampankatta", type:"Commercial", listing:"rent", price:"₹1.2 L", priceVal:120000, beds:"—", baths:"2", sqft:"3,400", hasImg:false, note:"/month", subtype:"Office"},
    {id:"plot-baikampady", name:"Industrial Plot, Baikampady", loc:"Baikampady KIADB", area:"Baikampady", type:"Plot", listing:"lease", price:"₹45", priceVal:45, beds:"—", baths:"—", sqft:"40,000", hasImg:false, note:"/sq ft · mo", subtype:"Industrial"},
    {id:"agri-bantwal", name:"Areca Plantation Land", loc:"Bantwal", area:"Bantwal", type:"Agricultural", listing:"sale", price:"₹38 L", priceVal:3800000, beds:"—", baths:"—", sqft:"per acre", hasImg:false, subtype:"Plantation"},
  ];

  const ICONS = {
    home:'<path d="M4 13 16 4l12 9M7 11v15h6v-9h6v9h6V11"/>',
    key:'<circle cx="9" cy="11" r="5"/><path d="M13 13l13 13M22 22l3-3M25 25l3-3"/>',
    coins:'<ellipse cx="11" cy="8" rx="7" ry="3.2"/><path d="M4 8v6c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2V8"/><path d="M14 17v5c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2v-6c0-1.8-3.1-3.2-7-3.2"/>',
    ruler:'<rect x="4" y="11" width="24" height="10" rx="1" transform="rotate(45 16 16)"/><path d="M13 13l2 2M16 10l2 2M19 13l2 2"/>',
    sofa:'<path d="M5 16v-3a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v3"/><path d="M3 16a2 2 0 0 1 2 2v4h22v-4a2 2 0 0 1 2-2 2 2 0 0 1 2 2v6H1v-6a2 2 0 0 1 2-2zM8 16v-4h16v4"/>',
    scale:'<path d="M16 4v24M8 28h16M16 7l-9 3 9-3 9 3M7 10l-4 8a4 4 0 0 0 8 0zM25 10l-4 8a4 4 0 0 0 8 0z"/>',
    shield:'<path d="M16 3 5 7v8c0 7 5 12 11 14 6-2 11-7 11-14V7z"/><path d="M11 16l4 4 7-8"/>',
    leaf:'<path d="M6 26C6 14 16 6 27 6c0 11-8 21-20 21-1 0-1-1-1-1z"/><path d="M6 26 27 6M14 18c2-2 5-3 8-3"/>',
    pin:'<path d="M8 6.5C8 3.5 4.5 3.5 4.5 6.5 4.5 9 8 11 8 11s3.5-2 3.5-4.5C11.5 3.5 8 3.5 8 6.5z"/><circle cx="8" cy="6.4" r="1.2"/>',
    bed:'<path d="M2 8v9M2 17h13M2 12h13a0 0 0 0 1 0 0v5M5 8h7a3 3 0 0 1 3 3"/>',
    bath:'<path d="M2 9V4a2 2 0 0 1 4 0M2 9h13v3a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3zM4 15l-1 2M13 15l1 2"/>',
    area:'<rect x="2" y="2" width="13" height="13" rx="1"/><path d="M2 6h3M2 11h3M6 2v3M11 2v3"/>',
    wa:'<path d="M16 3C9 3 3.5 8.5 3.5 15.5c0 2.4.7 4.6 1.8 6.5L3 29l7.2-2.2c1.8 1 3.8 1.5 5.8 1.5 7 0 12.5-5.5 12.5-12.5S23 3 16 3z" fill="currentColor" stroke="none"/><path d="M11.2 9.3c-.3-.6-.5-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.4 3.8 5.9 5.2 2.9 1.1 3.5.9 4.2.9.7-.1 2.1-.9 2.4-1.7.3-.8.3-1.6.2-1.7-.1-.2-.3-.2-.7-.4-.3-.2-2.1-1-2.4-1.1-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.4-.2.2-.4.2-.7.1-.4-.2-1.6-.6-3-1.8-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.5.2-.7.2-.2.3-.4.5-.6.2-.2.2-.3.3-.6.1-.2 0-.4 0-.6 0-.2-.7-2-1-2.7z" fill="#fff" stroke="none"/>',
    phone:'<path d="M6 3h5l2 6-3 2c1 3 3 5 6 6l2-3 6 2v5c0 1-1 2-2 2C13 26 6 19 6 6c0-1 0-3 0-3z" fill="currentColor" stroke="none"/>',
    heart:'<path d="M8 14S2 10 2 5.8C2 3.5 3.8 2 5.8 2 7 2 8 3 8 3s1-1 2.2-1C12.2 2 14 3.5 14 5.8 14 10 8 14 8 14z"/>',
  };

  const PHONE = "+919876543210";
  const PHONE_DISP = "+91 98765 43210";
  const WA = "919876543210";

  function svg(name, cls){ return `<svg class="${cls||''}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`; }
  function badgeClass(l){ return l; }
  function badgeText(p){ if(p.badgeTxt) return p.badgeTxt; return p.listing==='sale'?'For Sale':p.listing==='rent'?'For Rent':'For Lease'; }
  function waLink(text){ return `https://wa.me/${WA}?text=${encodeURIComponent(text)}`; }

  function listingCard(p){
    const img = p.hasImg
      ? `<img src="assets/img/${p.id}-card.jpg" alt="${p.name}, ${p.loc}" loading="lazy">`
      : `<div class="ph-placeholder"><span>Photos on request</span></div>`;
    const detail = p.hasImg ? `properties/${p.id}.html` : `contact.html?ref=${p.id}`;
    const meta = `
      <span title="Bedrooms">${svg('bed')} ${p.beds}</span>
      <span title="Bathrooms">${svg('bath')} ${p.baths}</span>
      <span title="Area">${svg('area')} ${p.sqft}</span>`;
    return `<article class="plist" data-listing="${p.listing}" data-type="${p.type}" data-area="${p.area}" data-price="${p.priceVal}">
      <div class="ph">
        ${img}
        <span class="badge ${badgeClass(p.listing)}">${badgeText(p)}</span>
        <button class="fav" aria-label="Save">${svg('heart')}</button>
      </div>
      <div class="body">
        <div class="price">${p.price}${p.note?`<small>${p.note}</small>`:''}</div>
        <h3>${p.name}</h3>
        <div class="loc">${svg('pin','pin')} ${p.loc} · ${p.type}${p.subtype?` · ${p.subtype}`:''}</div>
        <div class="meta">${meta}</div>
        <div class="cta">
          <a class="v" href="${detail}">${p.hasImg?'View home':'Enquire'}</a>
          <a class="w" href="${waLink('Hi RichManAssets, I am interested in '+p.name+' ('+p.loc+').')}" aria-label="WhatsApp" target="_blank" rel="noopener">${svg('wa')}</a>
        </div>
      </div>
    </article>`;
  }

  return { SERVICES, CATEGORIES, HOMES, ICONS, svg, listingCard, waLink, PHONE, PHONE_DISP, WA };
})();
