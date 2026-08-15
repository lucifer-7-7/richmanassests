'use strict';
// data/builder-projects-seed.js
// Real transcribed data for the two live builder projects. Any field not
// present in the source brochures/images is left null/omitted — never guessed.
const path = require('path');
const BASE = path.join(__dirname, '..', 'Builder project');

const KIARA_DIR = path.join(BASE, 'Kiara breeze');
const SHAMBHAVI_DIR = path.join(BASE, 'Shambavi  Serendipity Apartment');

const kiaraFlatImages = [
  'WhatsApp Image 2026-07-18 at 8.19.11 PM.jpeg',
  'WhatsApp Image 2026-07-18 at 8.19.12 PM (1).jpeg',
  'WhatsApp Image 2026-07-18 at 8.19.12 PM.jpeg',
  'WhatsApp Image 2026-07-18 at 8.19.13 PM (1).jpeg',
  'WhatsApp Image 2026-07-18 at 8.19.13 PM.jpeg',
  'WhatsApp Image 2026-07-18 at 8.19.14 PM (1).jpeg',
  'WhatsApp Image 2026-07-18 at 8.19.14 PM (2).jpeg',
  'WhatsApp Image 2026-07-18 at 8.19.14 PM.jpeg',
];
// Only two renders have a confirmed flat-number label from visual inspection;
// the rest are per-flat interior renders with the label left null rather than guessed.
const kiaraFlatLabels = {
  'WhatsApp Image 2026-07-18 at 8.19.11 PM.jpeg': 'Flat 2',
  'WhatsApp Image 2026-07-18 at 8.19.14 PM (2).jpeg': 'Flat 5',
};

const shambhaviUnitPlanFiles = ['11.png','13.png','15.png','17.png','19.png','21.png','22.png','24.png','26.png','27.png','29.png','31.png','32.png','33.png'];
const shambhaviInteriorFiles = ['34.jpg','35.jpg','36.jpg','37.jpg','39.jpg','40.jpg','41.jpg','43.jpg','45.jpg','46.jpg','47.jpg','48.jpg','49.jpg','51.jpg','52.jpg','53.jpg','54.jpg','57.jpg','58.jpg','59.jpg','60.jpg'];
const shambhaviSitePhotoFiles = ['6.jpg','7.jpg','8.jpg','9.jpg'];

const PROJECTS = [
  {
    id: 'kiara-breeze',
    slug: 'kiara-breeze-udupi',
    name: 'Kiara Breeze',
    tagline: null,
    positioning: null,
    marketing_desc: null,

    promoter: null,
    promoter_office: null,
    registered_office: null,
    architect: null,
    legal_advisor: null,
    partnered_by: null,
    website: null,
    contact_numbers: null,
    contact_email: null,

    rera_status: null,
    rera_number: null,
    rera_date: null,
    rera_validity: null,
    survey_number: null,
    rera_cert_img: null,

    address: 'Opposite Bailoor Mahishamardini Temple, Udupi',
    area: 'Udupi',
    loc: 'Opp. Bailoor Mahishamardini Temple, Udupi',
    proximity: [
      { landmark: 'NH-66', distance: '1.2 km' },
      { landmark: 'Mission Hospital', distance: '1.3 km' },
      { landmark: 'Udupi Bus Stand', distance: '2.8 km' },
      { landmark: 'Udupi Krishna Mutt', distance: '3.7 km' },
      { landmark: 'Manipal University & Hospital', distance: '8.5 km' },
      { landmark: 'Malpe Beach', distance: '11 km' },
      { landmark: 'Kaup Beach & Lighthouse', distance: '13 km' },
      { landmark: 'Mangalore Airport', distance: '58 km' },
    ],

    project_type: 'Residential Apartment Project',
    unit_types: [
      { config: '3 BHK', sizeRange: '1450 – 1865 sft', count: 5, note: '5 flats per typical floor, east & west facing' },
    ],
    unit_mix_summary: 'Every unit is 3 BHK, 1450–1865 sft, with 5 flats per typical floor arranged around a central lift/corridor core.',
    floor_breakdown: [
      {
        floor: 'Typical Floor',
        units: [
          { flat: 'Flat 1', config: '3 BHK' },
          { flat: 'Flat 2', config: '3 BHK' },
          { flat: 'Flat 3', config: '3 BHK' },
          { flat: 'Flat 4', config: '3 BHK' },
          { flat: 'Flat 5', config: '3 BHK' },
        ],
      },
    ],
    commercial_shops: null,

    structure_specs: ['RCC frame structure', 'AAC block masonry & plastering', 'External walls: 6-inch AAC blocks', 'Internal walls: 4-inch AAC blocks'],
    flooring_specs: ['Vitrified tiles — living room, bedrooms, kitchen', 'Ceramic tiles — bathrooms', 'Anti-skid vitrified tiles — balcony & utility', 'Granite/vitrified flooring — corridors & common areas'],
    electrical_specs: ['Concealed electrical conduits', 'PVC-insulated copper wires', 'Modular switches', 'TV points', 'Telephone points', 'Geyser points', 'Exhaust fan points'],
    doors_windows_specs: ['Main door: teak frame, compressed modular door, teak veneer finish', 'Internal doors: acacia wood frames, flush doors for bedrooms', 'Windows: 3-track aluminium, powder-coated finish, 5mm glass, safety grills'],
    kitchen_specs: ['Granite kitchen platform', 'Vitrified tile finish', 'Stainless-steel sink'],
    bathroom_specs: ['Ceramic tile flooring', 'CPVC/PVC piping'],

    amenities: ['2 lifts (reputed make)', 'Stainless-steel handrails', '24-hour power backup for lifts & common areas', 'More than 60% open area', 'CCTV cameras in common areas', 'Emulsion paint interiors', 'Weather-coat paint exterior'],
    terrace_amenities: ['Gym', 'Party Hall', 'Indoor Games'],
    bank_partners: null,
    highlights: [
      'Approved by Udupi Town Planning Authority',
      'Approved by Udupi Municipality',
      'License No. Udp-Ibpas-22176/25-26/bp',
      '100% Vastu compliant',
      'Close to schools, temple, church & shopping mall',
      'Optimum space utilization',
      'Near NH-66',
    ],

    seo_title: 'Kiara Breeze, Udupi — 3 BHK Flats Near Bailoor Mahishamardini Temple | RichManAssets',
    seo_description: 'Kiara Breeze: 3 BHK flats (1450–1865 sft) opposite Bailoor Mahishamardini Temple, Udupi. RCC + AAC block construction, gym, party hall, 1.2 km from NH-66.',
    seo_keywords: [
      'kiara breeze udupi', 'kiara breeze 3 bhk flats', '3 bhk flats near bailoor mahishamardini temple',
      'flats near nh-66 udupi', 'flats near mission hospital udupi', 'apartments opposite bailoor mahishamardini temple',
      'vastu compliant flats udupi',
      'flats in udupi', 'new flats udupi', 'flats for sale in udupi', '3 bhk flat udupi price',
      'apartment for sale near me udupi', 'buy flat udupi', 'flat booking udupi', 'under construction flats udupi',
    ].join(', '),

    status: 'active',
    sort_order: 1,
    media: [
      { file: path.join(KIARA_DIR, 'structure.jpg'), type: 'master_plan', label: 'Typical floor plan & specification sheet' },
      { file: path.join(KIARA_DIR, 'info.jpg'), type: 'document', label: 'Proximity & project highlights' },
      ...kiaraFlatImages.map(f => ({ file: path.join(KIARA_DIR, 'images', f), type: 'interior', label: kiaraFlatLabels[f] || null })),
    ],
  },

  {
    id: 'shambhavi-serendipity',
    slug: 'shambhavi-serendipity-thenkanidiyoor-udupi',
    name: 'Shambhavi Serendipity',
    tagline: 'Your Dream Home Within Your Reach',
    positioning: 'Quintessentially Coastal',
    marketing_desc: 'Get ready for a warm and vibrant lifestyle in one of the finest coastal addresses. The project promotes a combination of natural coastal living with high quality construction standards and scenic green surroundings. Live life on your own terms.',

    promoter: 'Shetty Barua Enterprises LLP',
    promoter_office: '2nd Floor, Prithvi Dhama, Near Taluk Office, Udupi - 576 101',
    registered_office: 'Shetty Barua Enterprises LLP, 1st Floor, Apartment No. 106, Sharada Serendipity, Kadekar Grama Panchayath, Kuthpady Village, Udupi, Udupi, Karnataka - 576103',
    architect: 'Prime Constructions, 2nd Floor, Prithvi Dhama, Near Taluk Office, Udupi - 576 101',
    legal_advisor: 'P. Lakshman Ranganath Shenoy, Ranganath Shenoy Compound, P.P.C. Road, II Cross, Udupi - 576 101',
    partnered_by: 'SBSD Realty LLP',
    website: 'www.shambhaviserendipity.in',
    contact_numbers: '9482263700, 9483741700, 9482043700',
    contact_email: 'info.shambhavi@sbsd.in',

    rera_status: 'Approved',
    rera_number: 'PRM/KA/RERA/1273/318/PR/070622/004970',
    rera_date: '07-06-2022',
    rera_validity: '30-06-2027',
    survey_number: 'S.N/20/26, 120/25, 134/7 at Thenkanidiyoor Village, Udupi Taluk and District, Udupi',
    rera_cert_img: null,

    address: 'Near Shri Kalikamba Bhajana Sangha, Thenkanidiyoor, Krodashram, Udupi - 576 106',
    area: 'Udupi',
    loc: 'Thenkanidiyoor, Krodashram, Udupi',
    proximity: [
      { landmark: 'Kodavoor Shankara Narayana Temple', distance: '1 km' },
      { landmark: 'Malpe Beach', distance: '3.5 km' },
      { landmark: 'Udupi Bus Stand', distance: '5 km' },
      { landmark: 'Sri Mahakali Temple, Ambalpady', distance: '5.5 km' },
      { landmark: 'D Mart', distance: '6 km' },
      { landmark: 'City Centre Mall', distance: '6 km' },
      { landmark: 'Udupi Krishna Mutt', distance: '6 km' },
      { landmark: 'Udupi Railway Station', distance: '9 km' },
      { landmark: 'Manipal', distance: '10 km' },
    ],

    project_type: 'Neighbourhood Shops & Residential Apartment Building',
    unit_types: [
      { config: '1 BHK', sizeRange: '480 sft', flatNo: 'Flat 10' },
      { config: '1 BHK', sizeRange: '505 sft', flatNo: 'Flat 11' },
      { config: '1 BHK', sizeRange: '565 sft', flatNo: 'Flat 5' },
      { config: '2 BHK', sizeRange: '680 sft', flatNo: 'Flat 3 / Flat 7' },
      { config: '2 BHK', sizeRange: '690 sft', flatNo: 'Flat 6' },
      { config: '2 BHK', sizeRange: '700 sft', flatNo: 'Flat 8' },
      { config: '2 BHK', sizeRange: '710 sft', flatNo: 'Flat 4' },
      { config: '2 BHK', sizeRange: '715 sft', flatNo: 'Flat 1 / Flat 9' },
      { config: '2 BHK', sizeRange: '805 sft', flatNo: 'Flat 2' },
    ],
    unit_mix_summary: '31 residential apartments across 9 unique flat types (3 configurations of 1 BHK, 6 of 2 BHK) spread over Ground, First & Second floors, plus 5 ground-floor commercial shops (270–389 sft).',
    floor_breakdown: [
      {
        floor: 'Ground Floor',
        units: [
          { flat: 'Flat 3', config: '2 BHK', sqft: '680' },
          { flat: 'Flat 4', config: '2 BHK', sqft: '710' },
          { flat: 'Flat 5', config: '1 BHK', sqft: '565' },
          { flat: 'Flat 6', config: '2 BHK', sqft: '690' },
          { flat: 'Flat 7', config: '2 BHK', sqft: '680' },
          { flat: 'Flat 8', config: '2 BHK', sqft: '700' },
          { flat: 'Flat 9', config: '2 BHK', sqft: '715' },
          { flat: 'Flat 10', config: '1 BHK', sqft: '480' },
          { flat: 'Flat 11', config: '1 BHK', sqft: '505' },
        ],
        shops: [
          { shop: 'Shop 1', sqft: '270', dims: "16'6\" x 9'0\"" },
          { shop: 'Shop 2', sqft: '290', dims: "18'0\" x 9'6\"" },
          { shop: 'Shop 3', sqft: '275', dims: "21'0\" x 8'0\"" },
          { shop: 'Shop 4', sqft: '350', dims: "25'6\" x 9'0\"" },
          { shop: 'Shop 5', sqft: '389', dims: "26'0\" x 9'3\"" },
        ],
      },
      {
        floor: 'First Floor',
        units: [
          { flat: 'Flat 1', config: '2 BHK', sqft: '715' },
          { flat: 'Flat 2', config: '2 BHK', sqft: '805' },
          { flat: 'Flat 3', config: '2 BHK', sqft: '680' },
          { flat: 'Flat 4', config: '2 BHK', sqft: '710' },
          { flat: 'Flat 5', config: '1 BHK', sqft: '565' },
          { flat: 'Flat 6', config: '2 BHK', sqft: '690' },
          { flat: 'Flat 7', config: '2 BHK', sqft: '680' },
          { flat: 'Flat 8', config: '2 BHK', sqft: '700' },
          { flat: 'Flat 9', config: '2 BHK', sqft: '715' },
          { flat: 'Flat 10', config: '1 BHK', sqft: '480' },
          { flat: 'Flat 11', config: '1 BHK', sqft: '505' },
        ],
      },
      {
        floor: 'Second Floor',
        units: [
          { flat: 'Flat 1', config: '2 BHK', sqft: '715' },
          { flat: 'Flat 2', config: '2 BHK', sqft: '805' },
          { flat: 'Flat 3', config: '2 BHK', sqft: '680' },
          { flat: 'Flat 4', config: '2 BHK', sqft: '710' },
          { flat: 'Flat 5', config: '1 BHK', sqft: '565' },
          { flat: 'Flat 6', config: '2 BHK', sqft: '690' },
          { flat: 'Flat 7', config: '2 BHK', sqft: '680' },
          { flat: 'Flat 8', config: '2 BHK', sqft: '700' },
          { flat: 'Flat 9', config: '2 BHK', sqft: '715' },
          { flat: 'Flat 10', config: '1 BHK', sqft: '480' },
          { flat: 'Flat 11', config: '1 BHK', sqft: '505' },
        ],
      },
    ],
    commercial_shops: [
      { shop: 'Shop 1', sqft: '270', dims: "16'6\" x 9'0\"", toilet: true },
      { shop: 'Shop 2', sqft: '290', dims: "18'0\" x 9'6\"", toilet: true },
      { shop: 'Shop 3', sqft: '275', dims: "21'0\" x 8'0\"", toilet: true },
      { shop: 'Shop 4', sqft: '350', dims: "25'6\" x 9'0\"", toilet: true },
      { shop: 'Shop 5', sqft: '389', dims: "26'0\" x 9'3\"", toilet: true },
    ],

    structure_specs: ['RCC (Reinforced Cement Concrete) framed structure', 'External walls of Laterite Stone', 'Internal walls of Concrete Blocks'],
    flooring_specs: ['Vitrified tiles flooring throughout the flat', 'Toilet flooring with anti-skid ceramic tiles'],
    electrical_specs: ['Finolex / RR Kabel or equivalent wires', 'Modular electrical switches of reputed make'],
    doors_windows_specs: ["Main door: teak wood frame & shutter, melamine polish finish", 'Internal doors: Bhogi wood', 'Balcony doors: aluminium sliding, French-window size', 'Windows: powder-coated sliding aluminium, mosquito mesh, MS grills'],
    kitchen_specs: ['Black granite platform with steel sink', 'Glazed tile wall cladding up to 2 ft above the platform', 'Electrical points provisioned for kitchen appliances'],
    bathroom_specs: ['Hot & cold water mixer unit in all bathrooms', 'Glazed tile wall cladding up to 7 ft height', 'Parryware or equivalent make sanitaryware', 'Jal or equivalent make chromium-plated bathroom fittings', 'Exhaust fan provision in toilets'],

    amenities: [
      'Beautiful elevation, Class I construction under an experienced technical team',
      "8-person elevator (5'6\" x 5'6\"), 5'0\" wide common passage",
      'D.G. power backup for select common areas & apartment lighting points',
      'CCTV surveillance in designated common areas',
      '24-hour water supply through open well',
      'STP (Sewage Treatment Plant)',
      'Provision for AC point in Master Bedroom, TV point in living room',
    ],
    terrace_amenities: ['Terrace area covered with roof for small parties and gatherings'],
    bank_partners: ['Karnataka Bank Ltd.', 'ICICI Bank', 'Canara Bank', 'SBI'],
    highlights: [
      'RERA Approved — PRM/KA/RERA/1273/318/PR/070622/004970',
      '31 residential apartments + 5 ground-floor commercial shops',
      'Coastal positioning — 3.5 km from Malpe Beach',
      'Recognised by Karnataka Bank, ICICI Bank, Canara Bank & SBI',
      'From the promoters of Sharada Serendipity (completed) & Prabha Serendipity (upcoming)',
    ],

    seo_title: 'Shambhavi Serendipity, Thenkanidiyoor Udupi — RERA Approved 1 & 2 BHK Flats | RichManAssets',
    seo_description: 'Shambhavi Serendipity: RERA-approved 1 & 2 BHK flats (480–805 sft) + ground-floor shops in Thenkanidiyoor, Udupi. 3.5 km from Malpe Beach. By Shetty Barua Enterprises LLP.',
    seo_keywords: [
      'shambhavi serendipity udupi', 'shambhavi serendipity thenkanidiyoor', 'flats near malpe beach udupi',
      'rera approved apartments udupi', 'shetty barua enterprises udupi', '1 bhk flats thenkanidiyoor',
      '2 bhk flats krodashram udupi', 'apartments near kodavoor temple',
      'flats in udupi', 'new flats udupi', '1 bhk flat udupi price', '2 bhk flat udupi price',
      'flats for sale in udupi', 'apartment for sale near me udupi', 'buy flat udupi', 'flat booking udupi', 'coastal flats udupi',
    ].join(', '),

    status: 'active',
    sort_order: 2,
    media: [
      { file: path.join(SHAMBHAVI_DIR, 'images', '0.jpg'), type: 'elevation', label: 'Building elevation' },
      ...shambhaviSitePhotoFiles.map(f => ({ file: path.join(SHAMBHAVI_DIR, 'images', f), type: 'site_photo', label: null })),
      ...shambhaviUnitPlanFiles.map(f => ({ file: path.join(SHAMBHAVI_DIR, 'images', f), type: 'unit_plan', label: null })),
      ...shambhaviInteriorFiles.map(f => ({ file: path.join(SHAMBHAVI_DIR, 'images', f), type: 'interior', label: null })),
      { file: path.join(SHAMBHAVI_DIR, 'images', '56.png'), type: 'document', label: 'RERA Form-C Registration Certificate' },
    ],
  },
];

module.exports = PROJECTS;
