# Builder Project Pages — Design Spec

Date: 2026-08-15

## Context

Builder projects (new-launch apartment developments sold on behalf of a builder/promoter) are currently treated as ordinary `properties` rows — filtered into the site as `type=Apartment` under a "Builder Sales" category, and rendered through the generic `views/property.ejs` template used for every resale flat, villa, or plot. This throws away almost everything that makes a builder project different: unit-mix tables, floor-wise breakdowns, RERA registration, promoter/architect credentials, terrace amenities, and (per project) dozens of real site photos and floor-plan renders supplied in `Builder project/`.

Two real projects with real data currently exist in `Builder project/`:
- `Builder project/Kiara breeze/` — 3 BHK-only project, 8 per-flat 3D interior render images, floor-plan + spec sheet image, proximity/highlights image. Builder/developer name is not present anywhere in the source material — legitimately unknown.
- `Builder project/Shambavi  Serendipity Apartment/` — 1/2 BHK + ground-floor shops, full RERA-registered project with promoter (Shetty Barua Enterprises LLP), architect, legal advisor, 40 images (real drone/site photos, elevation render, ~25 interior renders, per-unit floor plans, RERA certificate scan) and a source PDF brochure.

Goal: give each builder project its own rich, SEO-first page that surfaces all of this real data, distinct from the resale-property template, while still surfacing in the general `/properties` search (per stakeholder decision) and ranking for both specific (project name, RERA, promoter) and simple/broad ("flats in Udupi", "3 BHK flat Udupi price") search queries — including for less tech-savvy searchers who don't type deep, specific queries.

## Data Model

New Supabase table `builder_projects` (separate from `properties` — the shape genuinely differs: floor-wise unit tables, RERA/promoter block, multi-config unit mix, typed photo categories; forcing it into `properties.details` JSON would have no display advantage and the page structure is fundamentally different).

```sql
CREATE TABLE IF NOT EXISTS builder_projects (
  id                 TEXT PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  tagline            TEXT,
  positioning        TEXT,
  marketing_desc     TEXT,

  -- Promoter / legal
  promoter           TEXT,
  promoter_office    TEXT,
  registered_office  TEXT,
  architect          TEXT,
  legal_advisor      TEXT,
  partnered_by       TEXT,
  website            TEXT,
  contact_numbers    TEXT,   -- comma separated
  contact_email      TEXT,

  -- RERA
  rera_status        TEXT,             -- 'Approved' | 'Not specified' | ...
  rera_number        TEXT,
  rera_date          TEXT,
  rera_validity      TEXT,
  survey_number      TEXT,
  rera_cert_img      TEXT,             -- URL to the certificate scan, if available

  -- Location
  address            TEXT,
  area               TEXT NOT NULL DEFAULT '',
  loc                TEXT NOT NULL DEFAULT '',
  proximity          JSONB,            -- [{landmark, distance}]

  -- Config
  project_type       TEXT,             -- e.g. 'Residential Apartment Project'
  unit_types         JSONB,            -- [{config:'1 BHK', sizeRange:'480-565 sft', count:3}]
  unit_mix_summary   TEXT,
  floor_breakdown    JSONB,            -- [{floor:'Ground', units:[{flat, config, sqft}], shops:[...]}]
  commercial_shops   JSONB,            -- nullable

  -- Specs (each a bullet array)
  structure_specs    JSONB,
  flooring_specs     JSONB,
  electrical_specs   JSONB,
  doors_windows_specs JSONB,
  kitchen_specs      JSONB,
  bathroom_specs     JSONB,

  -- Amenities / highlights
  amenities          JSONB,            -- common area amenities
  terrace_amenities  JSONB,
  bank_partners      JSONB,
  highlights         JSONB,            -- project highlights/approvals list

  -- Media (typed, not a flat array)
  img_hero           TEXT,
  img_card           TEXT,
  gallery            JSONB,            -- [{url, type, label}] type: site_photo|elevation|interior|unit_plan|master_plan|document

  -- SEO
  seo_title          TEXT,
  seo_description    TEXT,
  seo_keywords       TEXT,

  status             TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft')),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Per [[migration-004-blocked]], this migration SQL must be handed to the user to paste into the Supabase SQL editor — MCP `apply_migration` will be refused.

Undetermined fields (builder name for Kiara Breeze, price, possession date, land area, etc.) are stored as `NULL`/omitted, not guessed — the page must gracefully hide any section/field that's empty rather than showing "N/A" clutter.

## Media Handling

Every image in both source folders is uploaded (no curation) — including the low-resolution drone shots, since real site photography is limited and shouldn't be dropped. Uploaded via the existing `uploadToCloudinaryBuffer` pattern (`routes/admin.js`) run as a one-time seed script, tagged into `gallery` by type:
- `site_photo` — Shambhavi `6.jpg`–`9.jpg` (real drone/land photos)
- `elevation` — building render (Shambhavi `0.jpg`)
- `interior` — 3D interior renders (Kiara's 8 per-flat renders, Shambhavi's ~25 interior renders)
- `unit_plan` — per-flat floor-plan graphics (Shambhavi `.png` files)
- `master_plan` — Kiara `structure.jpg` (typical floor plan + spec sheet)
- `document` — Shambhavi RERA certificate scan (`56.png`)

Interior/unit-plan images that are visibly labeled with a flat number (e.g. "Flat 2", "Flat 5") get that label captured in `gallery[].label` so the page can pair them with the matching row in the unit-mix table.

## Public Routes

`routes/public.js` (or split into `routes/builder-projects.js` if it grows large):
- `GET /builder-projects` — listing page: grid of project cards (hero img, name, tagline, area, config range, RERA badge).
- `GET /builder-project/:slug` — detail page (new template, below).
- `getAllPublicProperties()` gains builder projects merged in (same pattern as `agent_properties`), flagged `is_builder_project: true`, with a synthesized searchable-text blob (name, area, config, promoter, tagline) fed into `searchAndSortProperties`. Property cards for these entries link to `/builder-project/:slug` instead of `/property/:id`.

## Detail Template (`views/builder-project.ejs`)

Distinct from `property.ejs`. Section order:
1. Hero gallery (reuse the existing lightbox JS/markup pattern from `property.ejs`), grouped tabs by media type if there are 15+ images
2. Tagline / positioning strip
3. Key facts bar: RERA status, promoter, config range, unit count, area
4. Unit Mix table (config × size × count, from `unit_types`), each row optionally linking/expanding to its `unit_plan` image if one exists
5. Floor-wise breakdown (collapsible per floor, from `floor_breakdown`)
6. Amenities (terrace + common, icon grid)
7. Specifications (structure / flooring / electrical / doors / kitchen / bathroom — accordion, not a wall of text)
8. Location & Proximity (landmark distance list, from `proximity`)
9. Promoter / Architect / Legal credibility block
10. RERA compliance panel — number, dates, survey number, registered office, and the actual certificate image if present
11. Site photos section (only rendered if `gallery` has `site_photo` entries)
12. Contact / enquiry (reuse existing `apc-modal` enquiry flow + WhatsApp CTA from `property.ejs`)
13. Similar builder projects

Any section whose backing data is empty is omitted entirely — no placeholder "coming soon" blocks.

## Admin

`routes/admin.js` + `views/admin/builder-projects.ejs`: list + add/edit form mirroring the existing property upload pattern (`upload.fields([...])` → `resolveImg`/Cloudinary), so a third project doesn't require a code change.

## SEO

Two keyword tiers per project, both real (mined from actual brochure data, not invented):
- **Specific/high-intent:** project name variants, promoter name, `"<config> flats <area> Udupi"`, `"RERA approved apartments <area>"`, landmark-anchored (`"flats near Malpe Beach"`, `"flats near NH-66 Udupi"`), architect/promoter searches.
- **Simple/broad (for non-technical searchers):** `"flats in Udupi"`, `"new flats Udupi"`, `"flats for sale in Udupi"`, `"apartment for sale near me Udupi"`, `"<config> flat Udupi price"`, `"buy flat Udupi"`, `"flat booking Udupi"`, `"under construction flats Udupi"`. These also appear in on-page H2/body copy, not just meta tags, since that's what actually ranks for conversational/simple queries.

Per-project `<title>`/meta pattern: `"<Project Name> <Area> — <configs> Flats | RERA <status> | RichManAssets"`.

JSON-LD: `ApartmentComplex` schema (leveraging RERA number, address, amenities) + `BreadcrumbList`, following the existing pattern in `buildPropertiesSEO()` (`routes/public.js`).

`routes/sitemap.js`: add builder-project URLs at priority 0.9 (higher than generic property pages — these are the differentiated, ownable pages).

Internal linking: homepage "Builder Sales" category card → `/builder-projects`; add a builder-projects teaser section on the homepage.

## Verification

- Seed script runs cleanly, both projects visible at `/builder-projects` and their `/builder-project/:slug` pages.
- Every section with data renders; every section without data is cleanly omitted (spot-check Kiara Breeze, which is missing builder name/price/possession — page must not show broken/empty fields).
- Gallery correctly groups images by type; unit-mix rows with a matching `unit_plan` image show it.
- `/properties?q=<broad term like "flats in udupi">` and `?q=<project name>` both surface the builder project.
- View page source: title/meta/JSON-LD present and project-specific; `/sitemap.xml` includes both project URLs.
