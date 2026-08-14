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
