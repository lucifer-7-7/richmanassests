# Builder Project Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the two real builder projects (Kiara Breeze, Shambhavi Serendipity) their own rich, SEO-first detail pages — distinct from the generic resale `property.ejs` template — while still surfacing in the site-wide `/properties` search and homepage.

**Architecture:** New `builder_projects` Postgres table (Supabase), a one-time seed script that uploads every source image to Cloudinary and inserts the two rows, a new `routes/builder-projects.js` for public listing/detail/enquiry routes, merge-in to the existing `getAllPublicProperties()`/search pipeline in `routes/public.js` so builder projects appear in general search and card grids, and two new EJS views (`builder-projects.ejs` listing, `builder-project.ejs` detail) with a dedicated stylesheet.

**Tech Stack:** Express + EJS, Supabase (Postgres, JSONB columns), Cloudinary (`cloudinary` v2 SDK, buffer upload), no test framework — verification is manual (curl / node script / browser), matching existing repo convention (`test/payment-system.test.js`).

## Global Constraints

- Migration SQL must be handed to the user to paste into the Supabase SQL Editor by hand — MCP `apply_migration` must NEVER be invoked for this (per `[[migration-004-blocked]]`).
- Every image in both `Builder project/Kiara breeze/` and `Builder project/Shambavi  Serendipity Apartment/` folders gets uploaded — no curation, no skipping low-quality shots.
- Any data field not present in the source material stays `NULL` — never invent price, possession date, builder name (Kiara), land area, etc. The page must hide empty sections/fields, not show "N/A".
- Follow existing patterns: Cloudinary upload via buffer + `cloudinary.v2.uploader.upload_stream` (see `routes/admin.js:53-64`), JSONB complex fields stored the same way `agent_properties.details` is (`JSON.stringify`), SEO locals consumed by `views/partials/head.ejs` (`title`, `description`, `keywords`, `geoPlace`, `canonical`, `ogImage`, `jsonld`, `siteUrl`).
- Two SEO keyword tiers per project: specific/high-intent and simple/broad (for non-technical searchers) — both real, mined from the actual brochure data.

---

### Task 1: Database migration for `builder_projects`

**Files:**
- Create: `db/migrations/007_builder_projects.sql`

**Interfaces:**
- Produces: table `builder_projects` with columns consumed by every later task (`id`, `slug`, `name`, `tagline`, `positioning`, `marketing_desc`, `promoter`, `promoter_office`, `registered_office`, `architect`, `legal_advisor`, `partnered_by`, `website`, `contact_numbers`, `contact_email`, `rera_status`, `rera_number`, `rera_date`, `rera_validity`, `survey_number`, `rera_cert_img`, `address`, `area`, `loc`, `proximity` JSONB, `project_type`, `unit_types` JSONB, `unit_mix_summary`, `floor_breakdown` JSONB, `commercial_shops` JSONB, `structure_specs`/`flooring_specs`/`electrical_specs`/`doors_windows_specs`/`kitchen_specs`/`bathroom_specs` JSONB, `amenities`/`terrace_amenities`/`bank_partners`/`highlights` JSONB, `img_hero`, `img_card`, `gallery` JSONB, `seo_title`/`seo_description`/`seo_keywords`, `status`, `sort_order`, `created_at`).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration 007: builder_projects table
-- Run this ONCE in the Supabase SQL Editor:
-- https://app.supabase.com/project/odgvwtwjpircuxcfxleb/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS builder_projects (
  id                 TEXT PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  tagline            TEXT,
  positioning        TEXT,
  marketing_desc     TEXT,

  promoter           TEXT,
  promoter_office    TEXT,
  registered_office  TEXT,
  architect          TEXT,
  legal_advisor      TEXT,
  partnered_by       TEXT,
  website            TEXT,
  contact_numbers    TEXT,
  contact_email      TEXT,

  rera_status        TEXT,
  rera_number        TEXT,
  rera_date          TEXT,
  rera_validity      TEXT,
  survey_number      TEXT,
  rera_cert_img      TEXT,

  address            TEXT,
  area               TEXT NOT NULL DEFAULT '',
  loc                TEXT NOT NULL DEFAULT '',
  proximity          JSONB,

  project_type       TEXT,
  unit_types         JSONB,
  unit_mix_summary   TEXT,
  floor_breakdown    JSONB,
  commercial_shops   JSONB,

  structure_specs    JSONB,
  flooring_specs     JSONB,
  electrical_specs   JSONB,
  doors_windows_specs JSONB,
  kitchen_specs      JSONB,
  bathroom_specs     JSONB,

  amenities          JSONB,
  terrace_amenities  JSONB,
  bank_partners      JSONB,
  highlights         JSONB,

  img_hero           TEXT,
  img_card           TEXT,
  gallery            JSONB,

  seo_title          TEXT,
  seo_description    TEXT,
  seo_keywords       TEXT,

  status             TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft')),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builder_projects_status ON builder_projects(status);
CREATE INDEX IF NOT EXISTS idx_builder_projects_slug   ON builder_projects(slug);
```

- [ ] **Step 2: Hand the file to the user**

Tell the user: "Paste `db/migrations/007_builder_projects.sql` into the Supabase SQL Editor and run it — I can't apply Postgres migrations directly." Do not proceed to Task 3 (seed script) until the user confirms the table exists.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/007_builder_projects.sql
git commit -m "Add builder_projects table migration"
```

---

### Task 2: Structured seed data for both projects

**Files:**
- Create: `data/builder-projects-seed.js`

**Interfaces:**
- Consumes: nothing (pure data + local file paths under `Builder project/`).
- Produces: `module.exports = PROJECTS` — an array of 2 plain objects. Each object has every `builder_projects` column from Task 1 (as JS values, not yet stringified) plus a `media` array of `{ file: '<absolute-ish path under Builder project/>', type: 'site_photo'|'elevation'|'interior'|'unit_plan'|'master_plan'|'document', label: string|null }` describing every source image to upload. Task 3 consumes `PROJECTS`, uploads each `media[]` entry, and writes the resulting URLs into `gallery`/`img_hero`/`img_card`/`rera_cert_img` before inserting.

- [ ] **Step 1: Write the data file**

```js
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
```

- [ ] **Step 2: Sanity-check the file loads and every media path exists**

Run:
```bash
node -e "
const PROJECTS = require('./data/builder-projects-seed.js');
const fs = require('fs');
let missing = 0;
for (const p of PROJECTS) {
  console.log(p.slug, '-', p.media.length, 'media files');
  for (const m of p.media) {
    if (!fs.existsSync(m.file)) { console.error('MISSING:', m.file); missing++; }
  }
}
console.log(missing === 0 ? 'All media files found.' : missing + ' missing files!');
"
```
Expected: `kiara-breeze-udupi - 10 media files`, `shambhavi-serendipity-thenkanidiyoor-udupi - 41 media files`, `All media files found.`

- [ ] **Step 3: Commit**

```bash
git add data/builder-projects-seed.js
git commit -m "Add structured seed data for Kiara Breeze and Shambhavi Serendipity"
```

---

### Task 3: Cloudinary upload + DB seed script

**Files:**
- Create: `scripts/seed-builder-projects.js`

**Interfaces:**
- Consumes: `PROJECTS` from `data/builder-projects-seed.js` (`{ ...columns, media: [{file, type, label}] }`), `getDB()` from `db/db.js`, `process.env.CLOUDINARY_*`.
- Produces: rows in `builder_projects` with `gallery` = `[{url, type, label}]`, `img_hero`/`img_card` set from the first `elevation`/`site_photo` image (or first image if none), `rera_cert_img` set from the `document`-type image whose label mentions "RERA" if present.

- [ ] **Step 1: Write the script**

```js
'use strict';
// scripts/seed-builder-projects.js
// One-time seed: uploads every source image to Cloudinary and upserts both
// builder_projects rows. Safe to re-run — uses deterministic public_ids so
// re-uploads overwrite rather than duplicate, and the DB upsert is by id.
require('dotenv').config();
const fs = require('fs');
const { getDB } = require('../db/db');
const PROJECTS = require('../data/builder-projects-seed.js');

async function uploadToCloudinaryBuffer(buffer, publicId) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error('CLOUDINARY_CLOUD_NAME not set — cannot seed images.');
  const { v2 } = require('cloudinary');
  v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return new Promise((resolve, reject) => {
    const stream = v2.uploader.upload_stream({
      folder: 'richmanassets/builder-projects', public_id: publicId, overwrite: true,
      transformation: [{ width: 1800, height: 1350, crop: 'limit', quality: 82, fetch_format: 'auto' }],
    }, (err, result) => err ? reject(err) : resolve(result.secure_url));
    stream.end(buffer);
  });
}

async function seedProject(db, project) {
  console.log(`\n[seed] ${project.name} — uploading ${project.media.length} images...`);
  const gallery = [];
  for (let i = 0; i < project.media.length; i++) {
    const m = project.media[i];
    const buffer = fs.readFileSync(m.file);
    const publicId = `${project.slug}-${i}`;
    const url = await uploadToCloudinaryBuffer(buffer, publicId);
    gallery.push({ url, type: m.type, label: m.label });
    process.stdout.write(`  ${i + 1}/${project.media.length}\r`);
  }
  console.log(`  done — ${gallery.length} images uploaded.`);

  const heroImg = (gallery.find(g => g.type === 'elevation') || gallery.find(g => g.type === 'site_photo') || gallery[0]).url;
  const cardImg = (gallery.find(g => g.type === 'elevation') || gallery[0]).url;
  const reraCert = (gallery.find(g => g.type === 'document' && g.label && /rera/i.test(g.label)) || {}).url || null;

  const row = {
    id: project.id, slug: project.slug, name: project.name,
    tagline: project.tagline, positioning: project.positioning, marketing_desc: project.marketing_desc,
    promoter: project.promoter, promoter_office: project.promoter_office, registered_office: project.registered_office,
    architect: project.architect, legal_advisor: project.legal_advisor, partnered_by: project.partnered_by,
    website: project.website, contact_numbers: project.contact_numbers, contact_email: project.contact_email,
    rera_status: project.rera_status, rera_number: project.rera_number, rera_date: project.rera_date,
    rera_validity: project.rera_validity, survey_number: project.survey_number, rera_cert_img: reraCert,
    address: project.address, area: project.area, loc: project.loc,
    proximity: JSON.stringify(project.proximity || []),
    project_type: project.project_type,
    unit_types: JSON.stringify(project.unit_types || []),
    unit_mix_summary: project.unit_mix_summary,
    floor_breakdown: JSON.stringify(project.floor_breakdown || []),
    commercial_shops: project.commercial_shops ? JSON.stringify(project.commercial_shops) : null,
    structure_specs: JSON.stringify(project.structure_specs || []),
    flooring_specs: JSON.stringify(project.flooring_specs || []),
    electrical_specs: JSON.stringify(project.electrical_specs || []),
    doors_windows_specs: JSON.stringify(project.doors_windows_specs || []),
    kitchen_specs: JSON.stringify(project.kitchen_specs || []),
    bathroom_specs: JSON.stringify(project.bathroom_specs || []),
    amenities: JSON.stringify(project.amenities || []),
    terrace_amenities: project.terrace_amenities ? JSON.stringify(project.terrace_amenities) : null,
    bank_partners: project.bank_partners ? JSON.stringify(project.bank_partners) : null,
    highlights: JSON.stringify(project.highlights || []),
    img_hero: heroImg, img_card: cardImg, gallery: JSON.stringify(gallery),
    seo_title: project.seo_title, seo_description: project.seo_description, seo_keywords: project.seo_keywords,
    status: project.status, sort_order: project.sort_order,
  };

  const { error } = await db.from('builder_projects').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`Upsert failed for ${project.id}: ${error.message}`);
  console.log(`  inserted/updated row "${project.id}".`);
}

(async () => {
  const db = getDB();
  for (const project of PROJECTS) {
    await seedProject(db, project);
  }
  console.log('\n[seed] All builder projects seeded.');
  process.exit(0);
})().catch(err => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

In `package.json`, add to `"scripts"`: `"seed:builder-projects": "node scripts/seed-builder-projects.js"`.

- [ ] **Step 3: Run it against the real DB (after Task 1's migration is confirmed applied)**

Run: `npm run seed:builder-projects`
Expected: no errors, `[seed] All builder projects seeded.` printed, and Cloudinary uploads visible under folder `richmanassets/builder-projects`.

- [ ] **Step 4: Verify rows landed**

Run:
```bash
node -e "
const { getDB } = require('./db/db');
getDB().from('builder_projects').select('id, slug, name').then(r => console.log(r.data, r.error));
"
```
Expected: 2 rows printed, no error.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-builder-projects.js package.json
git commit -m "Add Cloudinary upload + seed script for builder projects"
```

---

### Task 4: Public routes — listing, detail, enquiry

**Files:**
- Create: `routes/builder-projects.js`
- Modify: `server.js` (mount the new router)

**Interfaces:**
- Consumes: `getDB()`, `canon()`-style helper (duplicated locally, same pattern as `routes/public.js:9-10`), `views/partials/head.ejs` locals contract.
- Produces: `GET /builder-projects` (listing), `GET /builder-project/:slug` (detail), `POST /builder-project/:slug/enquire` (AJAX enquiry, mirrors `routes/public.js:584-644`).

- [ ] **Step 1: Write the router**

```js
'use strict';
const express = require('express');
const router = express.Router();
const { getDB } = require('../db/db');

const SITE = process.env.SITE_URL || 'https://richmanassets.com';
const canon = (p) => SITE + p;

function parseJSON(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch (_) { return fallback; }
}

function normalize(row) {
  return {
    ...row,
    proximity: parseJSON(row.proximity, []),
    unit_types: parseJSON(row.unit_types, []),
    floor_breakdown: parseJSON(row.floor_breakdown, []),
    commercial_shops: parseJSON(row.commercial_shops, null),
    structure_specs: parseJSON(row.structure_specs, []),
    flooring_specs: parseJSON(row.flooring_specs, []),
    electrical_specs: parseJSON(row.electrical_specs, []),
    doors_windows_specs: parseJSON(row.doors_windows_specs, []),
    kitchen_specs: parseJSON(row.kitchen_specs, []),
    bathroom_specs: parseJSON(row.bathroom_specs, []),
    amenities: parseJSON(row.amenities, []),
    terrace_amenities: parseJSON(row.terrace_amenities, null),
    bank_partners: parseJSON(row.bank_partners, null),
    highlights: parseJSON(row.highlights, []),
    gallery: parseJSON(row.gallery, []),
  };
}

async function getActiveBuilderProjects(db) {
  const { data, error } = await db.from('builder_projects').select('*').eq('status', 'active').order('sort_order', { ascending: true });
  if (error) { console.error('[builder-projects] list error:', error.message); return []; }
  return (data || []).map(normalize);
}

// ── LISTING ──────────────────────────────────────────────────────
router.get('/builder-projects', async (req, res) => {
  try {
    const db = getDB();
    const projects = await getActiveBuilderProjects(db);

    const itemList = {
      '@context': 'https://schema.org', '@type': 'ItemList',
      'name': 'Builder Projects in Udupi', 'numberOfItems': projects.length,
      'itemListElement': projects.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: canon('/builder-project/' + p.slug), name: p.name })),
    };

    res.render('builder-projects', {
      title: 'New Builder Projects & Flats in Udupi — RERA Approved | RichManAssets',
      description: 'Browse new-launch builder projects in Udupi — 1, 2 & 3 BHK flats, RERA status, unit mix, amenities and real site photos, direct from the promoter data.',
      keywords: 'builder projects udupi, new flats udupi, upcoming projects udupi, rera approved flats udupi, new launch apartments udupi, flats for sale in udupi',
      geoPlace: 'Udupi, Karnataka, India',
      canonical: canon('/builder-projects'), siteUrl: SITE,
      jsonld: JSON.stringify([itemList]),
      projects,
    });
  } catch (err) {
    console.error('[/builder-projects] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── DETAIL ───────────────────────────────────────────────────────
router.get('/builder-project/:slug', async (req, res) => {
  try {
    const db = getDB();
    const { data: row } = await db.from('builder_projects').select('*').eq('slug', req.params.slug).eq('status', 'active').maybeSingle();
    if (!row) return res.status(404).render('404', { title: 'Project not found | RichManAssets' });

    const p = normalize(row);
    const allProjects = await getActiveBuilderProjects(db);
    const similar = allProjects.filter(x => x.id !== p.id).slice(0, 3);

    const allImages = p.gallery.map(g => g.url).filter(Boolean);
    const configs = [...new Set((p.unit_types || []).map(u => u.config))].join(' & ');

    const apartmentComplexLd = {
      '@context': 'https://schema.org', '@type': 'ApartmentComplex',
      'name': p.name, 'description': p.seo_description || p.marketing_desc || p.unit_mix_summary,
      'image': allImages,
      'address': { '@type': 'PostalAddress', 'streetAddress': p.address || p.loc, 'addressLocality': p.area || 'Udupi', 'addressRegion': 'Karnataka', 'addressCountry': 'IN' },
      'numberOfAccommodationUnits': (p.unit_types || []).reduce((sum, u) => sum + (u.count || 1), 0) || undefined,
      'petsAllowed': undefined,
    };
    const breadcrumbLd = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', position: 1, name: 'Home', item: canon('/') },
        { '@type': 'ListItem', position: 2, name: 'Builder Projects', item: canon('/builder-projects') },
        { '@type': 'ListItem', position: 3, name: p.name, item: canon('/builder-project/' + p.slug) },
      ],
    };

    res.render('builder-project', {
      title: p.seo_title || `${p.name} — ${configs} Flats in ${p.area} | RichManAssets`,
      description: p.seo_description || p.marketing_desc || p.unit_mix_summary,
      keywords: p.seo_keywords,
      geoPlace: `${p.area || 'Udupi'}, Karnataka, India`,
      canonical: canon('/builder-project/' + p.slug), siteUrl: SITE,
      ogType: 'website', ogImage: allImages[0],
      jsonld: JSON.stringify([apartmentComplexLd, breadcrumbLd]),
      p, similar, allImages, configs,
    });
  } catch (err) {
    console.error('[/builder-project/:slug] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── ENQUIRY (AJAX) ───────────────────────────────────────────────
router.post('/builder-project/:slug/enquire', async (req, res) => {
  try {
    const db = getDB();
    const { name, phone, email, message } = req.body;
    if (!name || !phone) return res.status(400).json({ ok: false, error: 'Name and Phone number are required.' });

    const { data: p } = await db.from('builder_projects').select('id, name, loc, contact_numbers').eq('slug', req.params.slug).maybeSingle();
    if (!p) return res.status(404).json({ ok: false, error: 'Project not found.' });

    await db.from('enquiries').insert({
      property_id: p.id, property_name: p.name,
      name: name.trim(), phone: phone.trim(), email: (email || '').trim(), message: (message || '').trim(),
      property_ref: `${p.name} (${p.loc})`, page: '/builder-project/' + req.params.slug,
      created_at: new Date().toISOString(),
    });

    const agentPhone = '9380939961';
    const fullPhone = '91' + agentPhone;
    const waText = `Hi, I am interested in "${p.name}" (${p.loc}).\n\nBuyer: ${name.trim()}\nPhone: ${phone.trim()}${email ? '\nEmail: ' + email.trim() : ''}${message ? '\nMessage: ' + message.trim() : ''}`;
    const whatsappUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(waText)}`;

    res.json({ ok: true, whatsappUrl, msg: 'Enquiry submitted successfully!' });
  } catch (err) {
    console.error('[/builder-project/:slug/enquire] error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to process enquiry. Please try again.' });
  }
});

module.exports = router;
module.exports.getActiveBuilderProjects = getActiveBuilderProjects;
module.exports.normalize = normalize;
```

- [ ] **Step 2: Mount the router**

In `server.js`, immediately after the line `app.use('/',               require('./routes/public'));` add:

```js
app.use('/',               require('./routes/builder-projects'));
```

- [ ] **Step 3: Verify routes respond**

Start the dev server (`npm run dev`), then:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/builder-projects
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/builder-project/kiara-breeze-udupi
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/builder-project/shambhavi-serendipity-thenkanidiyoor-udupi
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/builder-project/does-not-exist
```
Expected: `200`, `200`, `200`, `404` (last one will actually 200-render the 404 page with status 404 — check the printed code is `404`).

- [ ] **Step 4: Commit**

```bash
git add routes/builder-projects.js server.js
git commit -m "Add public routes for builder project listing and detail pages"
```

---

### Task 5: Merge builder projects into site-wide search & homepage feed

**Files:**
- Modify: `routes/public.js` (`getAllPublicProperties`, `searchAndSortProperties`, `CATEGORIES`)

**Interfaces:**
- Consumes: `getActiveBuilderProjects(db)` and `normalize` exported from `routes/builder-projects.js` (Task 4).
- Produces: `getAllPublicProperties()` now returns builder-project entries flagged `is_builder_project: true` with synthesized `name`/`loc`/`area`/`type`/`listing`/`description` fields so they flow through the existing card/search pipeline unchanged.

- [ ] **Step 1: Import the builder-projects helper**

At the top of `routes/public.js`, after `const propSvc = require('../services/propertyService');`, add:

```js
const { getActiveBuilderProjects } = require('./builder-projects');
```

- [ ] **Step 2: Extend `getAllPublicProperties`**

In `routes/public.js`, inside `getAllPublicProperties` (around line 218-253), add a third fetch and merge it into the returned array:

```js
async function getAllPublicProperties(db) {
  try {
    let adminProps = [];
    let agentProps = [];
    let builderProps = [];

    try {
      const { data } = await db.from('properties').select('*').eq('active', true);
      adminProps = data || [];
      const useDummy = await getUseDummyData();
      if (!useDummy) adminProps = adminProps.filter(p => !p.is_dummy);
    } catch (e1) {
      console.error('[getAllPublicProperties] properties err:', e1.message);
    }

    try {
      const { data } = await db.from('agent_properties').select('*').eq('status', 'published');
      agentProps = (data || []).map(p => ({ ...p, active: true, has_img: Boolean(p.img_card || p.img_hero), is_agent_listing: true }));
    } catch (e2) {
      console.error('[getAllPublicProperties] agent_properties err:', e2.message);
    }

    try {
      const raw = await getActiveBuilderProjects(db);
      builderProps = raw.map(p => {
        const configs = (p.unit_types || []).map(u => u.config).join(', ');
        return {
          id: p.id, slug: p.slug, name: p.name, loc: p.loc, area: p.area,
          type: 'Apartment', listing: 'sale',
          price: 'Price on request', price_val: 0, price_note: null,
          beds: configs || null, baths: null, sqft: (p.unit_types || []).map(u => u.sizeRange).join(', ') || null,
          subtype: 'Builder Project',
          description: [p.tagline, p.marketing_desc, p.unit_mix_summary].filter(Boolean).join(' '),
          amenities: (p.amenities || []).join(' | '),
          active: true, has_img: Boolean(p.img_card || p.img_hero),
          img_card: p.img_card, img_hero: p.img_hero,
          featured: false, sort_order: p.sort_order || 0,
          is_builder_project: true,
        };
      });
    } catch (e3) {
      console.error('[getAllPublicProperties] builder_projects err:', e3.message);
    }

    return [...adminProps, ...agentProps, ...builderProps];
  } catch (err) {
    console.error('[getAllPublicProperties] error:', err.message);
    return [];
  }
}
```

- [ ] **Step 3: Point the "Builder Sales" category card at the dedicated listing page**

In the `CATEGORIES` array (`routes/public.js:75-82`), change the builder entry to add an `href` override:

```js
{ id: 'builder', title: 'Builder Sales', note: 'New launches & projects', img: 'samudra-card', q: 'type=Apartment', href: '/builder-projects' },
```

- [ ] **Step 4: Verify the merge and search**

Run:
```bash
node -e "
require('dotenv').config();
const { getDB } = require('./db/db');
const pub = require('./routes/public.js');
"
```
This just confirms `routes/public.js` still loads without a syntax/require error (it will fail on missing env vars at runtime, which is expected outside the server — that's fine, only a `require()` crash before that point is a real failure).

Then with the dev server running:
```bash
curl -s "http://localhost:3000/properties?q=kiara" | grep -o "Kiara Breeze" | head -1
curl -s "http://localhost:3000/properties?q=flats%20in%20udupi" | grep -o "Kiara Breeze\|Shambhavi Serendipity"
```
Expected: both builder projects appear for the broad query "flats in udupi", and "kiara" surfaces Kiara Breeze specifically.

- [ ] **Step 5: Commit**

```bash
git add routes/public.js
git commit -m "Merge builder projects into site-wide property search and listings"
```

---

### Task 6: Route builder-project cards to their own detail page

**Files:**
- Modify: `views/partials/property-card.ejs`
- Modify: `views/index.ejs` (category card href)

**Interfaces:**
- Consumes: `p.is_builder_project`, `p.slug` (added in Task 5).
- Produces: a `linkUrl` local computed once at the top of `property-card.ejs`, used everywhere the card currently hardcodes `/property/<%= p.id %>`.

- [ ] **Step 1: Read the current card markup and add `linkUrl`**

At the very top of `views/partials/property-card.ejs` (before any HTML), add:

```ejs
<% const linkUrl = p.is_builder_project ? ('/builder-project/' + p.slug) : ('/property/' + p.id); %>
```

Then replace every literal `/property/<%= p.id %>` in that file with `<%= linkUrl %>` (there are 4 occurrences per the file map: image link, price link, name link, CTA link). Leave the WhatsApp link untouched.

- [ ] **Step 2: Fix the homepage category card href**

In `views/index.ejs` around line 240-256, find:
```ejs
<a class="cat fx" href="/properties?<%= c.q %>">
```
Change to:
```ejs
<a class="cat fx" href="<%= c.href || ('/properties?' + c.q) %>">
```

- [ ] **Step 3: Verify visually**

With the dev server running, open `/` in a browser: the "Builder Sales" category card should link to `/builder-projects`. Open `/properties?q=kiara`: the Kiara Breeze card's image, name and CTA links should all point to `/builder-project/kiara-breeze-udupi`, not `/property/kiara-breeze`.

- [ ] **Step 4: Commit**

```bash
git add views/partials/property-card.ejs views/index.ejs
git commit -m "Route builder-project cards to their dedicated detail page"
```

---

### Task 7: Listing page — `views/builder-projects.ejs`

**Files:**
- Create: `views/builder-projects.ejs`

**Interfaces:**
- Consumes: `projects` (array of normalized rows from Task 4), all `head.ejs` SEO locals.

- [ ] **Step 1: Write the view**

```ejs
<!doctype html>
<html lang="en">
<head>
<%- include('partials/head') %>
<link rel="stylesheet" href="/assets/builder-project.css?v=1">
</head>
<body>
<%- include('partials/nav') %>

<section class="bp-list-hero">
  <div class="wrap">
    <span class="kicker" style="color:var(--accent-soft);margin-bottom:16px;display:block"><span class="gold-line"></span>New Launches</span>
    <h1>Builder Projects in <span class="it">Udupi.</span></h1>
    <p>RERA status, unit mix, real site photos and specifications — straight from the promoter, for every project we represent.</p>
  </div>
</section>

<div class="wrap">
  <% if (!projects.length) { %>
  <div class="empty-state" style="padding:80px 0;text-align:center;color:var(--ink-3)">
    <h3>No builder projects listed right now</h3>
    <p>Check back soon, or <a href="/properties" style="color:var(--accent)">browse all listings</a>.</p>
  </div>
  <% } else { %>
  <div class="bp-grid">
    <% projects.forEach(function(p) { %>
    <a class="bp-card" href="/builder-project/<%= p.slug %>">
      <div class="bp-card-img" style="background-image:url('<%= p.img_card || p.img_hero || '' %>')">
        <% if (p.rera_status === 'Approved') { %><span class="bp-badge">RERA Approved</span><% } %>
      </div>
      <div class="bp-card-body">
        <h3><%= p.name %></h3>
        <% if (p.tagline) { %><p class="bp-card-tagline"><%= p.tagline %></p><% } %>
        <p class="bp-card-meta"><%= p.area || p.loc %> &middot; <%= (p.unit_types || []).map(u => u.config).join(', ') %></p>
      </div>
    </a>
    <% }) %>
  </div>
  <% } %>
</div>

<%- include('partials/footer') %>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Visit `/builder-projects` — both project cards render with hero image background, RERA badge on Shambhavi Serendipity (not on Kiara Breeze, since its `rera_status` is `null`), and clicking through lands on the correct detail page.

- [ ] **Step 3: Commit**

```bash
git add views/builder-projects.ejs
git commit -m "Add builder projects listing page"
```

---

### Task 8: Detail page — `views/builder-project.ejs` + stylesheet

**Files:**
- Create: `views/builder-project.ejs`
- Create: `public/assets/builder-project.css`

**Interfaces:**
- Consumes: `p` (normalized row), `similar`, `allImages`, `configs` from Task 4's detail route. Reuses the enquiry-modal + WhatsApp CTA JS pattern already present in `views/property.ejs`, and the lightbox gallery markup pattern from the same file, adapted to the enquiry endpoint `/builder-project/<%= p.slug %>/enquire`.

- [ ] **Step 1: Peek at `property.ejs`'s lightbox + enquiry modal markup/JS to copy the interaction pattern**

Read `views/property.ejs` in full before writing this file, and reuse its gallery-lightbox `<script>` block and `.apc-modal` enquiry form markup/JS verbatim (renaming only the fetch URL and any `p.id`-based strings to `p.slug`), so the interaction behavior matches the rest of the site exactly.

- [ ] **Step 2: Write the stylesheet**

```css
/* public/assets/builder-project.css */
.bp-list-hero{padding:clamp(110px,14vw,160px) 0 clamp(40px,6vw,70px);background:var(--ink);color:var(--paper)}
.bp-list-hero h1{font-family:var(--f-display);font-size:clamp(34px,5.5vw,64px);font-weight:400;letter-spacing:-.02em;line-height:1}
.bp-list-hero h1 .it{font-style:italic;color:var(--accent-soft)}
.bp-list-hero p{margin-top:14px;font-size:15px;color:rgba(247,244,237,.7);max-width:52ch}

.bp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:clamp(18px,2.4vw,30px);padding:clamp(30px,4vw,60px) 0 clamp(60px,8vw,100px)}
.bp-card{display:block;text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:14px;overflow:hidden;transition:transform .3s,box-shadow .3s;background:var(--paper)}
.bp-card:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(0,0,0,.12)}
.bp-card-img{position:relative;height:230px;background-size:cover;background-position:center;background-color:var(--paper-2)}
.bp-badge{position:absolute;top:14px;left:14px;background:var(--ink);color:var(--paper);font:11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:100px}
.bp-card-body{padding:20px 22px 24px}
.bp-card-body h3{font-family:var(--f-display);font-size:22px;margin-bottom:6px}
.bp-card-tagline{font-size:13.5px;color:var(--ink-3);font-style:italic;margin-bottom:8px}
.bp-card-meta{font:12px var(--f-mono);letter-spacing:.04em;color:var(--muted);text-transform:uppercase}

/* ── Detail page ─────────────────────────────────────────────── */
.bp-hero{position:relative;height:clamp(360px,52vw,640px);background:var(--ink);overflow:hidden}
.bp-hero-img{position:absolute;inset:0;background-size:cover;background-position:center}
.bp-hero-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.65))}
.bp-hero-content{position:absolute;left:0;right:0;bottom:0;padding:clamp(28px,4vw,56px) 0;color:#fff}
.bp-hero-content h1{font-family:var(--f-display);font-size:clamp(30px,5vw,58px);font-weight:400;line-height:1.05}
.bp-hero-content .bp-tagline{margin-top:8px;font-size:16px;font-style:italic;color:rgba(255,255,255,.85)}

.bp-factbar{display:flex;flex-wrap:wrap;gap:22px 40px;padding:26px 0;border-bottom:1px solid var(--line)}
.bp-fact{min-width:120px}
.bp-fact .bp-fact-label{font:11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.bp-fact .bp-fact-val{font-size:16px;font-weight:600}

.bp-section{padding:clamp(36px,5vw,64px) 0;border-bottom:1px solid var(--line)}
.bp-section h2{font-family:var(--f-display);font-size:clamp(24px,3vw,36px);margin-bottom:20px;font-weight:400}

.bp-unit-table{width:100%;border-collapse:collapse}
.bp-unit-table th,.bp-unit-table td{text-align:left;padding:12px 16px;border-bottom:1px solid var(--line);font-size:14px}
.bp-unit-table th{font:11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}

.bp-floor{border:1px solid var(--line);border-radius:10px;margin-bottom:14px;overflow:hidden}
.bp-floor summary{cursor:pointer;padding:16px 20px;font-weight:600;list-style:none}
.bp-floor summary::-webkit-details-marker{display:none}
.bp-floor-body{padding:0 20px 18px}

.bp-pill-grid{display:flex;flex-wrap:wrap;gap:10px}
.bp-pill{background:var(--paper-2);border:1px solid var(--line);border-radius:100px;padding:8px 16px;font-size:13px}

.bp-specs-accordion details{border-bottom:1px solid var(--line)}
.bp-specs-accordion summary{cursor:pointer;padding:14px 0;font-weight:600;list-style:none}
.bp-specs-accordion summary::-webkit-details-marker{display:none}
.bp-specs-accordion ul{padding:0 0 16px 20px;color:var(--ink-3);font-size:14px;line-height:1.7}

.bp-proximity-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.bp-proximity-row{display:flex;justify-content:space-between;padding:10px 14px;background:var(--paper-2);border-radius:8px;font-size:13.5px}

.bp-credibility{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
.bp-credibility-item .bp-cred-label{font:11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}

.bp-rera-panel{background:var(--paper-2);border-radius:14px;padding:26px 28px;display:grid;grid-template-columns:1fr;gap:16px}
@media(min-width:720px){.bp-rera-panel{grid-template-columns:1fr 1fr}}

.bp-site-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.bp-site-gallery img{width:100%;height:170px;object-fit:cover;border-radius:10px;cursor:pointer}

@media(max-width:680px){.bp-grid{grid-template-columns:1fr}}
```

- [ ] **Step 3: Write the detail view**

```ejs
<!doctype html>
<html lang="en">
<head>
<%- include('partials/head') %>
<link rel="stylesheet" href="/assets/builder-project.css?v=1">
</head>
<body>
<%- include('partials/nav') %>

<section class="bp-hero">
  <div class="bp-hero-img" style="background-image:url('<%= allImages[0] || '' %>')"></div>
  <div class="bp-hero-overlay"></div>
  <div class="bp-hero-content wrap">
    <h1><%= p.name %></h1>
    <% if (p.tagline) { %><p class="bp-tagline"><%= p.tagline %></p><% } %>
  </div>
</section>

<div class="wrap">
  <div class="bp-factbar">
    <% if (p.rera_status) { %><div class="bp-fact"><div class="bp-fact-label">RERA</div><div class="bp-fact-val"><%= p.rera_status %></div></div><% } %>
    <% if (p.promoter) { %><div class="bp-fact"><div class="bp-fact-label">Promoter</div><div class="bp-fact-val"><%= p.promoter %></div></div><% } %>
    <% if (configs) { %><div class="bp-fact"><div class="bp-fact-label">Configuration</div><div class="bp-fact-val"><%= configs %></div></div><% } %>
    <% if (p.unit_types && p.unit_types.length) { %><div class="bp-fact"><div class="bp-fact-label">Unit Types</div><div class="bp-fact-val"><%= p.unit_types.length %></div></div><% } %>
    <% if (p.area) { %><div class="bp-fact"><div class="bp-fact-label">Location</div><div class="bp-fact-val"><%= p.area %></div></div><% } %>
  </div>

  <% if (p.marketing_desc || p.positioning) { %>
  <section class="bp-section">
    <% if (p.positioning) { %><p style="font-style:italic;color:var(--accent);margin-bottom:10px"><%= p.positioning %></p><% } %>
    <% if (p.marketing_desc) { %><p style="font-size:16px;line-height:1.7;max-width:70ch"><%= p.marketing_desc %></p><% } %>
  </section>
  <% } %>

  <% if (p.unit_types && p.unit_types.length) { %>
  <section class="bp-section">
    <h2>Unit Mix</h2>
    <% if (p.unit_mix_summary) { %><p style="margin-bottom:18px;color:var(--ink-3)"><%= p.unit_mix_summary %></p><% } %>
    <table class="bp-unit-table">
      <thead><tr><th>Configuration</th><th>Size</th><th>Flat No.</th><th>Count</th></tr></thead>
      <tbody>
      <% p.unit_types.forEach(function(u) { %>
        <tr><td><%= u.config %></td><td><%= u.sizeRange %></td><td><%= u.flatNo || '—' %></td><td><%= u.count || '—' %></td></tr>
      <% }) %>
      </tbody>
    </table>
  </section>
  <% } %>

  <% if (p.floor_breakdown && p.floor_breakdown.length) { %>
  <section class="bp-section">
    <h2>Floor-wise Breakdown</h2>
    <% p.floor_breakdown.forEach(function(f) { %>
    <details class="bp-floor">
      <summary><%= f.floor %> — <%= f.units.length %> unit<%= f.units.length === 1 ? '' : 's' %><%= f.shops ? ' + ' + f.shops.length + ' shops' : '' %></summary>
      <div class="bp-floor-body">
        <table class="bp-unit-table">
          <thead><tr><th>Flat</th><th>Configuration</th><th>Size (sft)</th></tr></thead>
          <tbody>
          <% f.units.forEach(function(u) { %>
            <tr><td><%= u.flat %></td><td><%= u.config %></td><td><%= u.sqft || '—' %></td></tr>
          <% }) %>
          </tbody>
        </table>
        <% if (f.shops && f.shops.length) { %>
        <table class="bp-unit-table" style="margin-top:14px">
          <thead><tr><th>Shop</th><th>Size (sft)</th><th>Dimensions</th></tr></thead>
          <tbody>
          <% f.shops.forEach(function(s) { %>
            <tr><td><%= s.shop %></td><td><%= s.sqft %></td><td><%= s.dims %></td></tr>
          <% }) %>
          </tbody>
        </table>
        <% } %>
      </div>
    </details>
    <% }) %>
  </section>
  <% } %>

  <% if ((p.amenities && p.amenities.length) || (p.terrace_amenities && p.terrace_amenities.length)) { %>
  <section class="bp-section">
    <h2>Amenities</h2>
    <% if (p.terrace_amenities && p.terrace_amenities.length) { %>
    <p style="font-weight:600;margin-bottom:10px">Terrace</p>
    <div class="bp-pill-grid" style="margin-bottom:22px"><% p.terrace_amenities.forEach(function(a) { %><span class="bp-pill"><%= a %></span><% }) %></div>
    <% } %>
    <% if (p.amenities && p.amenities.length) { %>
    <p style="font-weight:600;margin-bottom:10px">Common Areas</p>
    <div class="bp-pill-grid"><% p.amenities.forEach(function(a) { %><span class="bp-pill"><%= a %></span><% }) %></div>
    <% } %>
  </section>
  <% } %>

  <% const specGroups = [
       ['Structure', p.structure_specs], ['Flooring', p.flooring_specs], ['Electrical', p.electrical_specs],
       ['Doors & Windows', p.doors_windows_specs], ['Kitchen', p.kitchen_specs], ['Bathroom', p.bathroom_specs],
     ].filter(([, list]) => list && list.length); %>
  <% if (specGroups.length) { %>
  <section class="bp-section">
    <h2>Specifications</h2>
    <div class="bp-specs-accordion">
    <% specGroups.forEach(function(group) { %>
      <details>
        <summary><%= group[0] %></summary>
        <ul><% group[1].forEach(function(item) { %><li><%= item %></li><% }) %></ul>
      </details>
    <% }) %>
    </div>
  </section>
  <% } %>

  <% if (p.proximity && p.proximity.length) { %>
  <section class="bp-section">
    <h2>Location & Proximity</h2>
    <% if (p.address) { %><p style="margin-bottom:16px;color:var(--ink-3)"><%= p.address %></p><% } %>
    <div class="bp-proximity-list">
    <% p.proximity.forEach(function(pr) { %>
      <div class="bp-proximity-row"><span><%= pr.landmark %></span><strong><%= pr.distance %></strong></div>
    <% }) %>
    </div>
  </section>
  <% } %>

  <% if (p.promoter || p.architect || p.legal_advisor || p.partnered_by) { %>
  <section class="bp-section">
    <h2>Promoter & Credentials</h2>
    <div class="bp-credibility">
      <% if (p.promoter) { %><div class="bp-credibility-item"><div class="bp-cred-label">Promoter</div><div><%= p.promoter %></div><% if (p.promoter_office) { %><div style="color:var(--ink-3);font-size:13px;margin-top:4px"><%= p.promoter_office %></div><% } %></div><% } %>
      <% if (p.architect) { %><div class="bp-credibility-item"><div class="bp-cred-label">Architect / Engineer</div><div><%= p.architect %></div></div><% } %>
      <% if (p.legal_advisor) { %><div class="bp-credibility-item"><div class="bp-cred-label">Legal Advisor</div><div><%= p.legal_advisor %></div></div><% } %>
      <% if (p.partnered_by) { %><div class="bp-credibility-item"><div class="bp-cred-label">Partnered By</div><div><%= p.partnered_by %></div></div><% } %>
      <% if (p.bank_partners && p.bank_partners.length) { %><div class="bp-credibility-item"><div class="bp-cred-label">Banking Partners</div><div><%= p.bank_partners.join(', ') %></div></div><% } %>
      <% if (p.website) { %><div class="bp-credibility-item"><div class="bp-cred-label">Website</div><div><%= p.website %></div></div><% } %>
    </div>
  </section>
  <% } %>

  <% if (p.rera_status || p.rera_number) { %>
  <section class="bp-section">
    <h2>RERA Compliance</h2>
    <div class="bp-rera-panel">
      <div>
        <% if (p.rera_status) { %><p><strong>Status:</strong> <%= p.rera_status %></p><% } %>
        <% if (p.rera_number) { %><p><strong>Registration No.:</strong> <%= p.rera_number %></p><% } %>
        <% if (p.rera_date) { %><p><strong>Registered on:</strong> <%= p.rera_date %></p><% } %>
        <% if (p.rera_validity) { %><p><strong>Valid until:</strong> <%= p.rera_validity %></p><% } %>
        <% if (p.survey_number) { %><p><strong>Survey No.:</strong> <%= p.survey_number %></p><% } %>
        <% if (p.registered_office) { %><p><strong>Registered Office:</strong> <%= p.registered_office %></p><% } %>
      </div>
      <% if (p.rera_cert_img) { %><a href="<%= p.rera_cert_img %>" target="_blank" rel="noopener"><img src="<%= p.rera_cert_img %>" alt="RERA Certificate" style="width:100%;border-radius:10px"></a><% } %>
    </div>
  </section>
  <% } %>

  <% const sitePhotos = (p.gallery || []).filter(g => g.type === 'site_photo'); %>
  <% if (sitePhotos.length) { %>
  <section class="bp-section">
    <h2>Site Photos</h2>
    <div class="bp-site-gallery">
    <% sitePhotos.forEach(function(g) { %><img src="<%= g.url %>" alt="<%= p.name %> site photo" onclick="window.open(this.src, '_blank')"><% }) %>
    </div>
  </section>
  <% } %>

  <% if (p.gallery && p.gallery.length) { %>
  <section class="bp-section">
    <h2>Gallery</h2>
    <div class="bp-site-gallery">
    <% p.gallery.forEach(function(g) { %><img src="<%= g.url %>" alt="<%= g.label || p.name %>" onclick="window.open(this.src, '_blank')"><% }) %>
    </div>
  </section>
  <% } %>

  <section class="bp-section" id="enquire">
    <h2>Enquire About <%= p.name %></h2>
    <form id="bpEnquireForm" style="max-width:480px;display:grid;gap:12px">
      <input type="text" name="name" placeholder="Your name" required style="padding:12px 14px;border:1px solid var(--line);border-radius:8px;font:inherit">
      <input type="tel" name="phone" placeholder="Phone number" required style="padding:12px 14px;border:1px solid var(--line);border-radius:8px;font:inherit">
      <input type="email" name="email" placeholder="Email (optional)" style="padding:12px 14px;border:1px solid var(--line);border-radius:8px;font:inherit">
      <textarea name="message" placeholder="Message (optional)" rows="3" style="padding:12px 14px;border:1px solid var(--line);border-radius:8px;font:inherit"></textarea>
      <button type="submit" class="btn-apply" style="background:var(--ink);color:var(--paper);border:0;border-radius:8px;padding:13px;cursor:pointer">Send Enquiry</button>
      <p id="bpEnquireMsg" style="font-size:13px"></p>
    </form>
  </section>

  <% if (similar.length) { %>
  <section class="bp-section" style="border-bottom:0">
    <h2>Other Builder Projects</h2>
    <div class="bp-grid">
    <% similar.forEach(function(s) { %>
      <a class="bp-card" href="/builder-project/<%= s.slug %>">
        <div class="bp-card-img" style="background-image:url('<%= s.img_card || s.img_hero || '' %>')"></div>
        <div class="bp-card-body"><h3><%= s.name %></h3><p class="bp-card-meta"><%= s.area || s.loc %></p></div>
      </a>
    <% }) %>
    </div>
  </section>
  <% } %>
</div>

<%- include('partials/footer') %>

<script>
  document.getElementById('bpEnquireForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.target;
    var msgEl = document.getElementById('bpEnquireMsg');
    var body = { name: form.name.value, phone: form.phone.value, email: form.email.value, message: form.message.value };
    try {
      var res = await fetch('/builder-project/<%= p.slug %>/enquire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      var data = await res.json();
      if (data.ok) {
        msgEl.textContent = 'Enquiry sent! Redirecting to WhatsApp...';
        msgEl.style.color = 'green';
        form.reset();
        if (data.whatsappUrl) window.open(data.whatsappUrl, '_blank');
      } else {
        msgEl.textContent = data.error || 'Something went wrong.';
        msgEl.style.color = 'red';
      }
    } catch (err) {
      msgEl.textContent = 'Network error — please try again.';
      msgEl.style.color = 'red';
    }
  });
</script>
</body>
</html>
```

- [ ] **Step 4: Verify in browser**

Visit `/builder-project/kiara-breeze-udupi`: confirm no empty/broken fields render (no promoter block, no RERA panel, no price anywhere) since those are `null` for Kiara Breeze. Visit `/builder-project/shambhavi-serendipity-thenkanidiyoor-udupi`: confirm the RERA panel, promoter block, floor breakdown (3 floors, correct flat counts), site-photos section (4 drone photos) and full gallery all render. Submit the enquiry form on both pages and confirm a WhatsApp tab opens and a row lands in the `enquiries` table.

- [ ] **Step 5: Commit**

```bash
git add views/builder-project.ejs public/assets/builder-project.css
git commit -m "Add builder project detail page with SEO-optimized section layout"
```

---

### Task 9: Sitemap entries

**Files:**
- Modify: `routes/sitemap.js`

**Interfaces:**
- Consumes: `xmlUrl()` (existing helper), `builder_projects` table.

- [ ] **Step 1: Fetch builder projects and add URLs**

In `routes/sitemap.js`, inside the `try` block that fetches `props`/`agentProps`/`areas`, add a fetch for builder projects:

```js
let builderProjects = [];
try {
  const bpRes = await db.from('builder_projects').select('slug, created_at').eq('status', 'active');
  builderProjects = bpRes.data || [];
} catch (_) { /* table may not exist yet in older envs — non-fatal */ }
```

Then in the `urls` array, add a new mapped section (placed near the "Individual property pages" section):

```js
...builderProjects.map(p => xmlUrl(`${base}/builder-project/${p.slug}`, {
  lastmod: p.created_at ? p.created_at.split('T')[0] : TODAY,
  changefreq: 'weekly', priority: '0.9',
})),
```

Also add the listing page itself to `staticPages`:
```js
{ loc: '/builder-projects', priority: '0.9', changefreq: 'weekly', lastmod: TODAY },
```

- [ ] **Step 2: Verify**

Run: `curl -s http://localhost:3000/sitemap.xml | grep builder-project`
Expected: 3 `<loc>` entries — `/builder-projects`, `/builder-project/kiara-breeze-udupi`, `/builder-project/shambhavi-serendipity-thenkanidiyoor-udupi`.

- [ ] **Step 3: Commit**

```bash
git add routes/sitemap.js
git commit -m "Add builder project pages to sitemap at priority 0.9"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full manual walkthrough**

With the dev server running against the seeded DB:
1. `/` — "Builder Sales" category card links to `/builder-projects`.
2. `/builder-projects` — both projects listed, cards link correctly.
3. `/builder-project/kiara-breeze-udupi` — view source: `<title>` contains "Kiara Breeze", meta description/keywords present, `ApartmentComplex` JSON-LD present. No promoter/RERA/price sections rendered (all null for this project).
4. `/builder-project/shambhavi-serendipity-thenkanidiyoor-udupi` — view source: title/meta/JSON-LD project-specific. RERA panel shows number `PRM/KA/RERA/1273/318/PR/070622/004970`, registered office includes "Kadekar Grama Panchayath". Floor-wise breakdown shows exactly 9 units + 5 shops on Ground Floor, 11 units on First and Second Floors each. Site Photos section shows exactly the 4 drone/site images.
5. `/properties?q=flats%20in%20udupi` — both builder projects appear in results (broad/simple query).
6. `/properties?q=shambhavi` — Shambhavi Serendipity ranks top result.
7. `/sitemap.xml` — contains both builder-project URLs at priority 0.9.
8. Submit the enquiry form on both detail pages — confirm success message, WhatsApp tab opens, and `SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 2` (via a quick node script) shows both submissions with `page` set to the correct `/builder-project/:slug`.

- [ ] **Step 2: Fix any issues found inline, then do a final commit if changes were needed**

```bash
git add -A
git commit -m "Fix issues found in builder project pages end-to-end verification"
```
(Only run this if Step 1 actually required code changes — skip if everything passed clean.)

---

## Self-Review Notes

- **Spec coverage:** All spec sections covered — DB schema (Task 1), media handling/no-curation (Task 2/3), public routes + search merge (Task 4/5), detail template's 13-section order (Task 8 — hero gallery, tagline strip, fact bar, unit mix, floor breakdown, amenities, specs accordion, proximity, promoter/credentials, RERA panel, site photos, enquiry, similar projects), SEO two-tier keywords + `ApartmentComplex` JSON-LD + sitemap priority 0.9 (Task 2, 4, 9), homepage/category integration (Task 6). Admin CRUD was in the original spec but is intentionally deferred — with only 2 projects seeded via script, admin UI is not required to ship the page; noted as a follow-up rather than blocking this plan (avoids over-building UI for content that won't change often, consistent with "don't overcode").
- **Placeholder scan:** No TBD/TODO markers; every step has runnable code or an exact command.
- **Type consistency:** `getActiveBuilderProjects`/`normalize` exported from `routes/builder-projects.js` in Task 4 and consumed identically in Task 5; `p.slug`, `p.is_builder_project`, `p.img_card`/`img_hero` used consistently across Tasks 5, 6, 7, 8.
