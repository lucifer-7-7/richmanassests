'use strict';

require('dotenv').config();

// Fix existing admin properties: set is_dummy: false for any property NOT in seed list
// Seed properties are only those explicitly in HOMES array in data/seed.js

const { getDB } = require('../db/db');

const SEED_PROPERTY_IDS = [
  'mermaid', 'kopparige', 'samudra', 'tara', 'backwater', 'beachfrontplot',
  'coffeeland', 'garadi', 'girija', 'greenfield', 'highwaysite', 'honeyvale',
  'ikigai', 'industrialsite', 'jumeirah', 'metroplaza', 'oceancrest', 'palmgrove',
  'riverfrontsite', 'sandranch', 'sashihitlu', 'sereno', 'skyline', 'tatasth', 'vertex'
];

(async () => {
  try {
    const db = getDB();

    // Get all properties
    const { data: allProps, error: fetchErr } = await db.from('properties').select('id');
    if (fetchErr) throw fetchErr;

    console.log(`Found ${allProps.length} total properties`);

    // Filter to non-seed properties
    const adminProps = allProps.filter(p => !SEED_PROPERTY_IDS.includes(p.id));
    console.log(`${adminProps.length} admin-uploaded properties to fix`);

    if (adminProps.length === 0) {
      console.log('No admin properties to update');
      process.exit(0);
    }

    // Update all non-seed properties to is_dummy: false
    const adminPropIds = adminProps.map(p => p.id);
    const { error: updateErr } = await db
      .from('properties')
      .update({ is_dummy: false })
      .in('id', adminPropIds);

    if (updateErr) throw updateErr;
    console.log(`✓ Updated ${adminPropIds.length} admin properties to is_dummy: false`);

    // Verify
    const { data: verified, error: verifyErr } = await db
      .from('properties')
      .select('id, is_dummy')
      .in('id', adminPropIds.slice(0, 3));

    if (verifyErr) throw verifyErr;
    console.log('Sample verification:');
    verified.forEach(p => console.log(`  ${p.id}: is_dummy=${p.is_dummy}`));

    console.log('\nFix complete. Dummy toggle will now work correctly:');
    console.log('  - Seed data (is_dummy=true) hides when toggle OFF');
    console.log('  - Admin uploads (is_dummy=false) always visible');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
