'use strict';

// Seed data migrated from assets/data.js
// Run once on first boot via db.js initDB()

const HOMES = [
  {
    id:'mermaid', name:'Villa Mermaid', loc:'Mulki Backwaters', area:'Mulki',
    type:'Villa', listing:'sale', price:'₹7.5 Cr', price_val:75000000,
    beds:'4', baths:'4', sqft:'4,200', featured:1, has_img:1,
    img_card:'assets/img/mermaid-card.jpg', img_hero:'assets/img/mermaid-hero.jpg',
    story_kicker:'Where the river bends',
    story_heading:'A house that leans out over the water.',
    story_body:'Villa Mermaid sits right on the Mulki backwater, with cantilevered rooms that float out toward the palms and the river beyond. Mornings are still and silver; by afternoon the pool throws light back up onto the white ceilings.\n\nInside it\'s open and unfussy — glass on three sides, laterite walls left honest, and a living room that simply pours out onto the pool deck. The kind of home where the doors stay open and nobody\'s quite sure where outside ends.\n\nA short, easy drive from Mangaluru, yet it feels like another, slower country.',
    amenities:'Private swimming pool|Direct backwater frontage|Floor-to-ceiling glazing|Open-plan living & dining|Cantilevered bedroom suites|Landscaped riverside lawn|Covered car parking|Power backup',
    setting_heading:'Mulki Backwaters',
    setting_body:'The backwaters around Mulki are flat, green and quiet — fishing boats, mangroves, and a sandbar where the river meets the sea ten minutes away.\n\nSurathkal and the highway are close enough that work stays reachable; the water makes sure it doesn\'t follow you home.',
    setting_pills:'Backwater frontage|20 min to Mangaluru|Sandbar nearby',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹5,53,237',
    next_id:'kopparige', sort_order:1, subtype:'Villas'
  },
  {
    id:'kopparige', name:'Kopparige Hills', loc:'Sakleshpur Valley', area:'Sakleshpur',
    type:'Estate', listing:'sale', price:'₹9.2 Cr', price_val:92000000,
    beds:'5', baths:'5', sqft:'3 acres', featured:1, has_img:1,
    img_card:'assets/img/kopparige-card.jpg', img_hero:'assets/img/kopparige-hero.jpg',
    story_kicker:'High in the Ghats',
    story_heading:'An estate wrapped in coffee and mist.',
    story_body:'Kopparige Hills occupies a commanding ridge in the Sakleshpur valley, where the Western Ghats fold into a mosaic of coffee, pepper and silver oak.\n\nThe main house sits at the highest point of the land, looking west toward the Arabian Sea on clear winter mornings. The air smells like coffee blossom from September to November and woodsmoke in January.\n\nThis is a working estate first, a retreat second — a rare thing to own and a rarer thing to find.',
    amenities:'Three-acre working estate|Main house + staff quarters|Coffee and pepper cultivation|Ridge-top views|Forest perimeter|Natural spring on plot|Generator and borewell|All-weather road access',
    setting_heading:'Sakleshpur, Hassan District',
    setting_body:'Sakleshpur is the coolest town in Karnataka south of Coorg — at 900m the temperature rarely exceeds 28°C. The valley has become one of Karnataka\'s more sought-after second-home locations.\n\nHassan is 30 km away; Bangalore is a comfortable 4-hour drive.',
    setting_pills:'900m elevation|Coffee country|4 hr from Bangalore',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹6,78,753',
    next_id:'samudra', sort_order:2, subtype:'Villas'
  },
  {
    id:'samudra', name:'Samudra', loc:'Sasihithlu Beach', area:'Sasihithlu',
    type:'Villa', listing:'sale', price:'₹8.1 Cr', price_val:81000000,
    beds:'5', baths:'5', sqft:'5,000', featured:1, has_img:1,
    img_card:'assets/img/samudra-card.jpg', img_hero:'assets/img/samudra-hero.jpg',
    story_kicker:'Face to face with the sea',
    story_heading:'A beachfront villa built to outlast the years.',
    story_body:'Samudra stands at the edge of Sasihithlu\'s broad sandy beach, close enough that salt spray catches the railings on a rough monsoon day. The house was built with this in mind — laterite, teak and steel, each chosen for how they age beside the sea.\n\nFive bedrooms face either the water or the palm garden. The ground floor opens completely to the outdoor dining terrace; the pool runs parallel to the shoreline so you can watch the fishermen while you swim.\n\nThis is not a weekend house. It is a main house, built with intent.',
    amenities:'Beachfront plot|Infinity-edge pool|5 ensuite bedrooms|Full outdoor kitchen|Palm garden|Double garage|Rooftop sundeck|24hr security',
    setting_heading:'Sasihithlu, Dakshina Kannada',
    setting_body:'Sasihithlu is a long arc of beach north of Mangaluru, relatively quiet because the road dead-ends at the river. The fishing community keeps the beach clean and the pace slow.\n\nNHSB1 and Surathkal industrial corridor are 15 minutes south.',
    setting_pills:'Beachfront|Quiet village|15 min to Surathkal',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹5,97,337',
    next_id:'tara', sort_order:3, subtype:'Villas'
  },
  {
    id:'tara', name:'Tara Beach House', loc:'Someshwara', area:'Someshwara',
    type:'Villa', listing:'sale', price:'₹6.9 Cr', price_val:69000000,
    beds:'4', baths:'4', sqft:'3,800', featured:1, has_img:1,
    img_card:'assets/img/tara-card.jpg', img_hero:'assets/img/tara-hero.jpg',
    story_kicker:'Stone and sea',
    story_heading:'Where the temple beach meets the surf.',
    story_body:'Someshwara is the kind of beach that stays local. The fishing hamlet and the ancient Someshwara temple keep the strip quiet, and the sand runs wide and clean from November to March.\n\nTara sits within a short walk of the waterline, set behind a laterite wall just high enough to cut the wind without hiding the view. Four bedrooms, a pool oriented to catch the afternoon sun, and interiors that let the house feel like it has always been here.\n\nA rare find at this price on a beach this close to Mangaluru.',
    amenities:'Walk-to-beach access|Swimming pool|Laterite perimeter wall|4 bedroom suites|Traditional Mangalorean tilework|Spacious verandah|Mango and coconut grove|24hr power backup',
    setting_heading:'Someshwara, Udupi District',
    setting_body:'The beach at Someshwara is anchored by a 13th-century Shiva temple that keeps the atmosphere traditional and unhurried. NH-66 is 5 km inland; Mangaluru city centre is 18 km south.\n\nThe stretch between Someshwara and Maravanthe to the north is the most scenic coastal corridor in Dakshina Kannada.',
    setting_pills:'Temple beach|18 min to Mangaluru|November–March surf',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹5,08,763',
    next_id:'tatasth', sort_order:4, subtype:'Villas'
  },
  {
    id:'tatasth', name:'Tatasth', loc:'Yermal Beach', area:'Yermal',
    type:'House', listing:'sale', price:'₹6.4 Cr', price_val:64000000,
    beds:'5', baths:'5', sqft:'4,500', has_img:1,
    img_card:'assets/img/tatasth-card.jpg', img_hero:'assets/img/tatasth-hero.jpg',
    story_kicker:'An untouched strip of coast',
    story_heading:'Yermal — the beach that time forgot.',
    story_body:'Tatasth occupies a generous coastal plot at Yermal, a stretch of beach between Udupi and Kundapur that has stayed largely undeveloped. The plot is wide enough that the neighbours don\'t matter.\n\nFive bedrooms across two floors, with the primary suite taking the full top floor and opening onto a private terrace that runs the width of the house. Below, a pool that seems to pour toward the horizon at high tide.\n\nYermal has no hotels. That is the point.',
    amenities:'Large beachfront plot|Private pool|Top-floor primary suite with terrace|5 ensuite bedrooms|Open-plan ground floor|Covered parking for 3 cars|Borewell and tank|Unobstructed beach frontage',
    setting_heading:'Yermal, Udupi District',
    setting_body:'Yermal Beach is 12 km south of Kundapur and 8 km north of Byndoor. It is one of the few long beaches on the Karnataka coast that has no tourist infrastructure — no shacks, no resorts.\n\nSH-62 runs 4 km inland; Udupi city is 45 km south.',
    setting_pills:'No hotels|Pristine beach|NH-66 proximity',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹4,72,026',
    next_id:'honeyvale', sort_order:5, subtype:'Independent house'
  },
  {
    id:'honeyvale', name:'Honeyvale', loc:'Chikmagalur Estate', area:'Chikmagalur',
    type:'Estate', listing:'sale', price:'₹5.6 Cr', price_val:56000000,
    beds:'4', baths:'4', sqft:'6 acres', has_img:1,
    img_card:'assets/img/honeyvale-card.jpg', img_hero:'assets/img/honeyvale-hero.jpg',
    story_kicker:'Karnataka\'s coffee country',
    story_heading:'Six acres of estate living in Chikmagalur.',
    story_body:'Honeyvale is a six-acre coffee and areca estate in the hills above Chikmagalur, with a four-bedroom bungalow that has been extended and restored without losing its original character.\n\nThe estate produces commercial yields — the sale includes standing crops and farm equipment. A full-time caretaker family handles day-to-day operations.\n\nThe hills here are green nine months of the year. In December the valley fills with mist and the estate feels entirely removed from the rest of Karnataka.',
    amenities:'6-acre working estate|Coffee and areca plantation|Restored colonial bungalow|4 bedrooms|Staff quarters|Farm equipment included|Borewell and rainwater harvesting|Forest-edge location',
    setting_heading:'Chikmagalur, Karnataka',
    setting_body:'Chikmagalur is one of India\'s most established hill destinations — at 1,000m, cool and lush. The town has good connectivity to Bangalore (5 hrs) and Mangaluru (2.5 hrs).\n\nThe district is the origin of Indian filter coffee, a fact the locals mention often and with reason.',
    setting_pills:'1,000m elevation|Working estate|5 hr from Bangalore',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹4,12,701',
    next_id:'backwater', sort_order:6, subtype:'Independent house'
  },
  {
    id:'backwater', name:'The Backwater House', loc:'Mulki', area:'Mulki',
    type:'Villa', listing:'sale', price:'₹5.2 Cr', price_val:52000000,
    beds:'4', baths:'4', sqft:'3,600', has_img:1,
    img_card:'assets/img/backwater-hero.jpg', img_hero:'assets/img/backwater-hero.jpg',
    story_kicker:'Quiet on the water',
    story_heading:'A second home that feels like a first one.',
    story_body:'The Backwater House sits on a calm channel of the Mulki river, set back just enough from the main backwater to give it privacy without losing the view.\n\nThe design is clean and open — three living areas that stack vertically, each one facing the water. The ground floor opens flat onto a deck that runs to the channel edge. No pool, because none is needed.\n\nBought by people who already have a city house and want something that asks nothing of them.',
    amenities:'Backwater channel frontage|Three-level open-plan design|Ground-floor deck to water|4 ensuite bedrooms|Boat jetty|Mango trees on plot|Borewell|20 min to Mangaluru city',
    setting_heading:'Mulki, Dakshina Kannada',
    setting_body:'Mulki is the first town north of Mangaluru on NH-66. The backwaters here are calm and navigable — a contrast to the open beach just a few kilometres west.\n\nThe stretch between Mulki and Padubidri has become a quiet second-home corridor for Mangaluru and Bangalore buyers.',
    setting_pills:'20 min to Mangaluru|Navigable channel|Quiet corridor',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹3,83,312',
    next_id:'girija', sort_order:7, subtype:'Villas'
  },
  {
    id:'girija', name:'Girija Villa', loc:'Surathkal', area:'Surathkal',
    type:'Villa', listing:'sale', price:'₹4.7 Cr', price_val:47000000,
    beds:'4', baths:'4', sqft:'3,400', has_img:1,
    img_card:'assets/img/girija-card.jpg', img_hero:'assets/img/girija-hero.jpg',
    story_kicker:'Surathkal\'s seafront',
    story_heading:'A villa by the lighthouse.',
    story_body:'Girija Villa stands a few hundred metres from the Surathkal lighthouse, in a neighbourhood that has stayed calm despite the industrial activity of the port further south.\n\nFour bedrooms, a terrace that looks over the sea, and a ground floor plan that was clearly designed for a family that entertains. The kitchen is large; the dining room flows outside; the garden is planted and maintained.\n\nSurathkal NITK campus and the industrial corridor make this equally suited as a primary residence or a long-let investment.',
    amenities:'Near Surathkal lighthouse|Sea-view terrace|4 ensuite bedrooms|Large entertaining kitchen|Landscaped garden|Covered 2-car garage|Inverter backup|Gated compound',
    setting_heading:'Surathkal, Mangaluru',
    setting_body:'Surathkal is the northern tip of Mangaluru city — home to NITK, one of India\'s top engineering colleges, and the NMPT port zone. Rental demand from faculty and senior port staff is consistently high.\n\nMangaluru airport is 35 minutes south; the city centre is 18 km.',
    setting_pills:'NITK proximity|High rental demand|35 min to airport',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹3,46,394',
    next_id:'ikigai', sort_order:8, subtype:'Villas'
  },
  {
    id:'ikigai', name:'Ikigai', loc:'Kapu Coast', area:'Kapu',
    type:'Villa', listing:'sale', price:'₹3.9 Cr', price_val:39000000,
    beds:'3', baths:'3', sqft:'2,400', has_img:1,
    img_card:'assets/img/ikigai-card.jpg', img_hero:'assets/img/ikigai-hero.jpg',
    story_kicker:'Kapu\'s quiet coast',
    story_heading:'Small, precise, and exactly enough.',
    story_body:'Ikigai is a three-bedroom villa designed with the discipline that larger homes often lack. Every room earns its square footage. The courtyard at the centre keeps the house cool without air-conditioning for most of the year.\n\nA five-minute walk leads to Kapu beach, one of the coast\'s cleaner stretches, anchored at one end by a Victorian lighthouse that has become something of a symbol for the town.\n\nAt ₹3.9 Cr on the Kapu coast, this is straightforwardly good value.',
    amenities:'Courtyard-plan design|Natural ventilation|3 ensuite bedrooms|Private garden|5 min walk to beach|Kapu lighthouse views|Borewell|Covered parking',
    setting_heading:'Kapu, Udupi District',
    setting_body:'Kapu is 12 km north of Udupi on NH-66. The town is best known for its red-and-white lighthouse and a beach that has enough footfall to feel alive, but not enough to feel crowded.\n\nUdupi city — home to good schools, hospitals and the famous Krishna temple — is a comfortable 20-minute drive.',
    setting_pills:'Lighthouse views|20 min to Udupi|Clean beach',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹2,87,544',
    next_id:'sereno', sort_order:9, subtype:'Villas'
  },
  {
    id:'sereno', name:'Casa Sereno', loc:'Manipal', area:'Manipal',
    type:'House', listing:'sale', price:'₹2.95 Cr', price_val:29500000,
    beds:'3', baths:'3', sqft:'2,200', has_img:1,
    img_card:'assets/img/sereno-hero.jpg', img_hero:'assets/img/sereno-hero.jpg',
    story_kicker:'Manipal\'s university town',
    story_heading:'A family home in one of Karnataka\'s best addresses.',
    story_body:'Casa Sereno sits in a quiet lane in Manipal, five minutes from the Manipal University campus. The house is built for a family — three bedrooms, a study, a garden, and a floor plan that keeps the living spaces away from the street.\n\nManipals rental market is one of the most reliable on the coast: a perpetual flow of medical students, faculty and international researchers means occupancy is rarely a concern for investors.\n\nFor buyers who want a house in a town that genuinely works, this is it.',
    amenities:'Quiet residential lane|3 ensuite bedrooms|Study room|Garden with seating|5 min to Manipal University|Covered parking|Inverter backup|Compound wall',
    setting_heading:'Manipal, Udupi District',
    setting_body:'Manipal is a planned university town on a plateau above Udupi. The Manipal Academy of Higher Education is one of India\'s largest private universities, with over 25,000 students and a large international faculty.\n\nUdupi city is 8 km; Udupi railway station is 6 km; Mangaluru airport is 60 km.',
    setting_pills:'University town|Strong rental demand|8 km to Udupi',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹2,17,524',
    next_id:'sashihitlu', sort_order:10, subtype:'Independent house'
  },
  {
    id:'sashihitlu', name:'Sashihitlu Sands', loc:'Sasihithlu', area:'Sasihithlu',
    type:'House', listing:'rent', price:'₹1.85 L', price_val:185000, price_note:'/month',
    beds:'4', baths:'4', sqft:'3,000', has_img:1,
    img_card:'assets/img/sashihitlu-card.jpg', img_hero:'assets/img/sashihitlu-hero.jpg',
    story_kicker:'Beachside rental',
    story_heading:'Live by the sea — move in quickly.',
    story_body:'Sashihitlu Sands is a fully furnished four-bedroom house available for long-term rent on the Sasihithlu beachfront. The rent includes a two-car parking area, outdoor garden, and building maintenance. Available on a 12-month minimum agreement with straightforward terms.',
    amenities:'Fully furnished|Beachfront garden|4 bedrooms|2 bathrooms|Working kitchen|Parking for 2 cars|Building maintenance included|12-month minimum',
    setting_heading:'Sasihithlu, Dakshina Kannada',
    setting_body:'Sasihithlu is a quiet fishing beach north of Mangaluru. Surathkal and NITK are 15 minutes south.',
    setting_pills:'Beachfront|15 min to Surathkal|Available now',
    emi_label:null, emi_val:null,
    next_id:'sandranch', sort_order:11, subtype:'Rental properties'
  },
  {
    id:'sandranch', name:'Sand Ranch', loc:'Maravanthe', area:'Maravanthe',
    type:'House', listing:'rent', price:'₹1.25 L', price_val:125000, price_note:'/month',
    beds:'4', baths:'3', sqft:'2,600', has_img:1,
    img_card:'assets/img/sandranch-card.jpg', img_hero:'assets/img/sandranch-hero.jpg',
    story_kicker:'Maravanthe\'s famous stretch',
    story_heading:'Sea on one side, backwater on the other.',
    story_body:'Maravanthe is the stretch of Karnataka coast where NH-66 runs between the sea and the Souparnika river. Sand Ranch sits close to the beach end of this strip, with four bedrooms and a large covered terrace facing the ocean. Available on a 12-month minimum basis.',
    amenities:'Near famous NH-66 stretch|Sea-view terrace|4 bedrooms|Large kitchen|Covered outdoor dining|Parking for 2 cars|Borewell water|12-month minimum',
    setting_heading:'Maravanthe, Udupi District',
    setting_body:'Maravanthe is 20 km north of Kundapur on NH-66, between Bhatkal and Udupi.',
    setting_pills:'Famous NH-66 views|Backwater & sea|Available now',
    emi_label:null, emi_val:null,
    next_id:'jumeirah', sort_order:12, subtype:'Rental properties'
  },
  {
    id:'jumeirah', name:'The Lawn House', loc:'Padubidri', area:'Padubidri',
    type:'Commercial', listing:'lease', price:'₹3.5 L', price_val:350000, price_note:'/month',
    subtype:'Commercial space',
    beds:'6', baths:'6', sqft:'30,000', has_img:1,
    img_card:'assets/img/jumeirah-card.jpg', img_hero:'assets/img/jumeirah-hero.jpg',
    story_kicker:'The coast\'s only large event estate',
    story_heading:'A commercial estate built for events at scale.',
    story_body:'The Lawn House is a 30,000 sq ft commercial estate on the Padubidri coast, currently operated as a wedding and corporate events venue. The property includes a main bungalow, six guest suites, a 5,000 sq ft banquet lawn, two function halls and a catering-grade kitchen.',
    amenities:'30,000 sq ft total area|5,000 sq ft banquet lawn|2 function halls|6 guest suites|Catering-grade kitchen|Commercial generator|Events parking for 200 cars|Long-term lease only',
    setting_heading:'Padubidri, Udupi District',
    setting_body:'Padubidri sits on NH-66 between Mangaluru and Udupi, directly on the coast.',
    setting_pills:'Events venue|35 min to airport|3-year lease minimum',
    emi_label:null, emi_val:null,
    next_id:'oceancrest', sort_order:13
  },
  // --- New Seed Data to Support All Subtypes Required by User ---
  {
    id:'oceancrest', name:'Ocean Crest Apartment', loc:'Bejai, Mangaluru', area:'Mangaluru',
    type:'Apartment', listing:'sale', price:'₹1.8 Cr', price_val:18000000,
    beds:'3', baths:'3', sqft:'1,850', featured:1, has_img:1,
    img_card:'assets/img/girija-card.jpg', img_hero:'assets/img/girija-hero.jpg',
    story_kicker:'Luxury Builder Project',
    story_heading:'Premium high-rise apartment in Bejai.',
    story_body:'Ocean Crest is a brand new premium residential project by RichMan Builders. It offers modern 3 BHK residences with panoramic sea-views, double-height ceilings, and state-of-the-art automation systems.',
    amenities:'Infinity Pool|Modern Gym|Children Play Area|24hr Security|Power Backup|Dedicated Car Parking',
    setting_heading:'Bejai, Mangaluru',
    setting_body:'Bejai is Mangaluru\'s premier residential hub, close to shopping centers, schools and top hospitals.',
    setting_pills:'Sea views|Under construction|Premium amenities',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹1,32,776',
    next_id:'skyline', sort_order:14, subtype:'Builder sales'
  },
  {
    id:'skyline', name:'Skyline Heights', loc:'Kadavri, Mangaluru', area:'Mangaluru',
    type:'Apartment', listing:'sale', price:'₹95 L', price_val:9500000,
    beds:'2', baths:'2', sqft:'1,200', featured:0, has_img:1,
    img_card:'assets/img/sereno-hero.jpg', img_hero:'assets/img/sereno-hero.jpg',
    story_kicker:'Resale Apartment',
    story_heading:'Ready-to-occupy luxury flat.',
    story_body:'A beautifully maintained 2 BHK apartment in a premium completed complex. Fully furnished with modular kitchen, premium fixtures, and a spacious balcony overlooking city landscapes.',
    amenities:'Fully Furnished|Modular Kitchen|Gated Community|Covered Car Parking|Clubhouse Access',
    setting_heading:'Kadavri, Mangaluru',
    setting_body:'Kadavri is an established quiet residential locality with excellent connectivity to major transport routes.',
    setting_pills:'Ready to move|Furnished|Excellent connectivity',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹70,076',
    next_id:'vertex', sort_order:15, subtype:'Resale flats'
  },
  {
    id:'vertex', name:'Vertex Corporate Center', loc:'Kuntikan, Mangaluru', area:'Mangaluru',
    type:'Commercial', listing:'lease', price:'₹2.5 L', price_val:250000, price_note:'/month',
    beds:'—', baths:'4', sqft:'5,000', featured:0, has_img:1,
    img_card:'assets/img/jumeirah-card.jpg', img_hero:'assets/img/jumeirah-hero.jpg',
    story_kicker:'Commercial Office Space',
    story_heading:'Grade-A corporate office floor.',
    story_body:'Vertex Center offers modern column-free layouts with floor-to-ceiling glass, ideal for corporate headquarters, IT setups, or customer service centers.',
    amenities:'Central AC|High-speed elevators|100% power backup|Dedicated lobby|Underground car parking',
    setting_heading:'Kuntikan, Mangaluru',
    setting_body:'Directly on NH-66, Kuntikan is Mangaluru\'s rising corporate hub.',
    setting_pills:'Grade-A building|NH-66 frontage|IT ready',
    emi_label:null, emi_val:null,
    next_id:'metroplaza', sort_order:16, subtype:'Commercial office space'
  },
  {
    id:'metroplaza', name:'Metro Plaza Complex', loc:'Hampankatta, Mangaluru', area:'Mangaluru',
    type:'Commercial', listing:'sale', price:'₹12.0 Cr', price_val:120000000,
    beds:'—', baths:'6', sqft:'15,000', featured:1, has_img:1,
    img_card:'assets/img/jumeirah-hero.jpg', img_hero:'assets/img/jumeirah-hero.jpg',
    story_kicker:'Mixed-Use Commercial Hub',
    story_heading:'Premium retail & residential complex.',
    story_body:'A prominent commercial-cum-residential building in Hampankatta. Ground and first floors feature premium retail outlets, while upper floors host luxury serviced apartments.',
    amenities:'Retail frontage|High footfall|Dedicated elevators|Adequate parking|Security systems',
    setting_heading:'Hampankatta, Mangaluru',
    setting_body:'Hampankatta is the historical commercial center of Mangaluru, drawing heavy daily footfalls.',
    setting_pills:'High ROI|Retail storefronts|Central locality',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹8,85,178',
    next_id:'greenfield', sort_order:17, subtype:'Residential/commercial'
  },
  {
    id:'greenfield', name:'Greenfield Plots', loc:'Udupi Bypass', area:'Udupi',
    type:'Plot', listing:'sale', price:'₹45 L', price_val:4500000,
    beds:'—', baths:'—', sqft:'2,400 sqft', featured:0, has_img:1,
    img_card:'assets/img/kopparige-card.jpg', img_hero:'assets/img/kopparige-hero.jpg',
    story_kicker:'Residential Plots',
    story_heading:'Cleared villa plots ready for construction.',
    story_body:'A peaceful residential layout of 2,400 sqft plots with tarred roads, electricity lines, and municipal water connections. Located close to Udupi city center.',
    amenities:'Tarred roads|Underground drainage|Water supply|Street lighting|Secure compound',
    setting_heading:'Udupi Bypass Area',
    setting_body:'Udupi bypass is rapidly growing, offering quiet residential surroundings with fast highway access.',
    setting_pills:'Title clear|Immediate registration|Loan available',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹33,194',
    next_id:'palmgrove', sort_order:18, subtype:'Residential plots'
  },
  {
    id:'palmgrove', name:'Palm Grove Layout', loc:'Manipal Hills', area:'Manipal',
    type:'Plot', listing:'sale', price:'₹65 L', price_val:6500000,
    beds:'—', baths:'—', sqft:'4,000 sqft', featured:1, has_img:1,
    img_card:'assets/img/kopparige-hero.jpg', img_hero:'assets/img/kopparige-hero.jpg',
    story_kicker:'RERA Approved Layout Plots',
    story_heading:'Premium gated community layout.',
    story_body:'Palm Grove is a beautifully planned gated layout in Manipal. Featuring lush parks, security checkposts, wide concrete roads, and water/sewage connections for all plots.',
    amenities:'Gated community|RERA approved|Kids park|Storm water drains|Avenue plantation',
    setting_heading:'Manipal Hills',
    setting_body:'Located in the scenic heights of Manipal, close to universities and major hospitals.',
    setting_pills:'RERA approved|Gated layout|Lush environment',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹47,947',
    next_id:'highwaysite', sort_order:19, subtype:'Layout plots'
  },
  {
    id:'highwaysite', name:'Highway Commercial Site', loc:'Surathkal NH-66', area:'Surathkal',
    type:'Plot', listing:'sale', price:'₹3.2 Cr', price_val:32000000,
    beds:'—', baths:'—', sqft:'12,000 sqft', featured:0, has_img:1,
    img_card:'assets/img/tara-card.jpg', img_hero:'assets/img/tara-hero.jpg',
    story_kicker:'Commercial Site',
    story_heading:'High-visibility corner plot on highway.',
    story_body:'A premium corner plot measuring 12,000 sqft, with 100 feet frontage on National Highway 66. Highly suited for automobile showrooms, retail complexes, or hotel buildings.',
    amenities:'NH-66 frontage|Corner plot|Commercial zoning|Title clear|Borewell connection',
    setting_heading:'Surathkal NH-66 Corridor',
    setting_body:'Located on the bustling NH-66 connecting Mangaluru and Udupi, seeing massive commercial traffic.',
    setting_pills:'High visibility|Corner plot|Commercial zone',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹2,36,047',
    next_id:'beachfrontplot', sort_order:20, subtype:'Commercial sites'
  },
  {
    id:'beachfrontplot', name:'Sasihithlu Beachfront Plot', loc:'Sasihithlu Coast', area:'Sasihithlu',
    type:'Plot', listing:'sale', price:'₹1.5 Cr', price_val:15000000,
    beds:'—', baths:'—', sqft:'6,000 sqft', featured:1, has_img:1,
    img_card:'assets/img/samudra-card.jpg', img_hero:'assets/img/samudra-hero.jpg',
    story_kicker:'Beach Facing Site',
    story_heading:'Build your dream villa right on the beach.',
    story_body:'An exclusive beachfront plot offering spectacular, unobstructed views of the Arabian Sea. Directly adjacent to sandy shores, ideal for a private holiday villa or homestay venture.',
    amenities:'Direct beach access|Sandy shores|CRZ cleared|Fenced boundary|Sweet groundwater source',
    setting_heading:'Sasihithlu Beach',
    setting_body:'Sasihithlu is famous for its clean sands and surfing festivals, representing a highly premium coastal retreat.',
    setting_pills:'Beachfront|CRZ cleared|Private access',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹1,10,647',
    next_id:'industrialsite', sort_order:21, subtype:'Beach facing sites'
  },
  {
    id:'industrialsite', name:'Baikampady Industrial Site', loc:'Baikampady Industrial Area', area:'Surathkal',
    type:'Plot', listing:'sale', price:'₹4.8 Cr', price_val:48000000,
    beds:'—', baths:'—', sqft:'1.5 acres', featured:0, has_img:1,
    img_card:'assets/img/tatasth-card.jpg', img_hero:'assets/img/tatasth-hero.jpg',
    story_kicker:'Industrial Site',
    story_heading:'Large industrial land parcel near port.',
    story_body:'A level, cleared 1.5-acre plot located inside the prime industrial zone of Baikampady. Features wide approach roads for container movement and high-tension power line access.',
    amenities:'Wide container access|High tension electricity|Industrial water supply|Secured boundary|Near port',
    setting_heading:'Baikampady, Surathkal',
    setting_body:'Mangaluru\'s primary industrial district, located 5 km from New Mangaluru Port (NMPT).',
    setting_pills:'Industrial zone|Port proximity|Container access',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹3,54,072',
    next_id:'riverfrontsite', sort_order:22, subtype:'Industrial sites'
  },
  {
    id:'riverfrontsite', name:'Mulki Riverfront Plot', loc:'Mulki River bank', area:'Mulki',
    type:'Plot', listing:'sale', price:'₹85 L', price_val:8500000,
    beds:'—', baths:'—', sqft:'4,500 sqft', featured:1, has_img:1,
    img_card:'assets/img/mermaid-card.jpg', img_hero:'assets/img/mermaid-hero.jpg',
    story_kicker:'River Facing Site',
    story_heading:'Serene waterfront plot on Mulki river.',
    story_body:'A beautiful 4,500 sqft plot sitting right on the banks of the Mulki river backwaters. Perfect for a waterfront retreat, boating deck, or a peaceful retirement villa.',
    amenities:'Direct river frontage|Boating access|Lush green surroundings|Fenced layout|Clear road access',
    setting_heading:'Mulki Backwaters',
    setting_body:'Mulki backwaters are renowned for calm waters, kayaking clubs, and a slow, relaxing pace of life.',
    setting_pills:'Riverfront|Boating access|Kayaking hub',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹62,698',
    next_id:'coffeeland', sort_order:23, subtype:'River facing sites'
  },
  {
    id:'coffeeland', name:'Chikmagalur Coffee Land', loc:'Aldur Hills', area:'Chikmagalur',
    type:'Agricultural', listing:'sale', price:'₹2.2 Cr', price_val:22000000,
    beds:'—', baths:'—', sqft:'5 acres', featured:1, has_img:1,
    img_card:'assets/img/honeyvale-card.jpg', img_hero:'assets/img/honeyvale-hero.jpg',
    story_kicker:'Agriculture & Yielding Site',
    story_heading:'5 acres of high-yield coffee and pepper plantation.',
    story_body:'A highly productive agricultural site in Chikmagalur hills, planted with premium Arabica coffee plants and pepper creepers. Includes a packing shed and a natural spring.',
    amenities:'Yielding coffee/pepper|Natural spring water|Packing shed|Worker quarters|Good road connectivity',
    setting_heading:'Aldur, Chikmagalur',
    setting_body:'One of the premier coffee cultivation regions in Karnataka, offering fertile soil and a cool climate.',
    setting_pills:'Coffee plantation|High yield|Natural spring',
    emi_label:'85% loan · 20y · 8.5%', emi_val:'₹1,62,283',
    next_id:'mermaid', sort_order:24, subtype:'Agriculture sites'
  }
];

const TESTIMONIALS = [
  { initials:'RK', name:'Rohan Kamath', role:'Villa buyer · Surathkal', quote:'They found the title issue our previous agent missed, and still closed in three weeks. Genuinely on our side.', active:1 },
  { initials:'SP', name:'Sneha Pai', role:'Home loan · Mangaluru', quote:'Loan sanctioned in a week at a rate two banks could not match. The EMI advice alone saved us lakhs.', active:1 },
  { initials:'AD', name:'Arjun & Divya', role:'Build & interiors · Udupi', quote:'Plot, construction and interiors with one team. No finger pointing, no surprises. We would do it again.', active:1 },
];

module.exports = function seed(db) {
  const insertProp = db.prepare(`
    INSERT OR IGNORE INTO properties
      (id, name, loc, area, type, listing, price, price_val, price_note,
       beds, baths, sqft, subtype, featured, has_img, img_card, img_hero,
       story_kicker, story_heading, story_body, amenities,
       setting_heading, setting_body, setting_pills,
       emi_label, emi_val, next_id, sort_order)
    VALUES
      (@id, @name, @loc, @area, @type, @listing, @price, @price_val, @price_note,
       @beds, @baths, @sqft, @subtype, @featured, @has_img, @img_card, @img_hero,
       @story_kicker, @story_heading, @story_body, @amenities,
       @setting_heading, @setting_body, @setting_pills,
       @emi_label, @emi_val, @next_id, @sort_order)
  `);

  const insertTestimonial = db.prepare(`
    INSERT OR IGNORE INTO testimonials (initials, name, role, quote, active)
    VALUES (@initials, @name, @role, @quote, @active)
  `);

  const insertAll = db.transaction(() => {
    for (const p of HOMES) insertProp.run({
      price_note: null, subtype: null, featured: 0,
      badge_txt: null, story_kicker: null, story_heading: null,
      story_body: null, amenities: null, setting_heading: null,
      setting_body: null, setting_pills: null, emi_label: null,
      emi_val: null, next_id: null,
      ...p,
    });
    for (const t of TESTIMONIALS) insertTestimonial.run(t);
  });

  insertAll();
};
